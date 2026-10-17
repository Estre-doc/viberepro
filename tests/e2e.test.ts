import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, access, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { chromium } from 'playwright';
import type { ScanReport } from '../src/types.js';

// Resolve the production artifact at runtime, but type against its source API.
// This allows typechecking a fresh checkout before dist/ has been generated.
const { scan, writeReport }: typeof import('../src/index.js') = await import(pathToFileURL(join(process.cwd(), 'dist/index.js')).href);

// The example is a JS module so contributors can launch it without a build step.
const fixtureModule: unknown = await import(pathToFileURL(join(process.cwd(), 'examples/bug-lab/server.mjs')).href);
assert.ok(typeof fixtureModule === 'object' && fixtureModule !== null && 'createBugLab' in fixtureModule && typeof fixtureModule.createBugLab === 'function');
const makeFixture = fixtureModule.createBugLab as () => { server: Server; hits: { method: string; url: string }[]; repair: () => void };
let fixture: ReturnType<typeof makeFixture>;
let origin: string;
let temp: string;
let report: ScanReport;
let outDir: string;

function runCli(args: string[]) {
  return new Promise<{ code: number | null; output: string }>((resolve, reject) => {
    const child = spawn(process.execPath, ['dist/cli.js', ...args], { windowsHide: true });
    let output = '';
    child.stdout.on('data', d => { output += String(d); });
    child.stderr.on('data', d => { output += String(d); });
    child.on('error', reject);
    child.on('exit', code => resolve({ code, output }));
  });
}

before(async () => {
  temp = await mkdtemp(join(tmpdir(), 'viberepro-test-'));
  fixture = makeFixture();
  await new Promise<void>(resolve => fixture.server.listen(0, '127.0.0.1', resolve));
  const address = fixture.server.address();
  assert.ok(address && typeof address !== 'string');
  origin = `http://127.0.0.1:${address.port}`;
  outDir = join(temp, 'scan');
  ({ report } = await scan({ url: origin, outDir, maxPages: 2, settleMs: 180, concurrency: 2 }));
});
after(async () => {
  fixture?.server.closeAllConnections();
  if (fixture) await new Promise<void>(resolve => fixture.server.close(() => resolve()));
  if (temp) await rm(temp, { recursive: true, force: true });
});

test('detects seeded bugs in both viewports, with inspectable evidence', async () => {
  assert.equal(report.status, 'complete');
  assert.equal(report.summary.urls, 2);
  assert.equal(report.summary.pageVisits, 4);
  const kinds = new Set(report.issues.map(i => i.kind));
  for (const kind of ['pageerror', 'http-error', 'request-failed', 'broken-image', 'horizontal-overflow']) assert.ok(kinds.has(kind as typeof report.issues[number]['kind']), kind);
  assert.ok(report.issues.filter(i => i.kind === 'horizontal-overflow').every(i => i.viewport.name === 'mobile'));
  assert.equal(report.issues.find(i => i.kind === 'broken-image')?.selector, '#broken-cover');
  assert.ok(report.issues.filter(i => i.kind === 'pageerror').every(i => i.selector === null && i.selectorReason));
  assert.equal(report.issues.filter(i => new URL(i.url).pathname === '/healthy').length, 0);
  for (const issue of report.issues) { assert.ok(issue.screenshot); await access(join(outDir, issue.screenshot)); }
  const mobileOverflow = report.issues.find(i => i.kind === 'horizontal-overflow');
  assert.ok(mobileOverflow?.screenshot);
  assert.equal(mobileOverflow.screenshotType, 'scrolled-viewport');
  const png = await readFile(join(outDir, mobileOverflow.screenshot));
  assert.equal(png.readUInt32BE(16), 390, 'Mobile evidence must preserve viewport width instead of using an unreliable wide element clip');
  assert.equal(png.readUInt32BE(20), 844);
  const parsed = JSON.parse(await readFile(join(outDir, 'report.json'), 'utf8')) as ScanReport;
  assert.equal(parsed.issues.length, report.issues.length);
  assert.match(await readFile(join(outDir, 'fix-prompt.md'), 'utf8'), /UNTRUSTED DATA/);
});

