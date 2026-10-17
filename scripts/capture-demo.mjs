import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { createBugLab } from '../examples/bug-lab/server.mjs';
import { scan } from '../dist/index.js';

const { server, repair } = createBugLab();
const output = process.argv[2] ?? `viberepro-report-demo-${Date.now()}`;
await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
try {
  const url = `http://127.0.0.1:${server.address().port}`;
  const { report, outDir } = await scan({ url, outDir: join(output, 'before') });
  console.log(JSON.stringify({ status: report.status, ...report.summary, kinds: Object.fromEntries([...new Set(report.issues.map(i => i.kind))].map(k => [k, report.issues.filter(i => i.kind === k).length])) }, null, 2));
  repair();
  const after = await scan({ url, outDir: join(output, 'after'), baseline: join(outDir, 'report.json') });
  if (after.report.status !== 'complete' || after.report.issues.length || after.report.comparison?.summary.resolved !== report.issues.length) throw new Error('Demo repair verification failed.');
  await mkdir('docs/assets', { recursive: true });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1480, height: 1000 }, deviceScaleFactor: 1 });
    await page.goto(pathToFileURL(join(outDir, 'report.html')).href);
    await page.getByRole('heading', { name: 'Every bug needs a receipt.' }).waitFor();
    await page.screenshot({ path: 'docs/assets/report.png' });
    await page.locator('aside').getByRole('button', { name: /^Mobile overflow/ }).click();
    await page.screenshot({ path: 'docs/assets/mobile-evidence.png' });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: 'docs/assets/report-phone.png', fullPage: true });
    await page.setViewportSize({ width: 1480, height: 1000 });
    await page.goto(pathToFileURL(join(after.outDir, 'report.html')).href);
    await page.getByRole('heading', { name: 'Changes from baseline' }).waitFor();
    await page.screenshot({ path: 'docs/assets/comparison.png' });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: 'docs/assets/comparison-phone.png', fullPage: true });
  } finally { await browser.close(); }
  await writeFile('docs/assets/demo-result.json', JSON.stringify({ generatedAt: report.completedAt, before: report.summary, after: after.report.summary, comparison: after.report.comparison.summary, status: after.report.comparison.status }, null, 2) + '\n');
  console.log(`Verified: ${report.issues.length} → ${after.report.issues.length} findings; ${after.report.comparison.summary.resolved} resolved, 0 new.\nBefore: ${outDir}\nAfter: ${after.outDir}`);
} finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
