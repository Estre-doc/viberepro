import { execFileSync, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, writeFile, access, rm, realpath } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { createBugLab } from '../examples/bug-lab/server.mjs';

// Invoke npm's JS entry directly: no shell quoting and no .cmd spawning issues.
const npmCommand = execFileSync(process.platform === 'win32' ? 'where.exe' : 'which', [process.platform === 'win32' ? 'npm.cmd' : 'npm'], { encoding: 'utf8' }).trim().split(/\r?\n/)[0];
const npmCli = process.platform === 'win32' ? join(dirname(npmCommand), 'node_modules/npm/bin/npm-cli.js') : await realpath(npmCommand);
const root = process.cwd();
const temp = await mkdtemp(join(tmpdir(), 'viberepro-pack-'));
const absolute = resolve(temp);
if (!absolute.startsWith(resolve(tmpdir()) + sep) || !absolute.includes('viberepro-pack-')) throw new Error('Refusing cleanup outside generated temp folder.');
const execAsync = promisify(execFile);
const npm = async (args, cwd = temp) => (await execAsync(process.execPath, [npmCli, ...args], { cwd, encoding: 'utf8', windowsHide: true, timeout: 120000, env: { ...process.env, PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '1' } })).stdout;
const { server } = createBugLab();
try {
  // prepack is exercised separately by npm pack; this smoke consumes that build.
  const packed = JSON.parse(await npm(['pack', '--json', '--ignore-scripts', '--pack-destination', temp], root));
  const tarball = join(temp, packed[0].filename);
  const files = packed[0].files.map(f => f.path);
  for (const required of ['dist/cli.js', 'dist/index.js', 'dist/index.d.ts', 'dist/report-ui/report-ui.iife.js', 'dist/report-ui/report-ui.css', 'LICENSE', 'THIRD_PARTY_NOTICES.txt']) assert.ok(files.includes(required), required);
  await writeFile(join(temp, 'package.json'), '{"name":"viberepro-consumer-test","private":true,"type":"module"}\n');
  console.log((await npm(['install', tarball, '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'])).trim());
  await assert.rejects(() => access(join(temp, 'node_modules/react')));
  assert.equal((await npm(['exec', '--offline', '--', 'viberepro', '--version'])).trim(), '0.1.0');
  console.log((await npm(['exec', '--offline', '--', 'viberepro', 'install'])).trim());
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  console.log((await npm(['exec', '--offline', '--', 'viberepro', url, '--out', join(temp, 'evidence-pack'), '--max-pages', '1', '--viewport', 'mobile', '--settle', '150'])).trim());
  const report = JSON.parse(await readFile(join(temp, 'evidence-pack/report.json'), 'utf8'));
  assert.equal(report.status, 'complete');
  assert.ok(report.issues.some(i => i.kind === 'horizontal-overflow'));
  assert.ok(report.issues.some(i => i.kind === 'pageerror'));
  await access(join(temp, 'evidence-pack/report.html'));
  await access(join(temp, 'evidence-pack/fix-prompt.md'));
  await access(join(temp, 'evidence-pack/summary.md'));
  const repeatedDir = join(temp, 'repeat-pack');
  console.log((await npm(['exec', '--offline', '--', 'viberepro', url, '--out', repeatedDir, '--max-pages', '1', '--viewport', 'mobile', '--settle', '150', '--baseline', join(temp, 'evidence-pack/report.json'), '--fail-on-new'])).trim());
  const repeated = JSON.parse(await readFile(join(repeatedDir, 'report.json'), 'utf8'));
  assert.equal(repeated.comparison.summary.added, 0);
  assert.equal(repeated.comparison.summary.unchanged, report.issues.length);
  await access(join(repeatedDir, 'comparison.json'));
  const api = await import(pathToFileURL(join(temp, 'node_modules/viberepro/dist/index.js')).href);
  assert.equal(api.compareReports(report, repeated).summary.added, 0);
  console.log(`Packed consumer smoke passed: ${files.length} packaged files; runtime-only installation; browser installer; npm exec; ${report.issues.length} findings.`);
} finally {
  server.closeAllConnections();
  await new Promise(resolve => server.close(() => resolve()));
  await rm(absolute, { recursive: true, force: true });
}
