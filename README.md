# VibeRepro

[![CI](https://github.com/Estre-doc/viberepro/actions/workflows/ci.yml/badge.svg)](https://github.com/Estre-doc/viberepro/actions/workflows/ci.yml)

**Give your coding agent a browser bug it can reproduce.**

Scan your app. Get browser errors, failed requests, broken images, and mobile overflow—with URLs, viewports, DOM hints, and real screenshots. Hand the offline evidence pack to your coding agent, then rescan to see what changed.

No account. No AI API key. No cloud upload. MIT licensed.

![A real VibeRepro report from the included Bug Lab](docs/assets/report.png)

**v0.1.0:** [npm package](https://www.npmjs.com/package/viberepro) · [GitHub downloads](https://github.com/Estre-doc/viberepro/releases/tag/v0.1.0).

[中文说明](README.zh-CN.md) · [Demo](docs/DEMO.md) · [Baseline & CI](docs/COMPARISON.md) · [Agent handoff](docs/AGENT-HANDOFF.md) · [Roadmap](docs/ROADMAP.md)

## Quick start

Requires Node.js 22.13+. Install Chromium once, then scan your running app:

```sh
npx viberepro@0.1.0 install
npx viberepro@0.1.0 http://localhost:3000 --out before
# After reviewing and applying repairs:
npx viberepro@0.1.0 http://localhost:3000 --baseline before/report.json --out after --fail-on-new
```

Open `before/report.html` or `after/report.html` directly. No pnpm, account, or model API key is needed to use the published CLI.

## See the repair loop

Requires **Node.js 22.13+** and **pnpm 11.25.0**. From this checkout:

```sh
git clone https://github.com/Estre-doc/viberepro.git
cd viberepro
pnpm install --frozen-lockfile
pnpm browser:install
pnpm demo:generate
```

One command builds the CLI, starts the local Bug Lab on a free port, scans it, applies the fixture's predefined repairs, and scans again with a baseline. It closes the server automatically and prints paths to both offline reports. It does not use an AI model or edit your application.

The included fixture produces **11 → 0 findings**, across 2 URLs and 4 viewport visits, with **11 resolved / 0 new / 0 unverified**. HTTP and broken-image observations can share a root cause. [Actual demo result](docs/assets/demo-result.json).

![After the fixture repairs: 11 resolved observations, zero new findings](docs/assets/comparison.png)

To explore the broken page yourself, run `pnpm demo`. In another terminal:

```sh
pnpm scan http://127.0.0.1:4173 --out my-first-report
```

Open `my-first-report/report.html` directly from your file manager. No report server is needed. Each run needs a new or empty output directory.

## Scan → repair → verify

```sh
pnpm scan http://localhost:3000 --out before
# Give before/fix-prompt.md and your repository to your coding agent.
# Review and apply the repair, then use the same scan settings:
pnpm scan http://localhost:3000 --baseline before/report.json --out after --fail-on-new
```

The report separates **new**, **still present**, **resolved**, and **unverified** observations. A missing or incomplete page visit never proves a fix. Changed scan settings are rejected before launching Chromium. Own-origin paths match across local port changes; external resource origins remain significant.

`--fail-on-new` exits 1 for new findings, 0 when there are no new findings, and 2 for an incomplete scan or comparison. Existing findings remain visible. Use `--fail-on-issues` to gate on every current finding instead. [Matching rules, caveats, and CI example](docs/COMPARISON.md).

## Scan your app

```sh
# Local app
pnpm scan http://localhost:3000 --out repro-001

# A public origin you explicitly have permission to scan
pnpm scan https://your-permitted-site.example --allow-public --max-pages 3 --out repro-002

# Allow CDN assets when needed for an accurate rendering
pnpm scan http://localhost:3000 --allow-external-resources --out repro-003

# Gate CI on findings; exit 1 means findings, exit 2 means incomplete/failed scan
pnpm scan http://localhost:3000 --fail-on-issues --out repro-ci
```

To install the built CLI directly from the GitHub release, only Node.js is required:

```sh
npm install --global https://github.com/Estre-doc/viberepro/releases/download/v0.1.0/viberepro-0.1.0.tgz
viberepro install
viberepro http://localhost:3000 --out before
viberepro http://localhost:3000 --baseline before/report.json --out after --fail-on-new
```

Alternatively, download `viberepro-0.1.0.tgz` from the [release](https://github.com/Estre-doc/viberepro/releases/tag/v0.1.0) and run it without a global install:

```sh
npm exec --yes --package ./viberepro-0.1.0.tgz -- viberepro install
npm exec --yes --package ./viberepro-0.1.0.tgz -- viberepro http://127.0.0.1:4173 --out packed-report
```

`viberepro scan <url>` is also accepted. `--help` lists every option. Existing nonempty output directories are refused to prevent stale evidence or accidental overwrites.

On Windows PowerShell, use `npm.cmd` for the `npm exec` examples so `--` and the CLI options are forwarded correctly. [Maintainer publishing guide](docs/NPM-PUBLISHING.md).

## What is in the pack?

| File | Purpose |
| --- | --- |
| `report.json` | Versioned schema, scan settings, page diagnostics, stable issue IDs, structured evidence |
| `report.html` | React report with filtering, search, viewport selection, screenshots, and repair brief; scripts, styles, and images are embedded |
| `fix-prompt.md` | Repository-aware repair instructions plus raw evidence for a coding agent; no model call is made |
| `summary.md` | Shareable Markdown for a GitHub Issue or Actions job summary |
| `comparison.json` | New/current IDs, resolved/unverified baseline evidence, coverage notes; written with `--baseline` |
| `evidence/*.png` | Viewport captures, desktop element crops, and mobile captures scrolled to the target; referenced by relative paths in JSON |

The HTML opens via `file://` without network requests. It can be shared as one file; keep the JSON, Markdown, and PNGs together for the complete machine-readable pack. The JSON/summary download links need their sibling files. Clipboard access varies by browser; a manual text-copy dialog is provided. Dialogs support keyboard focus, Tab cycling, and Escape.

## Where it fits

| Your goal | Use |
| --- | --- |
| Write interaction tests and compare expected screenshots | [Playwright](https://playwright.dev/docs/test-snapshots) |
| Audit performance and enforce Lighthouse budgets | [Lighthouse CI](https://github.com/GoogleChrome/lighthouse-ci) |
| Collect failures from initial page loads and hand evidence to a coding agent, without writing tests first | **VibeRepro** |

VibeRepro uses Playwright's Chromium automation. Baseline comparison matches detected observations; it does not compare image pixels or replace tests for your application's behavior.

## Detection scope

| Signal | Evidence | Attribution |
| --- | --- | --- |
| Uncaught `pageerror` | Error message and stack | No fabricated selector |
| HTTP 4xx / 5xx | Resource URL, status, method, resource type | DOM element if matched |
| Transport failure | Browser network failure and resource URL | DOM element if matched; fetch requests can have no element |
| Broken image | Visible, loaded `<img>` with `complete=true`, `naturalWidth=0` | CSS selector and element/viewport screenshot |
| Mobile overflow | Document width exceeds mobile width by more than 2px | Candidate elements and measured bounds |
| Navigation failure | Timeout or blocked/failed navigation | Whole-page diagnostics; scan marked partial |

HTTP errors and transport failures are separate: a 404 is a response, not a `requestfailed` event. Broken-image and HTTP findings can share a cause. Viewport observations are intentionally kept separate.

Selectors identify the observed DOM, not source lines. A JavaScript error or API failure may have no reliable selector; `selector: null` and `selectorReason` explain this. Overflow candidates are clues, not proven CSS root causes. Network failures can depend on the environment.

## Boundaries and limits

- Fresh Chromium contexts; no browser login sessions, credentials, forms, or clicks. Desktop **1440×900** and mobile **390×844** are emulated viewports, not real-device tests.
- Default **5 unique requested URLs**, **2 concurrent URLs**; hard caps 50 and 8. The two viewports of each URL run sequentially. Fragment links deduplicate; query links, asset links, and known sensitive paths are excluded. The seed URL may have a query.
- Crawl and document navigation stay on the exact origin, including port and scheme. Up to five permitted same-origin redirects are checked individually. Supply the final HTTPS URL for an HTTP→HTTPS redirect.
- Only GET/HEAD requests are allowed. Writes, WebSockets, service workers, downloads, popup navigation, and common action paths are blocked. GET endpoints can still have side effects: scan only pages you control or have permission to visit. This is a conservative browser visitor, not a security sandbox for hostile sites.
- External resources are blocked by default and omitted from failure detection. Use `--allow-external-resources` to permit passive third-party GET/HEAD assets; that can contact third-party services and alter results. External document navigation remains blocked.
- Initial load plus a bounded observation window (default 1 second); no interaction coverage or automatic scrolling. Unloaded lazy images, shadow DOM, iframe DOM, CSS backgrounds, accessibility, SEO, and visual comparison are outside this version's scope.
- Navigation timeout defaults to 15 seconds (per hop); per-visit limits: 100 findings, 10,000 DOM elements, 30 broken images, 10 overflow candidates. Truncation and operational failures are reported. A clean report does not prove a bug-free site.
- Reports preserve page URLs, stacks, and screenshots. Review local artifacts before sharing them. Untrusted page evidence is escaped in HTML and explicitly labeled as data in the repair brief.

## Develop

```sh
pnpm check          # typecheck, lint, production build, real Chromium tests, license audit
pnpm pack:smoke     # install packed runtime in a fresh temp consumer and run npm exec
npm pack --dry-run  # inspect publishing contents, including prepack build/license gate
pnpm names:check    # recheck names; does not reserve or publish anything
```

The repository is one publishable package with `src/`, `report-ui/`, and `examples/`. This keeps the MVP install and release path small while preserving scanner/UI boundaries. No monorepo orchestrator or backend is needed. Runtime dependency: Playwright. React/Vite and icon tooling are development dependencies; the compiled report UI is bundled in `dist/`.

GitHub Actions runs on Linux (Node 22 and 24) and Windows (Node 22). It installs Chromium, runs the checks, verifies the packed consumer, and checks the npm file list. A workflow file is included; hosted runs require pushing this checkout to GitHub.

## License and contribution

[MIT](LICENSE). See [third-party notices](THIRD_PARTY_NOTICES.txt), [installed dependency inventory](docs/DEPENDENCIES.json), and [dependency notes](docs/DEPENDENCIES.md). Chromium is downloaded separately and has its own notices.

Found a false positive or a missed failure? A small, permitted reproduction is the most useful contribution. See [CONTRIBUTING.md](CONTRIBUTING.md) and the [contributor roadmap](docs/ROADMAP.md). Share real before/after evidence with unchanged scan settings.
