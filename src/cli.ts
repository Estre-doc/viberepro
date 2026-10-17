import { parseArgs } from 'node:util';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { scan } from './scanner.js';
import type { ScanOptions } from './types.js';

const help = `VibeRepro 0.1.0 — browser bugs, with receipts.

Usage:
  viberepro <url> [options]
  viberepro scan <url> [options]
  viberepro install              Install Playwright Chromium (first run)

Options:
  --out <directory>              New or empty output folder
  --max-pages <1..50>             Same-origin URLs (default: 5)
  --concurrency <1..8>            Parallel URLs (default: 2)
  --viewport <both|desktop|mobile> (default: both)
  --timeout <milliseconds>       Navigation timeout, 100..60000 (default: 15000)
  --settle <milliseconds>        Observation after load, 0..10000 (default: 1000)
  --allow-public                 Confirm permission for a non-loopback origin
  --allow-external-resources     Allow cross-origin GET/HEAD assets, never navigation
  --browser-executable <path>    Optional compatible Chromium executable
  --baseline <report.json>      Compare with a previous scan using the same settings
  --fail-on-issues               Exit 1 when findings exist
  --fail-on-new                  With --baseline, exit 1 only for new findings
  --help, -h                    Show help
  --version, -v                 Show version

Defaults: no clicks/forms, no writes, no login, same-origin resources only.
Exit: 0 completed; 1 findings (selected gate); 2 operational/incomplete scan or comparison.
`;

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true, strict: true,
    options: {
      out: { type: 'string' }, 'max-pages': { type: 'string' }, concurrency: { type: 'string' },
      viewport: { type: 'string' }, timeout: { type: 'string' }, settle: { type: 'string' },
      'allow-public': { type: 'boolean' }, 'allow-external-resources': { type: 'boolean' },
      'browser-executable': { type: 'string' }, 'fail-on-issues': { type: 'boolean' },
      baseline: { type: 'string' }, 'fail-on-new': { type: 'boolean' },
      help: { type: 'boolean', short: 'h' }, version: { type: 'boolean', short: 'v' }
    }
  });
  if (values.version) { console.log('0.1.0'); return; }
  if (values.help || !positionals.length) { console.log(help); return; }
  if (positionals[0] === 'install') {
    if (positionals.length !== 1) throw new Error('Usage: viberepro install');
    const require = createRequire(import.meta.url);
    const cli = join(dirname(require.resolve('playwright/package.json')), 'cli.js');
    const child = spawn(process.execPath, [cli, 'install', 'chromium'], { stdio: 'inherit', windowsHide: true });
    process.exitCode = await new Promise<number>((resolve, reject) => {
      child.on('error', reject);
      child.on('exit', code => resolve(code ?? 2));
    });
    return;
  }
  const args = positionals[0] === 'scan' ? positionals.slice(1) : positionals;
  if (args.length !== 1 || !args[0]) throw new Error('Provide exactly one target URL. Use --help for examples.');
  if (values.viewport && !['both', 'desktop', 'mobile'].includes(values.viewport)) throw new Error('--viewport must be both, desktop, or mobile.');
  if (values['fail-on-new'] && !values.baseline) throw new Error('--fail-on-new requires --baseline <report.json>.');
  if (values['fail-on-new'] && values['fail-on-issues']) throw new Error('Choose --fail-on-new or --fail-on-issues, not both.');
  const options: ScanOptions = {
    url: args[0], outDir: values.out, maxPages: values['max-pages'] === undefined ? undefined : Number(values['max-pages']),
    concurrency: values.concurrency === undefined ? undefined : Number(values.concurrency),
    timeoutMs: values.timeout === undefined ? undefined : Number(values.timeout),
    settleMs: values.settle === undefined ? undefined : Number(values.settle),
    viewport: values.viewport as ScanOptions['viewport'], allowPublic: values['allow-public'],
    allowExternalResources: values['allow-external-resources'], browserExecutable: values['browser-executable'], baseline: values.baseline
  };
  console.log(`VibeRepro · scanning ${new URL(options.url).origin}`);
  const { report, outDir } = await scan(options);
  console.log(`${report.summary.issues} findings · ${report.summary.urls} URLs · ${report.summary.pageVisits} viewport visits · ${report.status}`);
  if (report.comparison) {
    const s = report.comparison.summary;
    console.log(`Changes: ${s.added} new · ${s.unchanged} still present · ${s.resolved} resolved · ${s.unverified} unverified · ${report.comparison.status}`);
    for (const note of report.comparison.notes) console.log(`Note: ${note}`);
  }
  console.log(`Report: ${outDir}\n  report.html\n  report.json\n  fix-prompt.md\n  summary.md${report.comparison ? '\n  comparison.json' : ''}`);
  if (report.status === 'partial' || report.comparison?.status === 'partial') process.exitCode = 2;
  else if (values['fail-on-new'] && report.comparison?.summary.added) process.exitCode = 1;
  else if (values['fail-on-issues'] && report.issues.length) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(`VibeRepro: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 2;
});
