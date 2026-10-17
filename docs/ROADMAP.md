# Roadmap

The focus is a useful loop: observe a browser failure, give an agent the evidence, and verify the next scan. v0.1.0 is distributed through [npm](https://www.npmjs.com/package/viberepro) and [GitHub Releases](https://github.com/Estre-doc/viberepro/releases). These are priorities, not promised dates.

## Implemented locally

- Bounded Chromium scans with desktop/mobile evidence and honest attribution limits.
- Offline HTML, JSON, screenshots, agent repair brief, and shareable Markdown.
- Baseline matching with new/still-present/resolved/unverified states.
- Regression gates that preserve incomplete coverage as exit 2.
- Repeatable broken-to-repaired demo and a healthy control.
- Browser tests, consumer packaging smoke check, license notices, and a Linux/Windows CI configuration.

## Release and adoption priorities

- Keep the GitHub release, repository metadata, and hosted CI results consistent.
- Keep npm installation instructions and runtime packaging checks working for new users.
- Record a short real demo from the included fixture, using the generated reports.
- Gather small, permitted real-app reproductions and publish confirmed limitations alongside them.

See the [release checklist](RELEASING.md). The [demo guide](DEMO.md) includes an accurate description you can use when introducing the project.

## Contributions with clear scope

| Area | Useful contribution | Acceptance |
| --- | --- | --- |
| False positives | Local fixture for an observation that should be suppressed | Positive/control browser cases; no hidden real failures |
| Attribution | Better DOM hints for a reproducible resource failure | Evidence for the match and an explicit null fallback |
| Framework examples | A tiny app showing a real failure and its source fix | Both scans use identical settings; before/after evidence included |
| Report usability | Improve keyboard navigation or finding inspection | Offline rendering, phone layout, and zero remote requests preserved |
| Regression matching | A real dynamic-message or selector case that defeats matching | Explain what identity is stable without merging distinct failures |

## Explore after user feedback

Reviewed ignore rules with reasons and expiry; explicit page lists for deterministic CI coverage; opt-in authenticated scans with private artifact handling. Each needs its own fixtures and documented boundaries before becoming a feature.

The current baseline system compares observations, not pixels. Agent auto-repair, cloud uploads, accounts, and a hosted dashboard are outside the current release. [Contributing](../CONTRIBUTING.md).