test('offline file:// report renders, filters, opens brief, and makes zero network requests', async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.addInitScript(() => Object.defineProperty(navigator, 'clipboard', { value: undefined }));
    const errors: string[] = [];
    const remote: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('request', r => { if (/^https?:/.test(r.url())) remote.push(r.url()); });
    await page.goto(pathToFileURL(join(outDir, 'report.html')).href);
    await page.getByRole('heading', { name: 'Every bug needs a receipt.' }).waitFor();
    await page.locator('aside').getByRole('button', { name: /^Broken images/ }).click();
    assert.equal(await page.locator('.finding').count(), 2);
    await page.getByLabel('Filter viewport').selectOption('mobile');
    assert.equal(await page.locator('.finding').count(), 1);
    await page.getByRole('button', { name: 'Copy selector' }).click();
    await page.getByRole('dialog', { name: 'Copy text manually' }).waitFor();
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await page.getByRole('button', { name: 'Open repair brief' }).click();
    assert.match(await page.getByLabel('Repair brief text').inputValue(), /UNTRUSTED DATA/);
    await page.keyboard.press('Shift+Tab');
    assert.equal(await page.getByRole('button', { name: 'Copy brief' }).evaluate(el => el === document.activeElement), true);
    await page.keyboard.press('Tab');
    assert.equal(await page.getByRole('button', { name: 'Close', exact: true }).evaluate(el => el === document.activeElement), true);
    await page.keyboard.press('Escape');
    assert.equal(await page.getByRole('dialog').count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Open repair brief' }).evaluate(el => el === document.activeElement), true);
    await page.getByLabel('Search findings').fill('not-a-real-selector');
    assert.equal(await page.locator('.finding').count(), 0);
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true);
    assert.deepEqual(errors, []);
    assert.deepEqual(remote, []);
    const imageCount = await page.locator('img').count();
    // Clear the search to verify images embedded in the actual selected evidence.
    await page.getByLabel('Search findings').fill('');
    assert.ok(await page.locator('img').count() > imageCount);
    assert.equal(await page.locator('.screenshot img').evaluate(el => el instanceof HTMLImageElement && el.complete && el.naturalWidth > 0), true);
  } finally { await browser.close(); }
});

test('HTML escapes hostile evidence instead of executing it', async () => {
  const malicious = '</script><script>globalThis.__viberepro_injected=true</script><img src="https://outside.invalid/x">';
  const modified = structuredClone(report);
  assert.ok(modified.issues[0]);
  modified.issues[0].message = malicious;
  modified.issues[0].title = malicious;
  await writeReport(modified, outDir);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(pathToFileURL(join(outDir, 'report.html')).href);
    await page.getByRole('heading', { name: 'Every bug needs a receipt.' }).waitFor();
    assert.equal(await page.evaluate(() => '__viberepro_injected' in globalThis), false);
    assert.ok((await page.locator('.detail').innerText()).includes(malicious));
  } finally { await browser.close(); await writeReport(report, outDir); }
});

test('guards enforce page cap, block writes and external redirects without false positives', async () => {
  fixture.hits.length = 0;
  const { report: safety } = await scan({ url: `${origin}/safety`, outDir: join(temp, 'safety'), maxPages: 3, settleMs: 100, concurrency: 2 });
  assert.equal(safety.summary.urls, 3);
  assert.ok(safety.skipped.some(s => s.reason === 'Excluded sensitive path'));
  assert.ok(safety.skipped.some(s => s.reason === 'Query links are not crawled'));
  assert.equal(fixture.hits.some(h => h.method !== 'GET'), false);
  assert.equal(fixture.hits.some(h => /mutate|delete|logout|ws/.test(h.url)), false);
  assert.equal(safety.issues.some(i => i.kind === 'broken-image' && i.selector === '#blocked-image'), false);
  assert.equal(safety.issues.some(i => i.kind === 'request-failed' && i.message.includes('blocked.png')), false);
  assert.ok(safety.pages.some(p => p.blockedRequests > 0));
  assert.ok(safety.pages.every(p => new URL(p.url).origin === origin));
  const redirect = await scan({ url: `${origin}/redirect-out`, outDir: join(temp, 'redirect'), maxPages: 1, viewport: 'desktop', settleMs: 0 });
  assert.equal(redirect.report.status, 'partial');
  assert.ok(redirect.report.pages[0]?.blockedRequests);
  const permitted = await scan({ url: `${origin}/redirect-in`, outDir: join(temp, 'redirect-in'), maxPages: 1, viewport: 'desktop', settleMs: 0 });
  assert.equal(permitted.report.pages[0]?.url, `${origin}/healthy`);
  assert.equal(permitted.report.issues.length, 0);
  const capped = await scan({ url: origin, outDir: join(temp, 'cap'), maxPages: 1, viewport: 'desktop', settleMs: 100 });
  assert.equal(capped.report.summary.pageVisits, 1);
  assert.ok(capped.report.skipped.some(s => s.reason === 'Page limit reached'));
});

