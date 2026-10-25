# Starter prompts

**Getting started in Codex Cloud or Claude Code in the cloud?** Use the
[shared starter message](cloud.md#your-first-message-in-either-agent).
Both agents follow the same [preview and publish loop](cloud.md#4-change-review-publish).

For anything about a page you are looking at, use **Vibe code** in the app's
top bar. Choose the kind of help you need first, because it decides whether the
prompt asks the agent to change code or only to explain; the cursor then waits in
**Your request**. Use **Pick an element** to reference a KPI, chart control,
table, individual creative card or metric, or report filter. Tab browses
elements, Enter selects, and Escape cancels. On touch screens, tap to select or
scroll to reach another element. You can also choose a section from **Target**,
or keep **This page**. Review **Preview prompt** if useful, and copy into your
coding agent. Copy becomes available after you describe your request. The panel
prepares text locally and makes no agent API call.

The prompt includes the page, selected component, resolved store/dates and
view filters, configured reporting currency, data mode, and build. It follows
the report's applied values, including defaults, rather than unsaved filter
edits or arbitrary URL parameters. Search text, order details, pagination
cursors, and row values are excluded. Active omissions are named so the agent
knows to ask for relevant details. Applied view filters that arrive through a
link, such as a campaign id or name-filter text, are included as quoted values,
and the prompt tells the agent to treat them as data; review the filters in a
link someone else sent you before copying its prompt. Text you enter in the
request is copied as written. Sample-number checks trace fixtures and
calculations; live-number checks require an independent authorized source.
Both are read-only.

Context and available targets update as navigation and report loading finish,
including while the panel is open. The panel shows the current report, store,
and dates. Changing filters preserves your draft; switching pages clears it.
A selected card is identified by its displayed position and optional metric
label, never its row contents. Changing filters clears a card selection because
its position may now refer to something else. Picking keeps your draft and
never activates the element. Moving the pointer preserves a keyboard selection.
Close returns keyboard focus to **Vibe code**. If copying fails, the preview
opens and focuses the prompt for manual copying.

To add a published metric, open **Explore your data**, find it, and choose
**Use in Vibe code** in its drawer. This starts an **Add something new** prompt
with the metric's canonical name, reviewed definition, source model, time basis
and dependencies, and tells the agent which views already present it. To extend
a report with an available warehouse field, open **About this data**,
search its source fields, and choose **Use this field**. This starts an
**Add something new** prompt with the field's table, name, type and published
description. Add what you want to build before copying. The agent must verify
the schema before writing SQL. You can remove the field; switching stores or
pages clears it so another store's documentation is not reused.

### Keeping new views agent-friendly

`ReportPage` owns the page title, route, resolved store/date/comparison filters,
and currency. A feature passes its other **parsed, shareable values** through
`agentFilters`, for example `agentFilters={{ sales_channel: channel, grain }}`.
Never pass raw `searchParams`, free-text searches, credentials, or row IDs.
Name active exclusions through `agentOmissions`, without their values.
The All stores view passes `allStores`: its agent context marks the scope as all
stores and describes `store` as the date/navigation reference, with currencies
shown per store. The persistent header switcher is also an element-picker target.

The shared `KpiCard`, `ChartCard`, `DataTable`, `CardGrid`, and `CohortMatrix`
patterns expose their labels and component names automatically. For a custom
report section, add `data-agent-target="Section label"` and
`data-agent-component="YourComponent"` to its wrapper. Use a section label,
not customer row contents. A child control can declare `data-agent-element="UI label"`;
a card uses a one-based `data-agent-item` position. Only declare static UI labels,
never row values or input contents. No central page/feature registry needs updating.
The prompt directs the agent to follow the route's imports rather than guess
a feature-folder name from the URL. A page without `ReportPage` reports that
its filter context is unavailable.

The prompts below cover work that starts outside a page.

Copy one into your coding agent. These are starting instructions, not proven
end-to-end onboarding flows. "Connect my data" needs an already provisioned
app block issued by a workspace editor or admin from SourceMedium's Dashboards & Apps page. "Check a number" needs an
independent, authorized source; a passing code check does not validate a metric.

## Connect my data

**You provide:** an app-specific block, entered privately in Cloudflare runtime settings
(or the previews' Development block in cloud environment settings; `.env.local` for local development).
**Expected result:** a verified live connection, or a clear explanation of the missing prerequisite.

```text
Help me connect this app to my SourceMedium warehouse. Follow docs/connect.md.
If the app is hosted, use "Connect a hosted app": I will enter the block in
Cloudflare's production runtime settings myself. Do not ask me to create a
local file, run a terminal command, or give you the key. Help verify sign-in,
Live data, and the intended store on the hosted app. Guide me through
Live data → Check connection; I can share its safe report here. If I need a
block, direct a workspace editor or admin to Dashboards & Apps in SourceMedium, not Google Cloud.
Connect protected previews too, following docs/cloud.md#connect-preview-data;
use Production for the live site and Development for previews and debugging.
For cloud-agent debugging, follow docs/cloud.md#debug-with-live-data. I will
enter the same Development app block in environment settings and authorize
read-only warehouse checks. Then run pnpm diagnose and the relevant schema and
live tests yourself. For local development, I will fill .env.local privately;
run pnpm diagnose without reading that file. Never print environment values.
Never ask for secrets in chat. If provisioning is unavailable, explain that prerequisite and
keep sample mode; do not invent a configuration block. Store names, brand groups,
time zones and reporting currency come from dim_stores automatically. Use
storeLabels or reportingCurrencies only for a deliberate display override.
Leave missing or invalid currency codes unlabeled. Do not infer a currency from
the locale or add client-side FX.
If sources differ, resolve that upstream before trusting combined totals or
MER. Run pnpm check and report separately whether live connection was actually
verified.
```

## Rebrand it

**You provide:** your company name, app name, primary color, and logo file.
**Expected result:** your branding works in light and dark mode; the example views still work.

```text
Rebrand this app for <company>: name "<app name>", primary color <hex>, and
the logo at public/logo.svg. Change only src/styles/tokens.css,
app.config.ts, and the app icon src/app/icon.svg, keep text contrast accessible in light and dark mode, then run
pnpm check.
```

## Add a page

**You provide:** the business question you want the page to answer.
**Expected result:** a working view in navigation, with live and sample data, shared filters, and data states.

```text
Add a page called "<name>" that shows <what you want to see>. Follow "Add a
page" in AGENTS.md and copy the closest example view. Before writing SQL,
inspect the relation with the SourceMedium MCP or `pnpm schema`. Give it sample
data too, then run pnpm check.
```

## Add a page from my own table

**You provide:** the dataset and table name, what it contains, and what you want to see.
**Expected result:** a view based on the inspected schema, with matching sample data.

```text
I have a table <dataset.table> in my warehouse with <what it holds>. Build a
page that <what you want>. Read docs/data.md, inspect the table's columns with
`pnpm schema <dataset.table>` (never guess them), decode rows with a row
schema, add sample data with the same shape, and run pnpm check.
```

## Build an inventory view

**Data needed:** `obt_inventory_positions` with inventory for your store.
**Expected result:** current units on hand by product, with the row grain explained and sample data included.

```text
Build an Inventory page on obt_inventory_positions. First inspect its columns
and grain with the SourceMedium MCP or `pnpm schema
obt_inventory_positions`, and tell me the grain before writing any SQL. Then
show current units on hand by product for the selected store, following "Add a
page" in AGENTS.md, and run pnpm check.
```

## Check a number

**You provide:** the metric, displayed value, store, dates, and an authorized comparison source.
**Expected result:** an exact comparison and an explanation of any difference before code changes.

```text
The <metric> on the <view> page shows <value> for <store> from <date> to
<date>. Check it against the SourceMedium MCP's query_metrics for the same
store and dates. If they differ, explain why from the SQL and the catalog
definition, without changing anything yet. Do not treat a catalog formula as
an independently verified total. Match the reporting currency as well as the
metric and dates; check conversion status and source-account exceptions in
docs/data.md. If query_metrics is unavailable, say the comparison needs another
independent, authorized source. Use an existing
read-only BigQuery login only with my authorization, after inspecting the
schema; constrain the query to the agreed project, store and dates, use typed
parameters and a maximum bytes billed limit. Never read or copy the app key.
If neither source is available, report the comparison as unverified. For demo
data, check whether privacy masking scales metric columns without multiplying
rows before comparing summary counts with order-row counts. Run pnpm check
and report it separately from the numerical comparison.
```

## Build something unrelated

**You provide:** the feature and the job it should help you do.
**Expected result:** a working feature, or an explicit authorization-design prerequisite if it needs writes.

```text
Add <feature> to this app. Read AGENTS.md first. If it reads warehouse data,
follow its five rules; if it needs to write anything or act on behalf of a
person, stop and tell me, because this app's viewer guards are shared and
read-only by design (docs/auth.md). Run pnpm check when done.
```

## Update dependencies

**Inputs:** the current package versions, lockfile, patches, and security advisories.
**Expected result:** supported updates with passing release checks and a list of anything held back.

Run it every few months, and soon after Next.js announces a security fix.

```text
Update every package in package.json to the newest stable, non-deprecated
release within its current major version (within its current minor for 0.x).
Exclude prereleases such as alpha, beta, canary and rc even if their version
sorts later; compare versions numerically, not as text. Versions are pinned
exactly, so plain `pnpm update` changes nothing
and `pnpm update --latest` crosses majors: find each version with `pnpm view
<name> versions` and set it with `pnpm add -E <name>@<version>` (add -D for
devDependencies). Keep Next, @next/env and @next/eslint-plugin-next aligned,
and keep React and react-dom aligned. Review transitive dependencies with
`pnpm audit`; direct package updates can leave vulnerable dependencies pinned
by their parents. Preserve existing documented security overrides until the
parent includes the fix. Do not add overrides merely to make installation
pass, or change pnpm's patch-failure settings. For a security fix that requires
an override, identify the upstream advisory, constrain it to the affected
parent and fixed version, and run all gates below. Report any remaining
advisory and whether its vulnerable path is used by this app. Run these gates sequentially because they share build
output: pnpm install --frozen-lockfile and pnpm check:deploy. Fix failures;
do not call the update complete if any gate was skipped. For a Next or React
change also run pnpm test:browser --repeat-each=8 after check:deploy,
reusing its build. If install fails on a patch in
pnpm-workspace.yaml, read its comment: remove the patch only if you can show
the exact new release's compiled code contains the fix in every affected
bundle, otherwise stop and tell me. A Next major version is not proof. Preserve
the regression tests when removing a patch. List each
package as old -> new, and anything you held back and why.
```
