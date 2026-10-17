import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertScanReport, compareReports, readReport } from '../src/compare.js';
import { createSummary } from '../src/report.js';
import { resolveConfig } from '../src/policy.js';
import type { Issue, ScanReport } from '../src/types.js';

function report(origin = 'http://localhost:3000'): ScanReport {
  const config = resolveConfig({ url: origin, maxPages: 2, viewport: 'mobile' });
  const v = config.viewports[0]!;
  return {
    schemaVersion: '1.0', tool: { name: 'VibeRepro', version: '0.1.0', browser: '156' }, config,
    startedAt: '2026-10-17T12:00:00.000Z', completedAt: '2026-10-17T12:00:01.000Z', status: 'complete',
    summary: { urls: 1, pageVisits: 1, issues: 0, errors: 0, warnings: 0 },
    pages: [{ id: 'page', requestedUrl: `${origin}/`, url: `${origin}/`, title: 'Fixture', viewport: v, status: 'complete', httpStatus: 200, durationMs: 1, screenshot: null, warnings: [], blockedRequests: 0 }],
    issues: [], skipped: []
  };
}
function add(r: ScanReport, overrides: Partial<Issue> = {}) {
  r.issues.push({ id: `issue-${r.issues.length}`, pageId: 'page', kind: 'pageerror', severity: 'error', title: 'Runtime error', message: 'Renderer crashed', url: r.config.url, viewport: r.config.viewports[0]!, selector: null, evidence: {}, screenshot: null, screenshotType: 'viewport', ...overrides });
  r.summary.issues = r.issues.length;
  r.summary.errors = r.issues.filter(i => i.severity === 'error').length;
  r.summary.warnings = r.issues.filter(i => i.severity === 'warning').length;
  return r;
}

test('scan configurations own their viewport objects', () => {
  const first = report(), second = report();
  first.config.viewports[0]!.width = 999;
  assert.equal(second.config.viewports[0]!.width, 390);
  assert.equal(report().config.viewports[0]!.width, 390);
});

test('matches findings across local ports and changed stack line numbers without relying on IDs', () => {
  const before = add(report(), { message: 'Failed at http://localhost:3000/app', evidence: { stack: 'app.js:3' } });
  const after = add(report('http://127.0.0.1:5000'), { id: 'new-id', message: 'Failed at http://127.0.0.1:5000/app', evidence: { stack: 'app.js:9' } });
  const diff = compareReports(before, after);
  assert.deepEqual(diff.summary, { added: 0, unchanged: 1, resolved: 0, unverified: 0 });
  assert.deepEqual(diff.unchanged, ['new-id']);
  assert.match(diff.notes.join(), /Origins differ/);
});

test('reports new and resolved findings even when the total finding count stays the same', () => {
  const before = add(report());
  const after = add(report(), { message: 'A different error' });
  assert.deepEqual(compareReports(before, after).summary, { added: 1, unchanged: 0, resolved: 1, unverified: 0 });
});

test('overflow measurements and DOM attribution do not turn persistent failures into regressions', () => {
  const before = add(report(), { kind: 'horizontal-overflow', selector: '#wide', evidence: { overflowPx: 200 } });
  const after = add(report(), { kind: 'horizontal-overflow', selector: '#wide', message: 'Document overflow changed', evidence: { overflowPx: 100 } });
  assert.equal(compareReports(before, after).summary.unchanged, 1);
  const network = add(report(), { kind: 'http-error', evidence: { resourceUrl: 'http://localhost:3000/image.png', status: 404, method: 'GET', resourceType: 'image' } });
  const attributed = structuredClone(network);
  attributed.issues[0]!.selector = '#image';
  assert.equal(compareReports(network, attributed).summary.unchanged, 1);
  attributed.issues[0]!.evidence.status = 503;
  assert.equal(compareReports(network, attributed).summary.added, 1);
});

test('external resource origins and broken-image resource identity stay significant', () => {
  const before = add(report(), { kind: 'broken-image', selector: '#hero', evidence: { resourceUrl: 'https://cdn.example/a.png' } });
  const after = structuredClone(before);
  after.issues[0]!.evidence.resourceUrl = 'https://other.example/a.png';
  assert.equal(compareReports(before, after).summary.added, 1);
  after.issues[0]!.evidence.resourceUrl = 'https://cdn.example/b.png';
  assert.equal(compareReports(before, after).summary.added, 1);
});

