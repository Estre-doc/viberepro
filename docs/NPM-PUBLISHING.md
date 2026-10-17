# Publishing to npm

The package is `viberepro`. Use the official npm registry explicitly for authentication and publishing, even if your default install registry is a mirror. Authentication belongs to a registry; a mirror's `whoami` result does not prove whether the official registry login succeeded.

In Windows PowerShell:

```powershell
cd "C:\path\to\viberepro"
npm.cmd login --auth-type=web --registry=https://registry.npmjs.org/
npm.cmd whoami --registry=https://registry.npmjs.org/
```

Complete the official browser login and enable the account's two-factor authentication (2FA) for interactive publishing. A successful login alone does not satisfy publishing authentication; an account without 2FA can receive a 403 from the publish endpoint. Set up credentials and complete any publishing challenge yourself. Keep account credentials in npm's user configuration, never in this repository. Do not append punctuation to the registry URL.

With development dependencies already installed, publishing the source checkout builds and checks notices automatically:

```powershell
npm.cmd pack --dry-run
npm.cmd publish --access public --registry=https://registry.npmjs.org/
```

The prepack hook calls the local Node build and license scripts directly. It does not require a globally available pnpm command. Development setup and the broader contributor checks still use the pinned pnpm version described in the README.

Alternatively, publish the exact tarball that you already built, inspected, and tested:

```powershell
npm.cmd publish .\viberepro-0.1.0.tgz --access public --registry=https://registry.npmjs.org/
```

Verify the version on the official registry, then test installation in a fresh consumer:

```powershell
npm.cmd view viberepro@0.1.0 version --registry=https://registry.npmjs.org/
```

If publishing succeeds with `Your package is being processed`, allow for npm's publish-time scan before testing installation. The version can temporarily return 404 during processing. Do not publish it again or change versions to work around that delay. See [npm's processing notice](https://github.blog/changelog/2026-07-28-npm-publish-time-malware-scanning-and-dual-use-metadata/).

An existing name/version cannot be overwritten. Update the package version and tested release artifacts for subsequent releases. Update installation/status documentation when preparing the npm release, and only announce publication after the registry confirms it. See [npm authentication configuration](https://docs.npmjs.com/cli/v10/configuring-npm/npmrc/), [publishing authentication](https://docs.npmjs.com/requiring-2fa-for-package-publishing-and-settings-modification/), and [publishing documentation](https://docs.npmjs.com/cli/v10/commands/npm-publish/).
