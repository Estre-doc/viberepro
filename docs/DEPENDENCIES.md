# Dependency and name checks

Names were queried before implementation on October 17, 2026. See `NAME_CHECK.json` for timestamps, URLs, HTTP status, and GitHub counts. npm `viberepro` returned 404; GitHub's global `VibeRepro in:name` search returned zero repositories. Search does not reserve a name. A GitHub owner was not selected, and trademarks remain unverified.

`scripts/licenses.mjs` audits SPDX declarations for every installed package in pnpm's store. It rejects unreviewed licenses, preserves available upstream license/notice text, generates `DEPENDENCIES.json`, and verifies notices for all six runtime/embedded packages. Optional native packages vary by OS; CI audits what it installs rather than assuming a Windows inventory also describes Linux.

Runtime: `playwright` and `playwright-core` (Apache-2.0). Embedded report: `react`, `react-dom`, `scheduler` (MIT), and `lucide-react` (ISC). Full upstream notices for these distributed packages are included in `THIRD_PARTY_NOTICES.txt`.

Build/development dependencies include MIT, ISC, Apache-2.0, BSD, BlueOak-1.0.0, and **MPL-2.0** (`lightningcss` and its platform binary). Lightning CSS is an installed Vite build tool; its source is not copied into this project's runtime bundle. Its upstream license is preserved. The MIT project license does not replace dependency licenses.

Some upstream development/native packages ship a README license section or SPDX metadata instead of a standalone license file. The inventory's `licenseSource` records that limitation explicitly; the checker does not invent missing license text. These are not included as library source in the runtime distribution. Review their upstream terms if redistributing development tool binaries or a complete dependency installation.

Chromium is separately downloaded by Playwright and is not part of the npm tarball. Its own license and third-party notices apply. This audit records the installed dependency metadata and texts; it does not establish trademark clearance.
