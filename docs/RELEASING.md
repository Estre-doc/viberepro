# Publishing v0.1.0

The public repository is [Estre-doc/viberepro](https://github.com/Estre-doc/viberepro), with [v0.1.0 downloads](https://github.com/Estre-doc/viberepro/releases/tag/v0.1.0). npm registry publication is deferred at the maintainer's request. The GitHub release includes the built CLI tarball, source ZIP, and SHA-256 checksums; it does not require npm registry publication.

For subsequent releases:

1. Choose the GitHub owner and confirm the repository name under that owner. Run `pnpm names:check`; npm's 404 is a lookup, not a reservation or guarantee. Verify brand/trademark conflicts separately.
2. Set `repository`, `homepage`, and `bugs` metadata in `package.json` to the actual repository. Do not publish placeholder links. If the npm name is unavailable, choose a confirmed scoped name and update documentation and executable examples.
3. Use the pinned pnpm version. Run `pnpm install --frozen-lockfile`, install Chromium, run `pnpm check` and `pnpm pack:smoke`.
4. Review `THIRD_PARTY_NOTICES.txt`, `docs/DEPENDENCIES.json`, and the build-only MPL dependency note. Recheck on the release platform. Keep the MIT project license and upstream notices in the tarball.
5. Run `pnpm demo:generate`; verify the predefined repairs produce 11 → 0 observations, 11 resolved, and complete comparison coverage. Review screenshots and reports for content you can share. Avoid bundling sensitive real-world reports. The demo uses a free loopback port and keeps earlier output directories.
6. Run `npm pack --dry-run` and `npm pack`. Inspect the tarball. Test its CLI from outside the checkout using the README's `npm exec --package` commands. The runtime includes only Playwright plus its dependency; it does not require Vite/React on the consumer's machine.
7. Push to the chosen GitHub repository and wait for the included Linux/Windows CI matrix. Inspect the Linux Node 22 demo summary and evidence artifact, including its comparison JSON. Local validation is not evidence of a hosted CI run.
8. After the maintainer has reviewed the concrete release, authenticate to npm and publish manually with `npm publish --access public`. Respect the account's 2FA/provenance requirements. Do not store tokens in this repository.
9. Create a v0.1.0 tag and GitHub release with the actual demo, tested commands, known limits, and license notices. Update the README's local-release status only after publication succeeds.

Playwright Chromium is installed separately using `viberepro install`. Linux CI also needs its system dependencies (`pnpm exec playwright install --with-deps chromium`). The npm tarball intentionally does not contain a browser binary.
