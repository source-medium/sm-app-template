# Starter prompts

Copy one into your coding agent. Each sends the agent to the right guide; all
of them end with `pnpm check`.

## Connect my data

```text
Help me connect this app to my SourceMedium warehouse. Follow docs/connect.md.
I will paste the configuration block into .env.local myself; do not ask me to
paste it into this chat and do not read .env.local. When I say it is done, ask
me to run `pnpm diagnose` and tell you what it printed, then fix any problem it
reports.
```

## Rebrand it

```text
Rebrand this app for <company>: name "<app name>", primary color <hex>, and
the logo at public/logo.svg. Change only src/styles/tokens.css and
app.config.ts, keep text contrast accessible in light and dark mode, then run
pnpm check.
```

## Add a page

```text
Add a page called "<name>" that shows <what you want to see>. Follow "Add a
page" in AGENTS.md and copy the closest example view. Before writing SQL,
inspect the relation with the SourceMedium MCP or `pnpm schema`. Give it sample
data too, then run pnpm check.
```

## Add a page from my own table

```text
I have a table <dataset.table> in my warehouse with <what it holds>. Build a
page that <what you want>. Read docs/data.md, inspect the table's columns with
`pnpm schema <dataset.table>` (never guess them), decode rows with a row
schema, add sample data with the same shape, and run pnpm check.
```

## Build an inventory view

```text
Build an Inventory page on obt_inventory_positions. First inspect its columns
and grain with the SourceMedium MCP (describe_table) or `pnpm schema
obt_inventory_positions`, and tell me the grain before writing any SQL. Then
show current units on hand by product for the selected store, following "Add a
page" in AGENTS.md, and run pnpm check.
```

## Check a number

```text
The <metric> on the <view> page shows <value> for <store> from <date> to
<date>. Check it against the SourceMedium MCP's query_metrics for the same
store and dates. If they differ, explain why from the SQL and the catalog
definition, without changing anything yet.
```

## Build something unrelated

```text
Add <feature> to this app. Read AGENTS.md first. If it reads warehouse data,
follow its five rules; if it needs to write anything or act on behalf of a
person, stop and tell me, because this app's viewer guards are shared and
read-only by design (docs/auth.md). Run pnpm check when done.
```
