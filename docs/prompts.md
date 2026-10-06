# Starter prompts

Copy one into your coding agent. These are starting instructions, not proven
end-to-end onboarding flows. "Connect my data" needs an already provisioned
app block while the Apps page is unavailable. "Check a number" needs an
independent, authorized source; a passing code check does not validate a metric.

## Connect my data

**You provide:** an app-specific configuration block, entered privately into `.env.local`.
**Expected result:** a verified live connection, or a clear explanation of the missing prerequisite.

```text
Help me connect this app to my SourceMedium warehouse. Follow docs/connect.md.
I will paste the configuration block into .env.local myself; do not ask me to
paste it into this chat and do not read .env.local. When I say it is done, ask
me to run `pnpm diagnose` and tell you what it printed, then fix any problem it
reports. If app provisioning is unavailable, explain that prerequisite and
keep sample mode; do not invent a configuration block. Run pnpm check and
report separately whether live connection was actually verified.
```

## Rebrand it

**You provide:** your company name, app name, primary color, and logo file.
**Expected result:** your branding works in light and dark mode; the example views still work.

```text
Rebrand this app for <company>: name "<app name>", primary color <hex>, and
the logo at public/logo.svg. Change only src/styles/tokens.css and
app.config.ts, keep text contrast accessible in light and dark mode, then run
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
and grain with the SourceMedium MCP (describe_table) or `pnpm schema
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
an independently verified total. If query_metrics is unavailable, say the
comparison needs another independent, authorized source. Use an existing
read-only BigQuery login only with my authorization, after inspecting the
schema; constrain the query to the agreed project, store and dates, use typed
parameters and a maximum bytes billed limit. Never read or copy the app key.
If neither source is available, report the comparison as unverified. For demo
data, check whether privacy masking scales metric columns without multiplying
rows before comparing summary counts with order-row counts. Run pnpm check and report it separately from the
numerical comparison.
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
output: pnpm install --frozen-lockfile, pnpm check, pnpm test:e2e,
pnpm test:secrets, pnpm build:cloudflare, and pnpm smoke:worker. Fix failures;
do not call the update complete if any gate was skipped. For a Next or React
change also run pnpm exec playwright test --repeat-each=8 after test:e2e,
before test:secrets rebuilds .next. If install fails on a patch in
pnpm-workspace.yaml, read its comment: remove the patch only if you can show
the exact new release's compiled code contains the fix in every affected
bundle, otherwise stop and tell me. A Next major version is not proof. Preserve
the regression tests when removing a patch. List each
package as old -> new, and anything you held back and why.
```
