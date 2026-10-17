import { createHash } from 'node:crypto';
import { mkdir, readdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { chromium, type Browser, type Request } from 'playwright';
import { crawlCandidate, requestPolicy, resolveConfig } from './policy.js';
import { inspectDom } from './probe.js';
import { writeReport } from './report.js';
import { assertComparableConfig, compareReports, readReport } from './compare.js';
import type { Issue, IssueDraft, PageResult, ScanConfig, ScanOptions, ScanReport, Viewport } from './types.js';

const id = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 20);
const message = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 4000);
const MAX_ISSUES = 100;

async function visit(browser: Browser, url: string, viewport: Viewport, config: ScanConfig, outDir: string) {
  const began = Date.now();
  const pageId = id(`${url}|${viewport.name}`);
  const result: PageResult = {
    id: pageId, requestedUrl: url, url, title: '', viewport, status: 'complete', httpStatus: null,
    durationMs: 0, screenshot: null, warnings: [], blockedRequests: 0
  };
  const issues: Issue[] = [];
  const drafts: IssueDraft[] = [];
  const keys = new Set<string>();
  const blocked = new Set<Request>();
  const blockedUrls = new Set<string>();
  let collecting = true;
  let links: string[] = [];
  let redirectTo: string | null;
  const add = (draft: IssueDraft) => {
    if (!collecting) return;
    const key = JSON.stringify([draft.kind, draft.selector, draft.message]);
    if (keys.has(key)) return;
    keys.add(key);
    if (drafts.length >= MAX_ISSUES) {
      if (!result.warnings.includes('Issue limit reached (100 per page visit).')) {
        result.warnings.push('Issue limit reached (100 per page visit).');
        result.status = 'partial';
      }
      return;
    }
    drafts.push(draft);
  };
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    isMobile: viewport.name === 'mobile', hasTouch: viewport.name === 'mobile',
    deviceScaleFactor: 1, serviceWorkers: 'block', acceptDownloads: false,
    userAgent: 'VibeRepro/0.1.0 (Chromium; local evidence scanner)',
    reducedMotion: 'reduce'
  });
  try {
    await context.route('**/*', async route => {
      const req = route.request();
      const reason = requestPolicy(req.url(), req.method(), req.isNavigationRequest(), config);
      if (reason) {
        blocked.add(req);
        blockedUrls.add(req.url());
        result.blockedRequests++;
        await route.abort('blockedbyclient');
      } else if (req.isNavigationRequest()) {
        // Chromium may follow HTTP redirects without invoking a route again.
        // Fetch each document hop without redirects, check it, then navigate
        // the browser explicitly so relative assets use the final document URL.
        try {
          const response = await route.fetch({ maxRedirects: 0, timeout: config.timeoutMs });
          const location = response.headers()['location'];
          if (response.status() >= 300 && response.status() < 400 && location) {
            const next = new URL(location, req.url()).href;
            const redirectReason = requestPolicy(next, 'GET', true, config);
            if (redirectReason) {
              blocked.add(req); blockedUrls.add(next); result.blockedRequests++;
              result.warnings.push(`Redirect blocked: ${redirectReason}: ${next}`);
              await route.abort('blockedbyclient');
            } else {
              redirectTo = next;
              await route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>Following permitted redirect</title>' });
            }
          } else await route.fulfill({ response });
          await response.dispose();
        } catch (e) {
          result.warnings.push(`Document request failed: ${message(e)}`);
          await route.abort('failed');
        }
      } else await route.continue();
    });
    await context.routeWebSocket('**/*', socket => { result.blockedRequests++; socket.close(); });
    const page = await context.newPage();
    page.setDefaultTimeout(Math.min(config.timeoutMs, 5000));
    page.on('dialog', dialog => { void dialog.dismiss().catch(e => result.warnings.push(`Dialog: ${message(e)}`)); });
    context.on('page', popup => { if (popup !== page) void popup.close().catch(e => result.warnings.push(`Popup: ${message(e)}`)); });
    page.on('pageerror', error => add({
      kind: 'pageerror', severity: 'error', title: 'Uncaught JavaScript error', message: message(error),
      selector: null, selectorReason: 'Runtime errors do not identify a DOM element.',
      evidence: { stack: (error.stack ?? error.message).slice(0, 8000), observedPageUrl: page.url() }
    }));
    page.on('response', response => {
      if (response.status() >= 400) add({
        kind: 'http-error', severity: 'error', title: `HTTP ${response.status()} resource`,
        message: `${response.status()} ${response.statusText()}: ${response.url()}`.slice(0, 4000),
        selector: null,
        evidence: { resourceUrl: response.url(), status: response.status(), resourceType: response.request().resourceType(), method: response.request().method(), observedPageUrl: page.url() }
      });
    });
    page.on('requestfailed', request => {
      const error = request.failure()?.errorText ?? 'Unknown transport failure';
      // Policy aborts and browser cancellation are not application failures.
      if (!blocked.has(request) && !error.includes('ERR_ABORTED')) add({
        kind: 'request-failed', severity: 'error', title: 'Network request failed',
        message: `${error}: ${request.url()}`.slice(0, 4000), selector: null,
        evidence: { resourceUrl: request.url(), error, resourceType: request.resourceType(), method: request.method(), observedPageUrl: page.url() }
      });
    });
    try {
      let next = url;
      for (let hops = 0; hops <= 5; hops++) {
        redirectTo = null;
        const response = await page.goto(next, { waitUntil: 'load', timeout: config.timeoutMs });
        result.httpStatus = response?.status() ?? null;
        if (!redirectTo) break;
        if (hops === 5) throw new Error('Navigation exceeded the limit of 5 same-origin redirects.');
        next = redirectTo;
      }
    } catch (e) {
      result.status = 'partial';
      result.warnings.push(`Navigation did not finish: ${message(e)}`);
      add({ kind: 'navigation-error', severity: 'error', title: 'Page navigation incomplete', message: message(e),
        selector: null, selectorReason: 'Navigation failure applies to the whole page.', evidence: { requestedUrl: url, timeoutMs: config.timeoutMs } });
    }
    if (page.url().startsWith(config.origin + '/') || page.url() === config.origin) {
      result.url = page.url();
      await page.waitForTimeout(config.settleMs);
      if (page.url() !== result.url) {
        result.status = 'partial';
        result.warnings.push('Page URL changed during observation; event evidence retains its observed URL.');
        result.url = page.url();
      }
      result.title = await page.title();
      const dom = await inspectDom(page, viewport.name === 'mobile', [...blockedUrls]);
      links = dom.links;
      if (dom.truncated) { result.warnings.push('DOM inspection limits reached; some elements were not inspected.'); result.status = 'partial'; }
      for (const draft of drafts) {
        if (!draft.selector && typeof draft.evidence.resourceUrl === 'string') {
          draft.selector = dom.resources.find(r => r.url === draft.evidence.resourceUrl)?.selector ?? null;
          if (!draft.selector) draft.selectorReason = 'No matching DOM resource element (for example, fetch or CSS resource).';
        }
      }
      for (const img of dom.images) add({
        kind: 'broken-image', severity: 'error', title: 'Image could not be decoded',
        message: `Visible image finished loading with naturalWidth = 0: ${img.src}`.slice(0, 4000),
        selector: img.selector, evidence: { resourceUrl: img.src, alt: img.alt, complete: true, naturalWidth: 0 }
      });
      for (const el of dom.overflow) add({
        kind: 'horizontal-overflow', severity: 'warning', title: 'Mobile horizontal overflow',
        message: `Document width is ${dom.scrollWidth}px in a ${dom.width}px viewport. Candidate: ${el.selector}`,
        selector: el.selector,
        evidence: { viewportWidth: dom.width, documentWidth: dom.scrollWidth, overflowPx: dom.scrollWidth - dom.width,
          elementLeft: el.left, elementRight: el.right, elementWidth: el.width, attribution: 'Candidate element; confirm the root CSS cause.' }
      });
    } else {
      result.status = 'failed';
      result.warnings.push('No inspectable same-origin document loaded.');
    }
    collecting = false;
    try {
      result.screenshot = `evidence/${pageId}-page.png`;
      await page.screenshot({ path: join(outDir, result.screenshot), timeout: 5000, animations: 'disabled' });
    } catch (e) {
      result.screenshot = null;
      result.status = 'partial';
      result.warnings.push(`Page screenshot unavailable: ${message(e)}`);
    }
    for (const draft of drafts) {
      const issueId = id(`${pageId}|${draft.kind}|${draft.selector}|${draft.message}`);
      const observedUrl = draft.evidence.observedPageUrl;
      const issue: Issue = { ...draft, id: issueId, pageId, url: typeof observedUrl === 'string' && observedUrl.startsWith(config.origin + '/') ? observedUrl : result.url, viewport, screenshot: result.screenshot, screenshotType: 'viewport' };
      if (draft.selector && ['broken-image', 'horizontal-overflow'].includes(draft.kind)) {
        try {
          const locator = page.locator(draft.selector);
          if (await locator.count() === 1) {
            const file = `evidence/${issueId}.png`;
            if (viewport.name === 'mobile') {
              // Mobile visual viewport offsets can make Chromium's element clip
              // target the wrong page region when document width overflows.
              // A scrolled viewport capture preserves the actual mobile view.
              await locator.scrollIntoViewIfNeeded({ timeout: 2000 });
              await page.screenshot({ path: join(outDir, file), timeout: 5000, animations: 'disabled' });
              issue.screenshotType = 'scrolled-viewport';
            } else {
              await locator.screenshot({ path: join(outDir, file), timeout: 2000, animations: 'disabled' });
              issue.screenshotType = 'element';
            }
            issue.screenshot = file;
          }
        } catch (e) {
          issue.screenshotError = `Element capture unavailable; page capture used. ${message(e)}`;
        }
      }
      issues.push(issue);
    }
  } catch (e) {
    result.status = 'failed';
    result.warnings.push(`Page inspection failed: ${message(e)}`);
    // A failed DOM probe must not erase errors already observed on the page.
    for (const draft of drafts) {
      const issueId = id(`${pageId}|${draft.kind}|${draft.selector}|${draft.message}`);
      if (!issues.some(i => i.id === issueId)) issues.push({ ...draft, id: issueId, pageId, url: result.url, viewport, screenshot: result.screenshot, screenshotType: 'viewport' });
    }
  } finally {
    result.durationMs = Date.now() - began;
    await context.close();
  }
  return { page: result, issues, links };
}