test('timeouts are explicit partial reports and nonempty output is never overwritten', async () => {
  const { report: partial } = await scan({ url: `${origin}/slow`, outDir: join(temp, 'slow'), maxPages: 1, viewport: 'desktop', timeoutMs: 200, settleMs: 0 });
  assert.equal(partial.status, 'partial');
  assert.ok(partial.issues.some(i => i.kind === 'navigation-error'));
  await assert.rejects(() => scan({ url: origin, outDir }), /not empty/);
});

test('runtime evidence keeps the URL at observation when a page changes route', async () => {
  const result = await scan({ url: `${origin}/history-change`, outDir: join(temp, 'history'), maxPages: 1, viewport: 'desktop', settleMs: 180 });
  assert.equal(result.report.status, 'partial');
  assert.equal(result.report.pages[0]?.url, `${origin}/new-path`);
  assert.equal(result.report.issues.find(i => i.message.includes('Before history change'))?.url, `${origin}/history-change`);
  assert.equal(result.report.issues.find(i => i.message.includes('After history change'))?.url, `${origin}/new-path`);
});

test('CLI exit codes and package help are usable without a source loader', async () => {
  const run = runCli;
  assert.equal((await run(['--version'])).output.trim(), '0.1.0');
  assert.equal((await run(['--help'])).code, 0);
  assert.equal((await run(['https://example.com'])).code, 2);
  assert.equal((await run([origin, '--viewport', 'tablet'])).code, 2);
  const found = await run([origin, '--out', join(temp, 'cli-findings'), '--max-pages', '1', '--viewport', 'desktop', '--settle', '120', '--fail-on-issues']);
  assert.equal(found.code, 1, found.output);
  const clean = await run([`${origin}/healthy`, '--out', join(temp, 'cli-clean'), '--max-pages', '1', '--viewport', 'mobile', '--settle', '0']);
  assert.equal(clean.code, 0, clean.output);
  const partial = await run([`${origin}/slow`, '--out', join(temp, 'cli-partial'), '--max-pages', '1', '--viewport', 'desktop', '--timeout', '200', '--settle', '0']);
  assert.equal(partial.code, 2, partial.output);
  const require = createRequire(import.meta.url);
  await access(join(require.resolve('playwright/package.json'), '..', 'cli.js'));
});

