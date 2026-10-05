# Security

## Reporting a vulnerability

Report security issues privately through GitHub: on this repository's
**Security** tab, choose **Report a vulnerability**. Please do not open a
public issue.

If your report involves a live credential, do not include it. If you believe
an app key or password was exposed, replace it from the Apps page in
SourceMedium right away (`docs/operations.md`) and tell your SourceMedium
contact.

## Supported versions

Security fixes go to the latest release of this template. Your copy is your
code: to take a fix, compare the files that carry a "Template version" header
(the configuration parser, the viewer guards, the Google token exchange, and
the BigQuery client) with the latest release.

## Scope and design limits

The app is built for trusted internal viewers who may all see the app's whole
warehouse scope. The shared password is one identity for everyone. These are
design limits, documented in `docs/auth.md`, not vulnerabilities. Changes you
make to your copy are outside SourceMedium's support.