/** Scan one permitted origin. Writes artifacts; never rewrites application source. */
export async function scan(options: ScanOptions): Promise<{ report: ScanReport; outDir: string }> {
  const config = resolveConfig(options);
  const baseline = options.baseline ? await readReport(options.baseline) : undefined;
  if (baseline) assertComparableConfig(baseline.config, config);
  const outDir = resolve(options.outDir ?? `viberepro-report-${new Date().toISOString().replace(/[:.]/g, '-')}`);
  await mkdir(outDir, { recursive: true });
  if ((await readdir(outDir)).length) throw new Error(`Output directory is not empty: ${outDir}. Choose a new --out directory.`);
  await mkdir(join(outDir, 'evidence'));
  let browser: Browser;
  try {
    browser = await chromium.launch({ headless: true, executablePath: options.browserExecutable });
  } catch (e) {
    throw new Error(`Chromium could not start. Run "viberepro install" first. ${message(e)}`, { cause: e });
  }
  const report: ScanReport = {
    schemaVersion: '1.0', tool: { name: 'VibeRepro', version: '0.1.0', browser: browser.version() },
    startedAt: new Date().toISOString(), completedAt: '', status: 'complete', config,
    summary: { urls: 0, pageVisits: 0, issues: 0, errors: 0, warnings: 0 }, pages: [], issues: [], skipped: []
  };
  const pending = [config.url];
  const seen = new Set(pending);
  const skipped = new Set<string>();
  try {
    while (pending.length && report.summary.urls < config.maxPages) {
      const batch = pending.splice(0, Math.min(config.concurrency, config.maxPages - report.summary.urls));
      const results = await Promise.all(batch.map(async url => {
        const visits = [];
        for (const viewport of config.viewports) visits.push(await visit(browser, url, viewport, config, outDir));
        return visits;
      }));
      report.summary.urls += batch.length;
      for (const visits of results) for (const v of visits) {
        report.pages.push(v.page);
        report.issues.push(...v.issues);
        for (const href of v.links) {
          const candidate = crawlCandidate(href, config);
          if (candidate.reason) {
            const key = candidate.url + candidate.reason;
            if (!skipped.has(key) && report.skipped.length < 500) { report.skipped.push({ url: candidate.url, reason: candidate.reason }); skipped.add(key); }
          } else if (!seen.has(candidate.url) && seen.size < 500) {
            seen.add(candidate.url);
            pending.push(candidate.url);
          }
        }
      }
    }
    for (const url of pending) if (report.skipped.length < 500) report.skipped.push({ url, reason: 'Page limit reached' });
  } finally { await browser.close(); }
  report.completedAt = new Date().toISOString();
  report.status = report.pages.every(p => p.status === 'complete') ? 'complete' : 'partial';
  report.summary.pageVisits = report.pages.length;
  report.summary.issues = report.issues.length;
  report.summary.errors = report.issues.filter(i => i.severity === 'error').length;
  report.summary.warnings = report.issues.filter(i => i.severity === 'warning').length;
  if (baseline) report.comparison = compareReports(baseline, report);
  await writeReport(report, outDir);
  return { report, outDir };
}
