# SourceMedium App Starter

## Start with a working dashboard. Make it yours.

Seven commerce reports for your SourceMedium warehouse, ready to run. Use
Codex or Claude Code to change a metric, rework a view, or build your next report.
The app and its source code are yours.

**[Run it locally](#run-it-locally)** ·
[Explore the reports](#seven-reports-to-start-from) ·
[Open the demo](https://sm-app-starter-demo.source-medium.workers.dev)

### A report should answer your question

Say you want to compare creative efficiency. Open **Vibe code**, pick a card,
and describe the change:

> On Delivery cards, replace Impressions with Cost / conversion so I can compare spend efficiency.

**Before: impressions. After: cost per conversion.**

<p>
  <img src="docs/images/customize-before.jpg" width="390" alt="Before: the default creative card shows $5,456.90 spend, 477,662 impressions, 1.24% CTR, and 249.5 conversions.">
  <img src="docs/images/customize-after.jpg" width="390" alt="After customization: the same card shows $21.87 cost per conversion in place of impressions. The other metrics stay the same.">
</p>

Copy the prepared prompt into your coding agent. It includes the selected element,
page, and applied filters. Your agent edits the repo; you review the result in a
preview before publishing.

_Real captures of a local customization using sample data. The starter keeps the
default card; this example shows what you can change._

<details>
<summary><strong>See the prompt and the code change</strong></summary>

<img src="docs/images/vibe-code.jpg" width="448" alt="Vibe code with the request written out and Ad creatives, Card 1 selected as its target.">

The metric already exists in the Returns view. This customization reuses it in
Delivery cards. In [`src/features/creatives/page.tsx`](src/features/creatives/page.tsx),
replace the Impressions entry in the Delivery metrics:

```diff
- { label: "Impressions", display: formatCount(creative.impressions) },
+ { label: "Cost / conversion", display: formatMoney(creative.cpo, currency) },
```

Remove the now-unused `formatCount` import. The existing calculation uses period
spend / platform-reported conversions and shows an empty value when there are no
conversions. No query or schema change is needed.

The Vibe code panel prepares context for an agent working in your repo. It does
not run an agent inside the dashboard. See [more things to ask](docs/prompts.md).

</details>

## Run it locally

Use Node.js 24 (22.22.1 or newer works) and pnpm 10.34.5.

```sh
git clone https://github.com/source-medium/sm-app-template.git my-data-app
cd my-data-app
pnpm install --frozen-lockfile
pnpm dev
```

Open **http://127.0.0.1:3000**. Sample data works immediately, with no credentials,
database setup, or AI API key. Or give your agent the [setup prompt](docs/cloud.md#your-first-message-in-either-agent)
and let it guide you through connecting your warehouse and hosting the app.

## Seven reports to start from

Store selection travels between reports, and report filters live in shareable
URLs. Period comparisons, CSV exports where available, chart-to-table views,
and light and dark modes are already in place.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/images/overview-dark.jpg">
  <source media="(prefers-color-scheme: light)" srcset="docs/images/overview-light.jpg">
  <img alt="Overview: revenue, orders, ad spend, and other headline metrics with sparklines and period comparisons." src="docs/images/overview-light.jpg" width="1440">
</picture>

_All screenshots use synthetic sample data. The hosted demo reads SourceMedium's
demo warehouse. No sign-in required._

| Report             | Start with this question                             |
| ------------------ | ---------------------------------------------------- |
| **Overview**       | How did revenue, orders, and spend change?           |
| **All stores**     | Which stores are growing, and which need a look?     |
| **Paid marketing** | Where is spend going, and what returns are reported? |
| **Creatives**      | Which ads are delivering, and at what cost?          |
| **Products**       | Which products and variants drive sales?             |
| **Retention**      | How do customers from each cohort return over time?  |
| **Orders**         | What happened with a particular order?               |

<details>
<summary><strong>Compare stores, then drill into one</strong></summary>

Search by store name, domain, brand, or ID. Names and available logos come from
your warehouse; missing names fall back to a domain or store ID. **All stores**
keeps each store's currency visible and avoids combining totals across currencies.

![All stores with the searchable store picker open, brand groups, store domains, and separate performance rows.](docs/images/stores.jpg)

</details>

<details>
<summary><strong>Use the naming conventions you already have</strong></summary>

Filter campaign, ad set, or ad names by text such as `[retargeting]`. Combine
contains, does not contain, equals, and starts with rules, then inspect matching
names. Your text is treated literally, with no tag taxonomy to configure.

![Creative cards filtered to campaign names containing “[retargeting]”.](docs/images/creatives.jpg)

Filters travel with the report link. Creative metrics reflect the matching
ad delivery, including when one creative appears in several campaigns.

</details>

<details>
<summary><strong>Follow retention and lifetime value by cohort</strong></summary>

Compare cohorts at the same age, filter acquisition channels, and switch the
matrix between retention, repeat purchase, revenue, and gross profit measures.

![Retention curves and a cohort matrix, using synthetic sample data.](docs/images/retention.jpg)

</details>

Each view owns its queries, sample data, and presentation. Copy the closest one
or [remove the examples](docs/removing-the-example.md). Change your name, logo,
and navigation in [`app.config.ts`](app.config.ts), and your colors and fonts in
[`src/styles/tokens.css`](src/styles/tokens.css).

## Put your version online

Your agent follows the [Cloudflare guide](docs/cloud.md) to connect the app and
set up automatic deployments:

1. **Connect your data.** An organization admin creates an app in your SourceMedium
   workspace's **Dashboards & Apps** page. Enter its configuration block privately.
2. **Choose who can view it.** Use a shared password for a small trusted group,
   or Cloudflare Access for individual sign-in. Your agent helps you choose.
3. **Review, then publish.** Push a task branch for a protected preview against
   your data. Approve the change, then push `main` to deploy.

The default path uses **Cloudflare Artifacts + Workers Builds**. GitHub is
optional. Workers Paid is required; see the guide for Artifacts availability and
[current costs](docs/cloud.md).

Every viewer of a deployment sees the same data. For separate store audiences,
use separate deployments with `APP_STORE_ID`. See [sign-in and store access](docs/auth.md).
If Dashboards & Apps says credentials are still being enabled, use sample data and
[contact support](SUPPORT.md). Do not use an admin credential.

## Keep building

The repo uses Next.js, React, TypeScript, shadcn/ui, Tailwind, and Recharts.
It includes [agent instructions](AGENTS.md), skills for adding pages, querying
data and deploying, and checks for auth, store scope, data contracts, and browser
accessibility. Warehouse queries run on the server.

```sh
pnpm check      # Format, lint, types, guardrails, and unit tests
pnpm test:e2e   # Production build and browser tests
```

| Guide                               | Read it when you need to…                                   |
| ----------------------------------- | ----------------------------------------------------------- |
| [Cloud setup](docs/cloud.md)        | Set up source hosting, previews, and automatic deploys      |
| [Data connection](docs/connect.md)  | Connect a warehouse or replace a configuration block        |
| [Queries and metrics](docs/data.md) | Work with schemas, SQL, money, dates, and freshness         |
| [Sign-in and access](docs/auth.md)  | Choose a viewer guard or restrict a deployment to one store |
| [Operations](docs/operations.md)    | Diagnose errors, rotate secrets, or roll back a release     |
| [Agent prompts](docs/prompts.md)    | Add a report, change a component, or check a number         |

**0.1.0 preview.** The tested hosting target is Cloudflare Workers. Fresh-account
onboarding and self-service credential issuance still need end-to-end verification.
See [release evidence and remaining checks](docs/maintainers/release-readiness.md).

[MIT license](LICENSE) · [Security](SECURITY.md) · [Support](SUPPORT.md) · [Contributing](CONTRIBUTING.md)
