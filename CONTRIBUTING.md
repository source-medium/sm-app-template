# Contributing

Thanks for improving the starter. Changes should keep it small: a customer
must be able to read it, change it, and delete the examples without learning a
framework.

## Development

```sh
pnpm install --frozen-lockfile
pnpm dev          # sample data, http://127.0.0.1:3000
pnpm check        # must pass; under a minute
pnpm test:e2e     # Playwright + axe against a production build
pnpm test:secrets # sentinel-credential scan of the build and rendered pages
pnpm build:cloudflare && pnpm smoke:worker   # the Worker in workerd
pnpm test:live    # opt-in: your .env.local configuration against a real warehouse
```

For live checks, put a test app's configuration block in `.env.local` and run
`pnpm diagnose` and `pnpm test:live`. They run real (small) BigQuery queries,
so they never run by default or in CI.

CI runs all of these on every pull request, without credentials or network
access to any warehouse.

## Rules for changes

- Follow [AGENTS.md](AGENTS.md); its five rules apply to template code too.
- Files with a "Template version" header (`env.server.ts`, the guards,
  `google-token.server.ts`, `bigquery-rest.server.ts`, `warehouse.server.ts`,
  `warehouse-error.ts`, `log.ts`) are what customers diff when they update.
  Bump the version in every changed header and describe the change in the
  release notes.
- Every new guardrail fails with one sentence naming the file and the fix, and
  has a test showing it fails on a deliberate violation (`tests/static`).
- No real customer identifiers, values, URLs, or credentials anywhere,
  including tests and fixtures. Sample data is synthetic.
- Before each release, update dependencies with the "Update dependencies"
  prompt in [docs/prompts.md](docs/prompts.md). There is no update bot: its
  pull requests would land in every customer's copy. Pin exact versions; never
  resolve `latest` in a build.

## Releases

Releases are GitHub releases with semantic version tags. The release notes
list every changed file that carries a "Template version" header, any change
to configuration or the deploy flow, and the tested versions of Node.js,
Next.js, the OpenNext adapter, Wrangler, and the Workers compatibility date.
Before a release: `pnpm check`, `pnpm test:e2e`, `pnpm test:secrets`,
`pnpm build:cloudflare && pnpm smoke:worker`, and a scan of the repository for
private URLs, customer identifiers, values, and credentials.
