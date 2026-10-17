# Local validation — October 17, 2026

Executed on Windows x64 with Node.js **22.13.1**, pnpm **11.25.0**, Playwright **1.64.1**, and its downloaded Chromium **156.0.8078.4**. All scans used loopback fixtures; no third-party website was scanned.

| Check | Actual result |
| --- | --- |
| `pnpm install --frozen-lockfile` | Passed; lockfile accepted |
| Fresh-source `pnpm typecheck` | Passed with `dist/` temporarily absent; no generated declaration prerequisite |
| `pnpm check` | Passed: strict TypeScript, ESLint, warning-free production build, **24/24 tests**, license audit |
| `pnpm pack:smoke` | Passed: fresh temporary npm consumer, 3 installed packages, no React/Vite runtime requirement, installer, offline npm exec, 6 mobile findings, repeat scan with 0 new / 6 still present, and imported comparison API |
| `npm pack` | Passed; prepack build/license gates, 19 packaged files, CLI, declarations, and offline report assets included; 193,550-byte tarball at the time of this check |
| `pnpm demo:generate` | Complete: 2 URLs / 4 visits per scan; 11 → 0 observations, 11 resolved / 0 new / 0 unverified; healthy control preserved; automatic free port and fresh output directory |
| Screenshot review | Desktop and 390px reports visually inspected before/after; fixed page screenshot and comparison history available; mobile evidence preserves the actual scrolled 390×844 viewport |

The original scanner checks, retained in the expanded suite, verify:

1. All five seeded detector kinds in a real Chromium browser; reliable DOM hints, explicit null runtime selectors, screenshots, healthy-page negative control, and mobile evidence dimensions.
2. A generated `file://` report renders with **zero HTTP(S) requests and zero page errors**; kind/viewport/search filters, manual clipboard fallback, repair brief, embedded images, 390px layout, modal focus cycling, Escape, and focus restoration work.
3. A literal script-ending payload in evidence displays as data and cannot execute.
4. Page cap, GET-only traffic, sensitive/query/external exclusions, no WebSocket arrival, policy-blocked image suppression, blocked cross-origin redirect, and successful permitted same-origin redirect.
5. A timeout produces a partial report with navigation evidence; nonempty output cannot be overwritten.
6. Errors retain their observed URLs before and after a history change; unstable-route coverage is marked partial.
7. Built CLI version/help, bad permission/options, and exit codes 0/1/2 work without a TypeScript runtime loader.
8. A fixture with delayed responses proves the configured concurrency bound is respected and actually exercises two parallel URLs.
9. Protocol, credentials, permission, numeric bounds, and sensitive seed validation.
10. Same-origin candidate normalization and path/query/asset exclusions.
11. Request method and external-navigation policy.
12. JSON embedding round-trips hostile characters without allowing HTML script termination.

The additional comparison coverage verifies:

- Independent viewport objects per configuration (fixing shared mutable state).
- Matching across local host/port changes and stack-line shifts without relying on issue IDs.
- New and resolved observations when total finding counts stay unchanged.
- Stable overflow identity and network attribution; significant external origins, resource paths, and HTTP status changes.
- Missing, partial, failed, or redirected visits stay unverified; missing previously healthy visits also make the comparison partial.
- Partial baselines cannot pass a complete regression gate; changed observation settings are rejected.
- Imported schema checks, invalid JSON, inconsistent summaries, orphaned observations, and viewport mismatches.
- Shareable Markdown escaping for HTML, image syntax, mentions, table separators, and newlines.
- Built CLI end-to-end: known findings pass `--fail-on-new`, new findings exit 1, incompatible scope creates no output, predefined fixture repairs produce 6 resolved mobile observations, partial comparisons exit 2.
- Comparison filters, baseline history, zero remote requests/page errors, and layouts at 390 / 760 / 1024 / 1440px in real Chromium.

Demo observations are **4 HTTP failures**, **2 transport failures**, **2 JavaScript exceptions**, **2 broken-image observations**, and **1 mobile document overflow**. Counts are per viewport; HTTP/image findings can share a cause. The measured mobile document width is 778px in a 390px viewport, with `#too-wide` as a candidate. It is not a claim of 11 independent bugs.

The license check covers **122 installed packages** on this platform. Full notices for runtime/embedded libraries are verified. Build-only Lightning CSS is MPL-2.0; metadata-only upstream development/native-package cases are recorded in the inventory. See `DEPENDENCIES.md`.

This table records local Windows checks. Hosted Linux Node 22/24 and Windows Node 22 results are available in the repository's [CI runs](https://github.com/Estre-doc/viberepro/actions/workflows/ci.yml); consult the run for the release commit rather than treating a configured workflow as proof of success. npm registry publication is deferred at the maintainer's request. External public-site scans and authenticated/interactive flows were not tested. Name checks are point-in-time lookups, not a reservation or trademark clearance.
