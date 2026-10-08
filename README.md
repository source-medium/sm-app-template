# SourceMedium App Starter

Start an internal data app on your SourceMedium warehouse, then make it yours
with your coding agent. The starter handles the warehouse connection, shared
password, store and date filters, charts, tables, and loading and error states.

Six example views cover common starting points: Overview, Paid marketing,
Creatives, Products, Retention, and Orders. Copy the closest one, change its query and presentation,
or delete it. You own a normal Next.js app with editable code throughout.

## Start in your browser

Use **Codex Cloud** or **Claude Code in the cloud**. No local installation needed.

1. [Create your copy](https://github.com/source-medium/sm-app-template/generate).
2. Choose your agent below and paste the [starter message](docs/cloud.md#your-first-message-in-either-agent).
3. Connect your copy to Cloudflare once. Describe changes, open their previews,
   and approve the ones you want to publish.

| Coding agent                 | Start here                                              |
| ---------------------------- | ------------------------------------------------------- |
| **Codex Cloud**              | [Set up Codex](docs/cloud.md#codex-cloud)               |
| **Claude Code in the cloud** | [Set up Claude](docs/cloud.md#claude-code-in-the-cloud) |

Start on labeled **sample data**, with no warehouse credentials. Your agent
runs setup and checks. Cloudflare Workers Paid hosts the app; GitHub and your
chosen coding agent need access to your repository.

**[Follow the browser setup and preview-to-live guide →](docs/cloud.md)**

## Prefer local development?

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

Codex and Claude Code share [AGENTS.md](AGENTS.md) and the same repository
skills. Cursor and Copilot can follow those instructions too. Sample work
uses bundled schemas without an MCP login. For live schema inspection,
connect your own authorized SourceMedium account as described in [data.md](docs/data.md).
Copyable starting points are in [docs/prompts.md](docs/prompts.md).

Before calling a change done, run:

```sh
pnpm check   # format, lint, types, guardrails, and tests; under a minute
```

## Who can see what

Every viewer of a deployment sees the same data. Use `APP_STORE_ID` and
separate deployments for stores with different audiences. Different permissions
for individual viewers within one deployment need an authorization design this
starter does not include. See [docs/auth.md](docs/auth.md).

## Guides

| Guide                                                   | For                                                  |
| ------------------------------------------------------- | ---------------------------------------------------- |
| [cloud.md](docs/cloud.md)                               | Codex or Claude in the browser, previews, publishing |
| [connect.md](docs/connect.md)                           | Going live, deploying, replacing lost secrets        |
| [data.md](docs/data.md)                                 | Schemas, SQL rules, exact decoding, money, freshness |
| [auth.md](docs/auth.md)                                 | The shared password, Cloudflare Access, sign-in      |
| [operations.md](docs/operations.md)                     | Rotation, query allowances, errors and remedies      |
| [removing-the-example.md](docs/removing-the-example.md) | Deleting one example view or all six                 |
| [prompts.md](docs/prompts.md)                           | Starter prompts for your agent                       |

## Conventions you can build on

- **Connect once:** one app-specific configuration block; warehouse queries
  stay on the server and the shared password protects every view.
- **Copy a view:** each feature owns its query, row schema, sample data and UI.
  Store and date filters stay in the URL; Retention uses a completed-month window.
- **Multiple stores:** names and brand groups load from `dim_stores`; each store
  keeps a shareable `?store=<sm_store_id>` URL. No manual store list required.
- **Ask a coding agent:** the top bar composes a prompt from the current page,
  its filters, and the sections on screen. Paste it into any agent working in
  this repository; see [docs/prompts.md](docs/prompts.md).
- **Separate store audiences:** optional `APP_STORE_ID` locks a deployment to
  one store. Give it its own URL and viewer guard; see [the setup](docs/auth.md#one-deployment-per-store).
- **Keep data trustworthy:** typed SQL parameters, exact money values, bounded
  queries and clear errors are built in.
- **Make it yours:** edit `app.config.ts` and `src/styles/tokens.css` to rebrand;
  reuse the chart, table and card patterns when adding pages.

Viewers can choose Light, Dark, or System in the top bar. **Copy link** shares
the applied store, date range, and view filters with another authorized viewer;
it does not freeze the underlying data. Overview's info icons explain each KPI.
**Refresh data** reloads the current report with its applied filters. Each
successfully loaded section shows its query time; warehouse freshness remains
unknown. Reports do not refresh automatically.

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
