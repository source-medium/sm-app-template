# Security

## Reporting a vulnerability

Report security issues privately through GitHub: on this repository's
**Security** tab, choose **Report a vulnerability**. Please do not open a
public issue.

If your report involves a live credential, do not include it. If you believe
an app key or password was exposed, follow the replacement instructions in [operations](docs/operations.md)
and contact SourceMedium immediately. An editor or admin replaces or revokes
the app in **Dashboards & Apps**.

## Supported versions

Until the first release, security fixes go to `main`; afterward they go to the
latest release of this template. Your copy is your
code: to take a fix, commit your work and run `pnpm template:update`, which
brings the template's changes into your copy and keeps yours
([docs/managed.md](docs/managed.md#update-from-the-template)). The files that
carry a "Template version" header (the configuration parser, the viewer
guards, the Google token exchange, and the BigQuery client) are where fixes
usually land.

## Scope and design limits

The app is built for trusted internal viewers who may all see the app's whole
warehouse scope. The shared password is one identity for everyone. These are
design limits, documented in `docs/auth.md`, not vulnerabilities. Changes you
make to your copy are outside SourceMedium's support.

## Dependency review (2026-11-17)

The current Next and Wrangler packages include the PostCSS, sharp and undici
fixes that earlier overrides selected, so `pnpm-workspace.yaml` has none.

Three advisories remain, all in build and development tools:

- [picomatch ReDoS](https://github.com/advisories/GHSA-fc5q-39xc-vjpf) (high,
  no published fix), reached through OpenNext's build minifier, the
  development ESLint plugin and Vite in the test runner.
- [glob cancellation bypass](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4)
  (moderate), through OpenNext's build; its fixed major is outside OpenNext's
  supported range.
- [minimatch pattern amplification](https://github.com/advisories/GHSA-g3hv-75wg-m249)
  (moderate), through the TypeScript lint parser.

Each matches glob patterns written in this repository's configuration while
building or linting. The app does not accept glob patterns from viewers, and
none of these packages runs in its request handlers. Do not build or lint
configuration from untrusted repositories. Recheck the advisories before each
release; the current audit is not a claim of zero dependency advisories.
