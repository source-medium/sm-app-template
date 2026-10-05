# SourceMedium App Starter

Start with a working application, connect your SourceMedium warehouse, and use
your coding agent to build what your business needs.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/source-medium/sm-app-template)

A normal Next.js app that you own and can change completely. It reads your
SourceMedium BigQuery warehouse on the server and shows it to people you trust,
behind a password or Cloudflare Access. It ships with four example views
(Overview, Paid marketing, Creatives, Orders) that you can keep, change, or
delete.

## Try it in two commands

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open http://127.0.0.1:3000. It runs on clearly labeled **sample data**: no
account, credential, database, or AI service needed.

## Use your data

1. An organization admin creates an app on the **Apps** page in SourceMedium
   and copies its configuration block (shown once).
2. Paste it into `.env.local`, run `pnpm diagnose`, then `pnpm dev`.
3. Deploy with the button above (or Vercel) and paste the same values when
   asked. Open your URL, enter the password, and look for **Live data**.

Details, including lost secrets: [docs/connect.md](docs/connect.md).

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

## What this is not

Not a hosted app builder, a dashboard framework, a query gateway, or a
replacement for your BI tool. There is no app database, no shared cache of
your data, no per-viewer permissions, and no writes. SourceMedium maintains
this template and its tested patterns; the code in your copy is yours.

## Stack

Next.js (App Router) on Cloudflare Workers through OpenNext, or on Vercel ·
React · strict TypeScript · shadcn/ui on Tailwind CSS · Recharts · Zod ·
jose · Vitest (Node and workerd) · Playwright with axe.

[License](LICENSE) · [Security](SECURITY.md) · [Support](SUPPORT.md) · [Contributing](CONTRIBUTING.md)
