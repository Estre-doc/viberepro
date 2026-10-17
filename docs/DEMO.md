# A repeatable repair demo

Run `pnpm demo:generate` after dependency and browser installation. It builds the package, uses an automatically assigned loopback port, and writes a new `viberepro-report-demo-<timestamp>/` directory on every run. Existing demo reports are preserved.

The script scans the broken Bug Lab, applies predefined repairs to that fixture, and scans again using the first report as its baseline. The repairs restore the image and API responses, remove the seeded exception, and let the oversized panel fit its container. They do not hide failures or disable detectors. This is a deterministic demonstration of verification; it does not involve a model or repair arbitrary source code.

The result is **11 → 0 observations**, with 11 resolved, 0 new, and 0 unverified. Open the printed `before/report.html` and `after/report.html` files. The script checks that all observations are resolved, updates README screenshots and `docs/assets/demo-result.json`, then stops its server even on failure. The previously healthy control page remains part of both scans.

To choose an output directory, run `pnpm build` followed by `node scripts/capture-demo.mjs my-demo`. Each `before/` and `after/` folder must be new or empty.

For a recording, start `pnpm demo` in one terminal and run this in another:

```sh
pnpm scan http://127.0.0.1:4173 --out take-001
```

1. Show the Bug Lab at desktop size, then 390px wide: its oversized panel pushes the document sideways.
2. Run the single scan command. The CLI writes the HTML report, JSON evidence, repair brief, Markdown summary, and screenshots.
3. Open `take-001/report.html` directly. Select “Broken images”, then filter to mobile. The screenshot is a real mobile viewport scrolled to the target. Desktop findings can have element crops.
4. Select “Mobile overflow”. Show measured viewport/document widths and the CSS selector candidate. Expand full viewport context.
5. Open the repair brief. Copy it into the coding assistant you already use, alongside your local repository. VibeRepro does not call the assistant or edit code.
6. Show the generated demo's after-report: 11 resolved observations, no new findings, and the rechecked page screenshot. Expand the baseline observations to show exactly what disappeared.

The expected 11 records are: 2 uncaught errors, 4 HTTP failures, 2 transport failures, 2 broken-image observations, and 1 mobile overflow. They describe a smaller set of root causes and should not be presented as 11 unique bugs.

Suggested launch copy: “VibeRepro turns browser failures into an offline evidence pack for your coding agent, then compares the next scan to show what changed. This local fixture goes from 11 observations to zero after predefined repairs. No account or model API key.”

Start with this honest, repeatable demo. Then ask maintainers for permission to run one real reproduction and share the evidence with their approval. Publish limitations and false-positive examples. Do not promise star counts or post on other people's behalf.