test('baseline CLI gates new findings, preserves known issues, verifies repairs, and renders changes offline', async () => {
  const lab = makeFixture();
  await new Promise<void>(resolve => lab.server.listen(0, '127.0.0.1', resolve));
  const address = lab.server.address();
  assert.ok(address && typeof address !== 'string');
  const url = `http://127.0.0.1:${address.port}`;
  const browser = await chromium.launch();
  try {
    const before = await scan({ url, outDir: join(temp, 'before-repair'), maxPages: 2, viewport: 'mobile', settleMs: 150 });
    const baseline = join(before.outDir, 'report.json');
    const args = [url, '--max-pages', '2', '--viewport', 'mobile', '--settle', '150', '--baseline', baseline];
    const knownDir = join(temp, 'known');
    const known = await runCli([...args, '--out', knownDir, '--fail-on-new']);
    assert.equal(known.code, 0, known.output);
    assert.match(known.output, /0 new · 6 still present/);
    assert.equal((await runCli([url, '--fail-on-new'])).code, 2);
    assert.equal((await runCli([...args, '--out', join(temp, 'all-issues'), '--fail-on-issues'])).code, 1);
    const incompatible = join(temp, 'incompatible');
    const mismatch = await runCli([...args, '--out', incompatible, '--settle', '0']);
    assert.equal(mismatch.code, 2);
    assert.match(mismatch.output, /Cannot compare different scan settings/);
    await assert.rejects(() => access(incompatible));
    const cleanBaseline = structuredClone(before.report);
    cleanBaseline.issues = []; cleanBaseline.summary.issues = 0; cleanBaseline.summary.errors = 0; cleanBaseline.summary.warnings = 0;
    const cleanFile = join(temp, 'hypothetical-clean.json');
    await writeFile(cleanFile, JSON.stringify(cleanBaseline));
    const added = await runCli([url, '--max-pages', '2', '--viewport', 'mobile', '--settle', '150', '--baseline', cleanFile, '--out', join(temp, 'new-findings'), '--fail-on-new']);
    assert.equal(added.code, 1, added.output);
    assert.match(added.output, /6 new/);
    const page = await browser.newPage();
    const remote: string[] = [], errors: string[] = [];
    page.on('request', r => { if (/^https?:/.test(r.url())) remote.push(r.url()); });
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(pathToFileURL(join(knownDir, 'report.html')).href);
    await page.getByRole('heading', { name: 'Changes from baseline' }).waitFor();
    await page.getByRole('button', { name: /^0 New$/ }).click();
    assert.equal(await page.locator('.finding').count(), 0);
    await page.getByRole('button', { name: 'Show all findings' }).click();
    assert.equal(await page.locator('.finding').count(), 6);
    await page.getByRole('button', { name: /^6 Still present$/ }).click();
    assert.equal(await page.locator('.finding').count(), 6);
    lab.repair();
    const afterDir = join(temp, 'after-repair');
    const fixed = await runCli([...args, '--out', afterDir, '--fail-on-new']);
    assert.equal(fixed.code, 0, fixed.output);
    assert.match(fixed.output, /0 new · 0 still present · 6 resolved · 0 unverified/);
    const parsed = JSON.parse(await readFile(join(afterDir, 'report.json'), 'utf8')) as ScanReport;
    assert.equal(parsed.issues.length, 0);
    assert.equal(parsed.comparison?.status, 'complete');
    await access(join(afterDir, 'comparison.json'));
    assert.match(await readFile(join(afterDir, 'summary.md'), 'utf8'), /Resolved/);
    await page.goto(pathToFileURL(join(afterDir, 'report.html')).href);
    await page.getByRole('heading', { name: 'Changes from baseline' }).waitFor();
    await page.getByText('Review 6 baseline observations').click();
    assert.equal(await page.locator('.previous-findings p').count(), 6);
    for (const width of [390, 760, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true, `${width}px report overflow`);
    }
    assert.deepEqual(remote, []); assert.deepEqual(errors, []);
    const partialBaseline = structuredClone(before.report);
    partialBaseline.status = 'partial'; partialBaseline.pages[0]!.status = 'partial';
    const partialFile = join(temp, 'partial-baseline.json');
    await writeFile(partialFile, JSON.stringify(partialBaseline));
    const partial = await runCli([url, '--max-pages', '2', '--viewport', 'mobile', '--settle', '150', '--baseline', partialFile, '--out', join(temp, 'partial-comparison'), '--fail-on-new']);
    assert.equal(partial.code, 2, partial.output);
  } finally {
    await browser.close(); lab.server.closeAllConnections();
    await new Promise<void>(resolve => lab.server.close(() => resolve()));
  }
});

test('configured concurrency is an actual upper bound on simultaneous page visits', async () => {
  let active = 0;
  let peak = 0;
  const server = createServer((req, res) => {
    active++; peak = Math.max(peak, active);
    const timer = setTimeout(() => {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`<html><head><link rel="icon" href="data:,"></head><body>${['/a', '/b', '/c', '/d'].map(p => `<a href="${p}">page</a>`).join('')}<p>${req.url}</p></body></html>`);
    }, 60);
    res.on('close', () => { active--; clearTimeout(timer); });
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  try {
    const result = await scan({ url: `http://127.0.0.1:${address.port}`, outDir: join(temp, 'concurrency'), maxPages: 5, concurrency: 2, viewport: 'desktop', settleMs: 0 });
    assert.equal(result.report.summary.urls, 5);
    assert.ok(peak <= 2, `Peak requests: ${peak}`);
    assert.ok(peak >= 2, 'Fixture should exercise parallel scheduling');
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});
