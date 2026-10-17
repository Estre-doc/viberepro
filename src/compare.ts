import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import type { Issue, PageResult, ReportComparison, ScanConfig, ScanReport, Viewport } from './types.js';

const kinds = new Set(['pageerror', 'http-error', 'request-failed', 'broken-image', 'horizontal-overflow', 'navigation-error']);
const record = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const text = (v: unknown): v is string => typeof v === 'string';
const count = (v: unknown): v is number => Number.isSafeInteger(v) && Number(v) >= 0;
const nullableText = (v: unknown) => v === null || text(v);
const viewport = (v: unknown): v is Viewport => record(v) && ['desktop', 'mobile'].includes(String(v.name)) && count(v.width) && v.width > 0 && count(v.height) && v.height > 0;
function httpUrl(v: unknown): v is string {
  if (!text(v)) return false;
  try { const u = new URL(v); return ['http:', 'https:'].includes(u.protocol) && !u.username && !u.password; } catch { return false; }
}

/** Validate only the supported report schema, never execute or fetch report data. */
export function assertScanReport(value: unknown): asserts value is ScanReport {
  const invalid = () => { throw new Error('Invalid VibeRepro report: expected schemaVersion 1.0 report.json with valid scan data.'); };
  if (!record(value) || value.schemaVersion !== '1.0' || !record(value.tool) || value.tool.name !== 'VibeRepro' || !text(value.tool.version) || !text(value.tool.browser)) return invalid();
  if (!['complete', 'partial'].includes(String(value.status)) || !text(value.startedAt) || !Number.isFinite(Date.parse(value.startedAt)) || !text(value.completedAt) || !Number.isFinite(Date.parse(value.completedAt))) return invalid();
  const c = value.config;
  if (!record(c) || !httpUrl(c.url) || !text(c.origin) || new URL(c.url).origin !== c.origin || !Array.isArray(c.viewports) || !c.viewports.length || !c.viewports.every(viewport)) return invalid();
  if (!count(c.maxPages) || c.maxPages < 1 || c.maxPages > 50 || !count(c.concurrency) || c.concurrency < 1 || c.concurrency > 8 || !count(c.timeoutMs) || c.timeoutMs < 100 || c.timeoutMs > 60000 || !count(c.settleMs) || c.settleMs > 10000 || typeof c.allowPublic !== 'boolean' || typeof c.allowExternalResources !== 'boolean') return invalid();
  const viewportKeys = new Set(c.viewports.map(viewportKey));
  if (c.viewports.length > 2 || viewportKeys.size !== c.viewports.length) return invalid();
  if (!Array.isArray(value.pages) || !value.pages.length || value.pages.length > 100 || !Array.isArray(value.issues) || value.issues.length > 10000 || !Array.isArray(value.skipped)) return invalid();
  const pageIds = new Set<string>();
  const pages = new Map<string, Record<string, unknown>>();
  for (const p of value.pages) {
    if (!record(p) || !text(p.id) || pageIds.has(p.id) || !httpUrl(p.requestedUrl) || !httpUrl(p.url) || !text(p.title) || !viewport(p.viewport) || !viewportKeys.has(viewportKey(p.viewport)) || !['complete', 'partial', 'failed'].includes(String(p.status)) || !nullableText(p.screenshot) || !count(p.durationMs) || !count(p.blockedRequests) || !(p.httpStatus === null || count(p.httpStatus)) || !Array.isArray(p.warnings) || !p.warnings.every(text)) return invalid();
    if (new URL(p.requestedUrl).origin !== c.origin || new URL(p.url).origin !== c.origin) return invalid();
    pageIds.add(p.id); pages.set(p.id, p);
  }
  const issueIds = new Set<string>();
  for (const i of value.issues) {
    if (!record(i) || !text(i.id) || issueIds.has(i.id) || !text(i.pageId) || !pageIds.has(i.pageId) || !kinds.has(String(i.kind)) || !['error', 'warning'].includes(String(i.severity)) || !text(i.title) || !text(i.message) || !httpUrl(i.url) || !viewport(i.viewport) || !nullableText(i.selector) || !nullableText(i.screenshot) || !['viewport', 'element', 'scrolled-viewport'].includes(String(i.screenshotType)) || !record(i.evidence)) return invalid();
    if (new URL(i.url).origin !== c.origin || viewportKey(i.viewport) !== viewportKey(pages.get(i.pageId)!.viewport as Viewport) || !Object.values(i.evidence).every(v => v === null || text(v) || typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v)))) return invalid();
    issueIds.add(i.id);
  }
  if (value.status === 'complete' && value.pages.some(p => p.status !== 'complete')) return invalid();
  if (!value.skipped.every(s => record(s) && text(s.url) && text(s.reason))) return invalid();
  const s = value.summary;
  if (!record(s) || !count(s.urls) || s.urls !== new Set(value.pages.map(p => p.requestedUrl)).size || s.pageVisits !== value.pages.length || s.issues !== value.issues.length || s.errors !== value.issues.filter(i => i.severity === 'error').length || s.warnings !== value.issues.filter(i => i.severity === 'warning').length) return invalid();
}

