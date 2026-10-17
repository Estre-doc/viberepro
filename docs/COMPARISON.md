# Baselines and regression gates

Create a first scan, apply a repair, and rescan with the same settings:

```sh
pnpm scan http://localhost:3000 --out before
pnpm scan http://localhost:3000 --baseline before/report.json --out after --fail-on-new
```

No previous screenshots or browser session are required to compare observations. The JSON is enough. Baselines must be VibeRepro schema 1.0 reports; malformed or inconsistent inputs are rejected before scanning. Keep sensitive real reports out of Git.

| State | Meaning |
| --- | --- |
| New | Current observation has no matching baseline observation |
| Still present | Matching failure was observed again |
| Resolved | Baseline failure was absent on a complete visit to the same requested route, final route, and viewport |
| Unverified | Baseline failure was absent, but that route was missing, failed, partial, or redirected elsewhere |

Resolved means **no longer observed**, not proof that the application is correct. If any baseline visit is not completely covered again, even a previously healthy visit, the comparison is partial. A partial baseline also makes the comparison partial. Additional current routes can introduce new observations.

## Matching

Matching uses requested route, observed page route, viewport name/width/height, kind, severity, and kind-specific identity:

| Kind | Identity |
| --- | --- |
| JavaScript / navigation | Message; own scan origin is normalized |
| HTTP | Resource URL, status, method, resource type |
| Transport | Resource URL, browser failure text, method, resource type |
| Broken image | Selector and image URL |
| Document overflow | Candidate selector; changing pixel measurements do not mean a new failure |

Own-origin URLs match by path and query, allowing a new local hostname or port. External resource origins and query strings remain exact. Confirm both origins represent the same app. Changing dynamic error messages or selectors can produce new/resolved pairs; do not interpret observation matching as root-cause analysis. Viewports remain separate observations, and HTTP/image findings can share a cause.

Target path/query, viewport definitions, page cap, timeout, observation window, and external-resource policy must match. A mismatch is rejected before creating output or starting Chromium. Browser version differences are reported; use the same browser/environment for a reliable comparison.

## Exit codes

| Flag | 0 | 1 | 2 |
| --- | --- | --- | --- |
| No gate | Complete scan/comparison | — | Operational failure or partial scan/comparison |
| `--fail-on-issues` | No current findings | Current findings exist | Operational failure or partial scan/comparison |
| `--fail-on-new` (requires baseline) | No new findings; known ones may remain | New findings exist | Operational failure or partial scan/comparison |

The flags are mutually exclusive. Incomplete coverage always takes precedence. `report.json` embeds the comparison; `comparison.json` contains the same comparison on its own. `summary.md` contains a bounded Markdown summary with page-supplied HTML, links, mentions, and Markdown escaped.

## GitHub Actions

In this repository, CI verifies the full repair demo and uploads the local fixture reports. That is a working example you can inspect after pushing to GitHub.

For another app, install the release package when published (or install the locally packed tarball), install Chromium/system dependencies, start your app, wait for readiness, and use its CLI. The following steps assume `viberepro` is installed as a dependency, the app is already listening on port 3000, and `baseline/report.json` is a reviewed baseline produced with these same settings:

```yaml
- name: Scan and compare
  run: pnpm exec viberepro http://127.0.0.1:3000 --baseline baseline/report.json --out browser-report --fail-on-new
- name: Add job summary
  if: always()
  shell: bash
  run: |
    if [ -f browser-report/summary.md ]; then
      cat browser-report/summary.md >> "$GITHUB_STEP_SUMMARY"
    fi
- name: Keep evidence, including failed gates
  if: always()
  uses: actions/upload-artifact@v7
  with:
    name: browser-evidence
    path: browser-report/
    if-no-files-found: ignore
    retention-days: 7
```

Do not add `continue-on-error` to the scan step: that hides the regression gate. Refresh a baseline through review, not automatically when a gate fails. Review report contents before uploading artifacts from private apps. [GitHub job summaries](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-commands#adding-a-job-summary), [artifact action](https://github.com/actions/upload-artifact).

## Programmatic comparison

```js
import { readReport, compareReports } from 'viberepro';

const before = await readReport('before/report.json');
const after = await readReport('after/report.json');
const comparison = compareReports(before, after);
console.log(comparison.summary);
```

This performs no browser launch, model request, or network access. Imported report JSON is limited to 25 MiB; older nested comparisons are discarded when loading a baseline.

## Report design

Keep the existing evidence inspector and add a compact comparison above it. Navy `#172c3d` carries text; teal `#006b70` marks resolved observations and selected filters; red `#a22c36` and amber `#71520b` distinguish new and unverified observations with text labels. White and blue-grey surfaces keep screenshots legible. Use the existing offline system type and monospace only for raw evidence. Four counts share one row, followed by the coverage explanation and expandable baseline records. At 390px, the inspector stacks vertically and the comparison remains within the viewport. No external fonts or services are needed.