test('an absent, failed, or redirected visit never counts as a resolved baseline finding', () => {
  const before = add(report());
  for (const scenario of ['partial', 'failed', 'missing', 'redirected'] as const) {
    const after = report();
    if (scenario === 'partial' || scenario === 'failed') { after.pages[0]!.status = scenario; after.status = 'partial'; }
    if (scenario === 'missing') { after.pages[0]!.requestedUrl = `${after.config.origin}/other`; after.pages[0]!.url = `${after.config.origin}/other`; }
    if (scenario === 'redirected') after.pages[0]!.url = `${after.config.origin}/other`;
    const diff = compareReports(before, after);
    assert.equal(diff.status, 'partial', scenario);
    assert.deepEqual(diff.summary, { added: 0, unchanged: 0, resolved: 0, unverified: 1 }, scenario);
  }
});

test('partial baselines cannot produce a complete regression gate', () => {
  const before = add(report());
  before.status = 'partial'; before.pages[0]!.status = 'partial';
  assert.equal(compareReports(before, report()).status, 'partial');
});

test('missing a previously healthy route makes comparison coverage incomplete', () => {
  const before = report(), after = report();
  after.pages[0]!.requestedUrl += 'different'; after.pages[0]!.url += 'different';
  const diff = compareReports(before, after);
  assert.equal(diff.status, 'partial');
  assert.equal(diff.summary.unverified, 0);
  assert.match(diff.notes.join(), /previously had no findings/);
});

test('rejects changed scan scope or observation settings', () => {
  const before = report();
  for (const key of ['maxPages', 'timeoutMs', 'settleMs', 'allowExternalResources', 'url', 'viewports'] as const) {
    const after = report();
    if (key === 'allowExternalResources') after.config[key] = true;
    else if (key === 'url') after.config.url += '?different=1';
    else if (key === 'viewports') { after.config.viewports[0]!.width++; after.pages[0]!.viewport.width = after.config.viewports[0]!.width; }
    else after.config[key]++;
    assert.throws(() => compareReports(before, after), /Cannot compare different scan settings/, key);
  }
});

test('validates imported reports instead of accepting forged completion or missing evidence', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'viberepro-compare-'));
  try {
    const file = join(temp, 'report.json');
    const valid = add(report());
    valid.comparison = compareReports(report(), valid);
    await writeFile(file, JSON.stringify(valid));
    assert.equal((await readReport(file)).comparison, undefined);
    for (const mutate of [
      (r: ScanReport) => { r.pages[0]!.status = 'failed'; },
      (r: ScanReport) => { r.issues[0]!.pageId = 'missing'; },
      (r: ScanReport) => { r.summary.issues = 0; },
      (r: ScanReport) => { r.issues[0]!.viewport = { name: 'desktop', width: 1440, height: 900 }; }
    ]) {
      const bad = structuredClone(valid); mutate(bad);
      await writeFile(file, JSON.stringify(bad));
      await assert.rejects(() => readReport(file), /Invalid VibeRepro report/);
    }
    await writeFile(file, '{}'); await assert.rejects(() => readReport(file), /Invalid VibeRepro report/);
    await writeFile(file, '{broken'); await assert.rejects(() => readReport(file), /Could not parse/);
    assert.throws(() => assertScanReport(null), /Invalid VibeRepro report/);
  } finally { await rm(temp, { recursive: true, force: true }); }
});

test('shareable Markdown neutralizes HTML, markdown images, mentions, and table/newline injection', () => {
  const r = add(report(), { title: '<script>bad</script> ![image](https://outside.invalid) @alice |\n## injected' });
  const summary = createSummary(r);
  assert.ok(!summary.includes('<script>'));
  assert.ok(!summary.includes('![image]'));
  assert.ok(!summary.includes('@alice'));
  assert.ok(!summary.includes('\n## injected'));
  assert.match(summary, /&lt;script&gt;/);
  assert.match(summary, /\\\|/);
});