export async function readReport(file: string): Promise<ScanReport> {
  if ((await stat(file)).size > 25 * 1024 * 1024) throw new Error('Report JSON exceeds the 25 MiB comparison limit.');
  let parsed: unknown;
  try { parsed = JSON.parse(await readFile(file, 'utf8')); } catch { throw new Error(`Could not parse report JSON: ${file}`); }
  assertScanReport(parsed);
  // Historical comparisons are not inputs to the next comparison.
  delete parsed.comparison;
  return parsed;
}

function localUrl(url: string, origin: string): string {
  try { const u = new URL(url); return u.origin === origin ? `${u.pathname}${u.search}` : u.href; } catch { return url; }
}
const viewportKey = (v: Viewport) => `${v.name}:${v.width}x${v.height}`;
const visitKey = (p: PageResult, origin: string) => `${localUrl(p.requestedUrl, origin)}|${viewportKey(p.viewport)}`;

export function assertComparableConfig(before: ScanConfig, after: ScanConfig): void {
  const differences: string[] = [];
  if (localUrl(before.url, before.origin) !== localUrl(after.url, after.origin)) differences.push('target path/query');
  if (before.viewports.map(viewportKey).sort().join() !== after.viewports.map(viewportKey).sort().join()) differences.push('viewports');
  for (const key of ['maxPages', 'timeoutMs', 'settleMs', 'allowExternalResources'] as const) if (before[key] !== after[key]) differences.push(key);
  if (differences.length) throw new Error(`Cannot compare different scan settings (${differences.join(', ')}). Rerun with the baseline settings from report.json.`);
}

function fingerprint(issue: Issue, report: ScanReport): string {
  const e = issue.evidence;
  const ownUrl = (v: unknown) => typeof v === 'string' ? localUrl(v, report.config.origin) : v ?? null;
  // Resource identity survives a new dev-server port. Error messages stay exact
  // except for this report's own origin; dimensions/stack line shifts are noise.
  const identity = issue.kind === 'http-error' ? [ownUrl(e.resourceUrl), e.status, e.method, e.resourceType]
    : issue.kind === 'request-failed' ? [ownUrl(e.resourceUrl), e.error, e.method, e.resourceType]
    : issue.kind === 'broken-image' ? [issue.selector, ownUrl(e.resourceUrl)]
    : issue.kind === 'horizontal-overflow' ? [issue.selector]
    : [issue.message.replaceAll(report.config.origin, '<scan-origin>')];
  const page = report.pages.find(p => p.id === issue.pageId)!;
  return createHash('sha256').update(JSON.stringify([visitKey(page, report.config.origin), ownUrl(issue.url), issue.kind, issue.severity, identity])).digest('hex');
}

/** Compare observations, preserving absence of coverage as unverified. */
export function compareReports(before: ScanReport, after: ScanReport): ReportComparison {
  assertScanReport(before); assertScanReport(after);
  assertComparableConfig(before.config, after.config);
  const pending = new Map<string, Issue[]>();
  for (const i of before.issues) {
    const key = fingerprint(i, before);
    pending.set(key, [...(pending.get(key) ?? []), i]);
  }
  const result: ReportComparison = {
    schemaVersion: '1.0', baseline: { url: before.config.url, startedAt: before.startedAt, status: before.status },
    status: before.status === 'complete' && after.status === 'complete' ? 'complete' : 'partial',
    summary: { added: 0, unchanged: 0, resolved: 0, unverified: 0 },
    added: [], unchanged: [], resolved: [], unverified: [], notes: []
  };
  for (const i of after.issues) {
    const matched = pending.get(fingerprint(i, after))?.shift();
    (matched ? result.unchanged : result.added).push(i.id);
  }
  const currentPages = new Map(after.pages.map(p => [visitKey(p, after.config.origin), p]));
  const uncovered = before.pages.filter(oldPage => {
    const page = currentPages.get(visitKey(oldPage, before.config.origin));
    return page?.status !== 'complete' || localUrl(page.url, after.config.origin) !== localUrl(oldPage.url, before.config.origin);
  });
  if (uncovered.length) {
    result.status = 'partial';
    result.notes.push(`${uncovered.length} baseline page visits lack complete coverage of the same final route, including visits that previously had no findings.`);
  }
  for (const i of [...pending.values()].flat()) {
    const oldPage = before.pages.find(p => p.id === i.pageId)!;
    const page = currentPages.get(visitKey(oldPage, before.config.origin));
    const covered = page?.status === 'complete' && localUrl(page.url, after.config.origin) === localUrl(oldPage.url, before.config.origin);
    (covered ? result.resolved : result.unverified).push(i);
  }
  for (const key of ['added', 'unchanged', 'resolved', 'unverified'] as const) result.summary[key] = result[key].length;
  if (result.unverified.length) { result.status = 'partial'; result.notes.push('Some baseline findings were not rechecked on a complete visit to the same route. They are unverified, not resolved.'); }
  if (before.status !== 'complete' || after.status !== 'complete') result.notes.push('At least one scan is partial. This comparison cannot provide a complete regression gate.');
  if (before.config.origin !== after.config.origin) result.notes.push('Origins differ. Own-origin URLs are matched by path/query; confirm both scans represent the same application. External resource origins stay exact.');
  if (before.tool.browser !== after.tool.browser) result.notes.push('Chromium versions differ. Browser or environment changes can affect findings.');
  return result;
}
