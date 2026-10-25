# Contributing

Thanks for improving the starter. Changes should keep it small: a customer
must be able to read it, change it, and delete the examples without learning a
framework.

Judge additions by the recurring setup or data-app problem they solve.
Prefer a working default and a copyable example. Configuration should express
customer-specific values; shared abstractions should serve existing views.
The release checks below are maintainer work, not customer onboarding steps.

## Development

Follow [local setup](README.md#run-it-locally) for Node.js and pnpm prerequisites.

```sh
pnpm install --frozen-lockfile
pnpm exec playwright install --with-deps chromium # browser and Linux system libraries for tests
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

`pnpm check:deploy` runs the complete offline release gate without deploying.
Both deployment commands run it before uploading, so Cloudflare Builds owns
release validation even without GitHub. The GitHub workflow provides optional
maintainer feedback and Windows coverage. Live checks are opt-in and
never run in CI; use only SourceMedium's demo tenant for template validation.

## README screenshots

Capture the running app with **Sample data** visible. Never use warehouse data
in public screenshots. Keep the light and dark Overview images on the same
store and dates; the current set uses Sample Store A, September 1–28, 2026,
with the previous-period comparison.

The other images show the All stores picker, Creatives filtered by campaign
name containing `[retargeting]`, and Retention through September 2026.

The README opens with an actual customization: replacing Impressions with
Cost / conversion on Delivery cards. Capture the first creative on Sample
Store A for the dates above, without a name filter. Use the same crop before
and after applying the README's code change, and capture its request in Vibe
code with Card 1 selected. Restore the default source after capturing the
example; the screenshots must not imply that the customized card ships by default.

Save captures in `docs/images/`, check the README image links and alt text,
and remove any images no longer referenced. Keep close-ups readable at GitHub's
README width and check that the before/after images stack on a narrow screen.

## Rules for changes

- Follow [AGENTS.md](AGENTS.md); its five rules apply to template code too.
- Files with a "Template version" header (`env.server.ts`, the guards,
  `request-scope.ts`, `google-token.server.ts`, `bigquery-rest.server.ts`,
  `managed-api.server.ts`, `deadline-call.server.ts`, `warehouse.server.ts`,
  `query-cache.server.ts`, `warehouse-error.ts`, `log.ts`) are what customers
  diff when they update.
  Headers currently identify the unreleased 0.1.0 template. When publishing a
  release, align changed headers with that release and describe the changes
  in its notes; a header alone is not evidence of a published tag.
- Every new guardrail fails with one sentence naming the file and the fix, and
  has a test showing it fails on a deliberate violation (`tests/static`).
- No real customer identifiers, values, URLs, or credentials anywhere,
  including tests and fixtures. Sample data is synthetic.
- Before each release, update dependencies with the "Update dependencies"
  prompt in [docs/prompts.md](docs/prompts.md). There is no update bot: its
  pull requests would land in every customer's copy. Pin exact versions; never
  resolve `latest` in a build.

## Releases

No stable tag or GitHub release has been published yet. Follow the open gates
in [release readiness](docs/maintainers/release-readiness.md) before claiming v1 readiness.
Releases will be GitHub releases with semantic version tags. The release notes
list every changed file that carries a "Template version" header, any change
to configuration or the deploy flow, and the tested versions of Node.js,
Next.js, the OpenNext adapter, Wrangler, and the Workers compatibility date.
Before a release: `pnpm check`, `pnpm test:e2e`, `pnpm test:secrets`,
`pnpm build:cloudflare && pnpm smoke:worker`, and a scan of the repository for
private URLs, customer identifiers, values, and credentials.
