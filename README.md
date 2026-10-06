# SourceMedium App Starter

Start an internal data app on your SourceMedium warehouse, then make it yours
with your coding agent. The starter handles the warehouse connection, shared
password, store and date filters, charts, tables, and loading and error states.

Four example views cover common starting points: Overview, Paid marketing,
Creatives, and Orders. Copy the closest one, change its query and presentation,
or delete it. You own a normal Next.js app with editable code throughout.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/source-medium/sm-app-template)

## Try it in two commands

Install Node.js 22.13 or newer (CI uses 24) and pnpm 10.34.5 first. Create your
own repository with GitHub's **Use this template**, then clone it and open a
terminal in that folder.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open http://127.0.0.1:3000. It runs on clearly labeled **sample data**: no
account, credential, database, or AI service needed.

## Use your data

Live mode requires an app-specific configuration block issued for your warehouse.
If you do not already have one, use sample mode and contact your SourceMedium
admin about availability. Do not substitute an admin credential.

For an already provisioned app, follow [docs/connect.md](docs/connect.md).
Cloudflare Workers is the tested runtime; Vercel deployment is unverified.

## Build with your coding agent

Open the repository in Claude Code, Codex, Cursor, or Copilot. Every agent
reads [AGENTS.md](AGENTS.md); Claude Code also connects to the SourceMedium
MCP with your own login, so it can inspect your warehouse before writing SQL.
Copyable starting points are in [docs/prompts.md](docs/prompts.md).

Before calling a change done, run:

```sh
pnpm check   # format, lint, types, guardrails, and tests; under a minute
```

## Who can see what

Everyone who can open the app sees everything the app can read. That suits an
internal tool for a trusted team. It is not a customer portal: showing
different data to different people needs an authorization design this starter
does not include. See [docs/auth.md](docs/auth.md).

## Guides

| Guide                                                   | For                                                  |
| ------------------------------------------------------- | ---------------------------------------------------- |
| [connect.md](docs/connect.md)                           | Going live, deploying, replacing lost secrets        |
| [data.md](docs/data.md)                                 | Schemas, SQL rules, exact decoding, money, freshness |
| [auth.md](docs/auth.md)                                 | The shared password, Cloudflare Access, sign-in      |
| [operations.md](docs/operations.md)                     | Rotation, query allowances, errors and remedies      |
| [removing-the-example.md](docs/removing-the-example.md) | Deleting one example view or all four                |
| [prompts.md](docs/prompts.md)                           | Starter prompts for your agent                       |

## Conventions you can build on

- **Connect once:** one app-specific configuration block; warehouse queries
  stay on the server and the shared password protects every view.
- **Copy a view:** each feature owns its query, row schema, sample data and UI.
  The same store and date filters work across views and stay in the URL.
- **Keep data trustworthy:** typed SQL parameters, exact money values, bounded
  queries and clear errors are built in.
- **Make it yours:** edit `app.config.ts` and `src/styles/tokens.css` to rebrand;
  reuse the chart, table and card patterns when adding pages.

Viewers can choose Light, Dark, or System in the top bar. **Copy link** shares
the applied store, date range, and view filters with another authorized viewer;
it does not freeze the underlying data. Overview's info icons explain each KPI.

SourceMedium maintains the connection and integration patterns. Your agent
works with ordinary feature code when extending your copy.

## Stack

Next.js (App Router) on Cloudflare Workers through OpenNext ·
React · strict TypeScript · shadcn/ui on Tailwind CSS · Recharts · Zod ·
jose · Vitest (Node and workerd) · Playwright with axe.

This is the 0.1.0 preview. Cloudflare Workers Paid is the deployment target.
See [validation and current limits](docs/release-readiness.md); no stable
release has been tagged yet.

[License](LICENSE) · [Security](SECURITY.md) · [Support](SUPPORT.md) · [Contributing](CONTRIBUTING.md)
