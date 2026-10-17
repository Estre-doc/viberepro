import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

const allowed = new Set(['MIT', 'ISC', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', '0BSD', 'CC0-1.0', 'BlueOak-1.0.0', '(MIT OR CC0-1.0)', '(MIT AND BSD-3-Clause)', '(Apache-2.0 OR MIT)']);
const records = new Map();
const virtualStore = 'node_modules/.pnpm';
for (const dir of await readdir(virtualStore, { withFileTypes: true })) {
  if (!dir.isDirectory() || dir.name === 'node_modules') continue;
  const mods = join(virtualStore, dir.name, 'node_modules');
  for (const entry of await readdir(mods, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue; // Symlinks point to dependencies inventoried in their own store entry.
    const candidates = entry.name.startsWith('@') ? (await readdir(join(mods, entry.name))).map(n => join(mods, entry.name, n)) : [join(mods, entry.name)];
    for (const folder of candidates) {
      const pkg = JSON.parse(await readFile(join(folder, 'package.json'), 'utf8'));
      const key = `${pkg.name}@${pkg.version}`;
      if (records.has(key)) continue;
      const license = typeof pkg.license === 'string' ? pkg.license : pkg.license?.type ?? 'UNKNOWN';
      const knownBuildOnlyMpl = license === 'MPL-2.0' && /^lightningcss(?:-|$)/.test(pkg.name);
      if (!allowed.has(license) && !knownBuildOnlyMpl) throw new Error(`License review required: ${key}: ${license}`);
      const files = (await readdir(folder)).filter(n => /^(licen[cs]e|copying|notice)(\.|$|-)/i.test(n)).sort();
      let text = '';
      for (const file of files) text += `\n--- ${file} ---\n${await readFile(join(folder, file), 'utf8')}\n`;
      let licenseSource = 'Package license files';
      if (!files.length) {
        const readme = (await readdir(folder)).find(n => /^readme(\.|$)/i.test(n));
        if (readme) {
          const contents = await readFile(join(folder, readme), 'utf8');
          const start = contents.search(/(?:^|\n)#{0,4}\s*Licen[cs]e/i);
          if (start >= 0) { text = `\n--- ${readme}: license section ---\n${contents.slice(start)}\n`; licenseSource = 'Package README license section'; }
        }
        // Some upstream packages ship SPDX metadata plus a license URL instead of
        // a standalone file. Preserve that source verbatim; never invent a grant.
        if (!text) { text = `\n--- package.json license declaration ---\n${JSON.stringify({ license, repository: pkg.repository }, null, 2)}\n`; licenseSource = 'SPDX metadata only; upstream package omits full license text (development/native tool)'; }
        if (['playwright', 'playwright-core', 'react', 'react-dom', 'scheduler', 'lucide-react'].includes(pkg.name)) throw new Error(`Distributed package lacks full license text: ${key}`);
      }
      records.set(key, { name: pkg.name, version: pkg.version, license, licenseSource, buildOnlyMpl: knownBuildOnlyMpl, text, licenseSha256: createHash('sha256').update(text).digest('hex') });
    }
  }
}
const packages = [...records.values()].sort((a, b) => `${a.name}@${a.version}`.localeCompare(`${b.name}@${b.version}`));
const root = JSON.parse(await readFile('package.json', 'utf8'));
for (const name of [...Object.keys(root.dependencies), ...Object.keys(root.devDependencies)]) {
  if (!packages.some(p => p.name === name)) throw new Error(`Direct dependency missing from audit: ${name}`);
}
if (process.argv.includes('--check')) {
  const notices = await readFile('THIRD_PARTY_NOTICES.txt', 'utf8');
  // Git checks text out with LF on Linux, while upstream license files can
  // contain CRLF even inside the same tarball. Compare their text consistently.
  const normalizeEol = text => text.replace(/\r\n?/g, '\n');
  // These packages are distributed in the npm runtime or embedded in report.html.
  for (const name of ['playwright', 'playwright-core', 'react', 'react-dom', 'scheduler', 'lucide-react']) {
    const pkg = packages.find(p => p.name === name);
    if (!pkg || !normalizeEol(notices).includes(normalizeEol(`===== ${pkg.name}@${pkg.version} (${pkg.license}) =====${pkg.text}`))) throw new Error(`Distributed notices are stale or incomplete: ${name}`);
  }
  console.log(`License audit passed: ${packages.length} installed packages. Distributed notices verified; lightningcss MPL-2.0 is build-only (not vendored). See docs/DEPENDENCIES.json for metadata-only upstream exceptions.`);
} else {
  await mkdir('docs', { recursive: true });
  await writeFile('docs/DEPENDENCIES.json', JSON.stringify({
    note: 'Installed dependency inventory. Optional native packages vary by platform; CI audits its own installed graph. Chromium is downloaded separately and is not redistributed in this package.',
    packages: packages.map(p => ({ name: p.name, version: p.version, license: p.license, licenseSource: p.licenseSource, buildOnlyMpl: p.buildOnlyMpl, licenseSha256: p.licenseSha256 }))
  }, null, 2) + '\n');
  const preface = `VibeRepro third-party notices\nGenerated from installed package license files.\nRuntime: playwright, playwright-core. Embedded report: react, react-dom, scheduler, lucide-react.\nOther entries are development/build tools. Chromium is downloaded separately by Playwright; its own license and third-party notices apply.\n`;
  await writeFile('THIRD_PARTY_NOTICES.txt', preface + packages.map(p => `\n===== ${p.name}@${p.version} (${p.license}) =====${p.text}`).join(''));
  console.log(`Generated notices and inventory for ${packages.length} installed packages.`);
}
