# Security

## Reporting a vulnerability

Report security issues privately through GitHub: on this repository's
**Security** tab, choose **Report a vulnerability**. Please do not open a
public issue.

If your report involves a live credential, do not include it. If you believe
an app key or password was exposed, follow the replacement instructions in [operations](docs/operations.md)
and contact SourceMedium immediately. Do not wait for the planned Apps page
to become available.

## Supported versions

Until the first release, security fixes go to `main`; afterward they go to the
latest release of this template. Your copy is your
code: to take a fix, compare the files that carry a "Template version" header
(the configuration parser, the viewer guards, the Google token exchange, and
the BigQuery client) with `main` or the latest published release.

## Scope and design limits

The app is built for trusted internal viewers who may all see the app's whole
warehouse scope. The shared password is one identity for everyone. These are
design limits, documented in `docs/auth.md`, not vulnerabilities. Changes you
make to your copy are outside SourceMedium's support.

## Dependency review (2026-10-06)

The current Next and Miniflare packages pin vulnerable PostCSS, sharp and
undici dependencies. Narrow parent/version overrides in `pnpm-workspace.yaml`
select their patched releases; remove them when the parents include the fixes.

One advisory remains without a published fix:
[braces stack exhaustion](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm).
It is reached only through the development ESLint plugin's `rootDir` glob
configuration. This app does not accept glob patterns from viewers, and the
package is not used by its request handlers. Do not run lint configuration
from untrusted repositories. Recheck the advisory before each release; the
current audit is not a claim of zero dependency advisories.
