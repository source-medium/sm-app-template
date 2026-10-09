# Build in your browser

Use **Codex Cloud** or **Claude Code in the cloud** to change this app by
chatting. Both follow the same loop:

**Describe a change → open its preview → ask for adjustments → approve publication.**

You need GitHub, access to either coding agent's cloud service, and a
Cloudflare account on Workers Paid to host the app. You do not need to
install anything on your computer. Sample data is only for the first look.
Connect your warehouse once, then review changes on protected previews with
your actual data before publishing them.

## 1. Make your copy

[Create a repository from this template](https://github.com/source-medium/sm-app-template/generate).
Choose your own account or organization and a name for the app. A private
repository is a good default for an internal app. Keep using this same copy
in your agent and Cloudflare; making another copy loses your changes.

## 2. Choose your agent

### Codex Cloud

Open [Codex](https://chatgpt.com/codex), connect GitHub, and select **your copy**.
Create a cloud environment for it. During environment setup, ask Codex:

```text
Prepare this repository using Node 24 and node scripts/setup-agent.mjs.
Run pnpm check. Use pnpm dev when a task needs a local browser preview.
Keep sample data; no secrets or MCP connection are needed.
If default cache directories are read-only, choose writable workspace caches
and save those paths in the environment for subsequent tasks too.
```

Review the setup result, **Publish** the environment, and start a task in it.
Publishing the Codex environment saves its tools; it does not publish the app.
Use package-manager network access and allow the [browser download hosts](#setup-help).
Allow the preview's hostname later if
Codex needs to open it. See [OpenAI's environment guide](https://learn.chatgpt.com/docs/environments/cloud-environments).

### Claude Code in the cloud

Open [Claude Code](https://claude.ai/code), connect GitHub, and grant access
to **your copy**. Select that repository and its default branch. Use the
Default environment with **Trusted** network access, the [browser download hosts](#setup-help), and an editing mode.
The repository's startup hook runs the shared setup automatically in cloud
sessions. If Claude's default Node is too old, it selects Node 24 for setup and
subsequent commands without a global install. No setup script needs to be
pasted into Claude's settings. Allow the browser download hosts before starting
the first session; **Trusted** alone may block them.

Use one repository per session so its hooks load. Organization accounts may
need an owner to enable the GitHub connector. See Anthropic's
[quickstart](https://code.claude.com/docs/en/web-quickstart) and
[environment guide](https://code.claude.com/docs/en/cloud-environments).

### Your first message, in either agent

```text
Help me get this app running. Read AGENTS.md and use the sm-cloud skill.
Use the existing defaults. Run the setup and checks yourself.
Walk me through connecting this repository to Cloudflare using docs/cloud.md.
I authorize committing my requested changes, pushing a task branch, and
opening or updating its pull request. Sample data is for initial setup only;
help me connect production and protected previews to my warehouse before iteration.
Give me the hosted link, build id, and verified data mode when it is ready. Do not merge or publish to the
production branch until I approve the reviewed change. Ask me only for
account connections or choices you cannot complete yourself.
```

## 3. Connect Cloudflare once

In [Cloudflare Workers & Pages](https://dash.cloudflare.com/?to=/:account/workers-and-pages),
choose **Create application → Import a repository** and connect **your copy**.
The agent can walk you through this screen; sign in and accept billing yourself.
Workers Paid starts at US$5 a month; the Free plan's CPU limit is too low to
render a page.

Connect the **Production Worker** first for the initial sample app. Connect
the **Preview Worker** and its data before starting the preview-to-publish loop.
Both use the same repository; no second template copy is needed.
Your agent supplies the app name from `wrangler.jsonc` (initially `sm-app`).
If either name already belongs to another app, have the agent prepare a unique
name in your copy before connecting it. Never overwrite a different app.

| Setting           | Production Worker            | Preview Worker                             |
| ----------------- | ---------------------------- | ------------------------------------------ |
| Worker name       | `<app>` (initially `sm-app`) | `<app>-preview`                            |
| Production branch | `main`                       | `main`                                     |
| Build command     | `pnpm check`                 | `pnpm check`                               |
| Deploy command    | `pnpm run deploy`            | `pnpm run deploy --env preview`            |
| Preview command   | Unused                       | `pnpm run deploy:preview`                  |
| Preview builds    | Disabled                     | Enabled for non-production branches        |
| Root directory    | Repository root              | Repository root                            |
| Runtime secrets   | Production app block         | Development app block in **Previews Base** |

Both deploy commands build the Worker and remove build-time environment values.
Cloudflare handles its deployment credentials; neither agent needs a Cloudflare
API token. See [Workers Builds settings](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/).

Leave production secrets empty only for the initial sample app. A preview
without its live configuration deliberately shows a setup error (503), not
sample numbers. Complete [Connect your data](#connect-your-data), including
preview data, before moving to step 4.

Every merge into `main` publishes to the production URL. The preview
connection uses the `preview` environment and creates one **Worker Preview**
per task branch, so a pull request gets its own URL and `main` stays as it
was; no empty pull request is needed. Cloudflare Builds targets its connected
Worker; adding `--env preview` to the production Worker's preview command is
not a substitute for a separate preview connection. See [Cloudflare's environment setup](https://developers.cloudflare.com/workers/ci-cd/builds/advanced-setups/#wrangler-environments).

The preview Worker reads the same warehouse through the Development app
credential and requires a viewer guard. Production's extra URLs stay disabled.
Keeping a separate preview Worker avoids enabling production Version URLs
when enabling branch previews: Cloudflare uses the same URL switch for both.
See [preview hosts](https://developers.cloudflare.com/workers/previews/custom-domains/).

For an existing Worker using the old preview system, follow Cloudflare's
[one-time switch](https://developers.cloudflare.com/workers/ci-cd/builds/build-branches/#existing-workers-connected-to-builds)
before setting the Preview command. Do not turn on `preview_urls` as a workaround.

## 4. Change, review, publish

Ask either agent to make a change. It opens a pull request (the proposed change
in GitHub). Open the Preview URL on that pull request, or under the
`<app>-preview` Worker's **Previews**, and sign in with the preview password.
Confirm **Live data**, the intended store, and the change before approving.
Your agent checks `/healthz` against the PR's current commit and runs the
hosted verification below when authenticated access is available. A successful
build alone is not a working preview. If the agent cannot sign in, it gives
you the exact check to finish privately. Keep feedback in the same agent conversation to update
that pull request. The app's **Ask agent** button can compose the next request
from a page or component.

When it looks right, say:

```text
Publish the change I just reviewed. Follow the sm-cloud publication checks.
Give me the live link only after verifying the deployment, or the exact step
that still needs me. Do not include unrelated changes.
```

Do not approve a sample-data or broken preview after connecting your data.
If no preview Worker is connected, finish that setup before iterating on the
live app; merging into production is not a preview step.

If the agent cannot merge, click **Merge pull request** in GitHub after the
checks pass. Cloudflare then deploys `main`. The agent verifies `/healthz`
matches the resulting commit on `main` (which can differ from the PR commit
after merging), sign-in protection, **Live data**, the warehouse connection,
and the changed page with the intended store. If authenticated verification
needs you, the agent says **Deployed, awaiting verification**, not **Done**.

For enforced review, protect `main` with a GitHub branch rule requiring a pull
request and the CI checks. Have the agent guide that one-time setting where
your GitHub plan supports it. Cloudflare does not wait for GitHub CI by itself;
its build runs `pnpm check`, while the PR's CI also tests browsers and the Worker.
Never merge a failing PR or push directly to `main` in this workflow.

To undo a change, ask the agent to revert that publication through a new PR.
For urgent recovery, use the Worker's deployment rollback, then also revert
the Git change so the next build does not restore it. Runtime secrets and
warehouse data are separate from code rollback.

### Verify a hosted build

For shared-password deployments, the agent can run one command from the
matching checkout:

```sh
pnpm test:hosted <https-origin> <full-git-commit>
```

Use the actual deployed origin (no page path) and the full PR commit, or the
resulting `main` commit after publication. Enter only that deployment's
`APP_BASIC_AUTH` privately in the agent environment, never in chat or command
arguments. The agent needs no warehouse key or local `.env` file. Anyone using
that environment can read its variables and view the app's data, so use a
private environment with authorized collaborators. Allow the exact app hostname
in its network settings.

The command starts no server and makes no deployment. It first checks the build,
anonymous page/asset/RSC/Connection protection, then runs the hosted Connection
check and the existing live browser suite, one worker with no retries. It fails
on the wrong commit, missing guard, sample mode, or a failed Connection check.
Explicit empty reports are valid; interactions needing rows are skipped when
none are available. This checks app behavior, not the completeness or accuracy
of your warehouse data.
Warnings are counted; review their safe report on Connection. Browser traces,
screenshots, videos, and retained test artifacts are disabled. Run it only with
permission to view the data; these tests issue real warehouse queries.

Still confirm the intended store and requested change. For a restricted app,
verify that another `?store=` returns 403. With Cloudflare Access, or if you
prefer not to give the agent viewer access, sign in yourself and perform those
checks plus **Live data → Check connection** and each changed report. The agent
can still check the build and anonymous challenge. A redirect to sign-in is
not proof that authenticated data works. Do not remove Access to automate this.

## Connect your data

Use two app credentials for the same warehouse:

| SourceMedium app | Where its configuration goes                                                                                 |
| ---------------- | ------------------------------------------------------------------------------------------------------------ |
| **Production**   | Production Worker's runtime settings only                                                                    |
| **Development**  | Preview Worker's **Previews Base**, and optionally the coding agent's private environment for live debugging |

Create each once and keep its one-time block in your private password manager.
Reuse Development across previews and debugging; there is no third Preview
credential to create. Replacing or revoking Development affects both uses,
without changing Production. Each deployment still has its own store and
sign-in settings.
Already created a separate app named Preview? Reuse it as your Development
credential. These names describe how you use the apps; renaming or replacing
a working credential is not required.

Once you have an app-specific SourceMedium block, ask the agent to follow
[Connect and deploy](connect.md#connect-a-hosted-app). Enter the values privately
in the Worker's **production runtime** settings. No `.env.local` file, terminal,
or warehouse key in either agent's environment is needed for hosted setup.
Keep the complete viewer guard in place before sharing live data.

Connect [preview data](#connect-preview-data) at the same time. Production and
preview should use the same warehouse, reporting currency, and store scope.
There is no extra staging app to set up for ordinary iteration.

An accepted organization admin gets the block from **Apps** in their
SourceMedium workspace: name the app, confirm its read access, and copy the
one-time configuration. Apps appears in the workspace menu once data has been
delivered. If the page says credentials are still being enabled, stay on sample
data and ask SourceMedium support. An agent cannot generate a valid warehouse
credential for you.

After entering the runtime settings, click **Live data → Check connection**
in your hosted app. The report is safe to paste into either coding agent; it
contains no credentials, configured values, SQL, or warehouse rows.

## Connect preview data

Do this once before the first branch preview. The agent handles code and
deployment settings; you enter credentials privately.

1. Use the **Development** block from [Connect your data](#connect-your-data).
   If it does not exist yet, an organization admin creates that app in
   **SourceMedium → Apps** for the same warehouse. Keep the complete block
   privately so it can also be entered in your coding environment later.
2. In Cloudflare, open **`<app>-preview` → Settings → Variables and Secrets →
   Previews Base**. Add all eight values as **Secrets**, including
   `APP_BASIC_AUTH`. Use the issued Development password. Do not put this block in
   build settings or the preview Worker's **Production** tab. Production and
   Previews Base are different settings even on the preview Worker.
3. If production restricts a store, add the same `APP_STORE_ID` as a secret in
   Previews Base. Match any custom `BIGQUERY_MAX_BYTES_BILLED` limit too.
   These settings are not inherited from production. The repository already
   sets `APP_REQUIRE_LIVE=true` for previews, so missing credentials cannot
   produce sample reports. Do not remove that setting to clear an error.
4. Push the task branch after saving those settings. Open its actual Preview
   URL, sign in, confirm **Live data** and the correct store, then run
   **Live data → Check connection**. In a private window, opening a report
   without credentials must ask for the password. For Cloudflare Access,
   follow [preview sign-in](auth.md#preview-sign-in) instead.

New previews receive the saved secrets automatically. Cloudflare copies Base
secrets **when a preview is created**; changing Base later does not update
existing previews. For a preview created before setup, enter the block in that
preview's own settings and deploy it again, or have your agent delete and
recreate that specific preview with your approval. Republishing its code alone
does not import the new Base secrets. See [Cloudflare's secret inheritance](https://developers.cloudflare.com/workers/previews/configuration/#secrets).
For credential rotation or tighter access, follow [Replacing secrets](operations.md#replacing-secrets).
Old immutable URLs retain their original secrets; our hosted rehearsal required
retiring the preview Worker to close them. A branch update or deletion alone
is not a verified access-revocation path.

Only trusted branches may receive these credentials: anyone able to deploy
preview code can use its read-only warehouse access. Do not enable live previews
for untrusted pull requests. Automated CI tests continue to use deterministic
fixtures; customer review and query validation use the protected live preview.

## Debug with live data

Optional: use this when your agent needs to inspect your actual schema, reproduce
a data error, or test changed queries. Sample development needs no credential.

1. Reuse the **Development** block already used by hosted previews. If you
   start with debugging, create Development once as described in
   [Connect your data](#connect-your-data), then reuse it for previews later.
   Use the complete eight-value block, including `APP_BASIC_AUTH`. Keep the
   Production credential out of the agent environment. If the one-time secret
   was not saved, [replace it](operations.md#replacing-secrets) and update every
   Development use; do not inspect deployed or local secret files to recover it.
2. Enter the block privately in your coding environment's settings:

   | Agent                 | Where to enter it                                                                                                                                                                                                                                                                                           |
   | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
   | **Codex Cloud**       | **Settings → Codex Cloud → Environments → Edit → Environment variables → Manage**. Add each name and value. For a personal credential, use **Personal vault**, type **Environment variable**, scoped to this environment, and request those names in the environment. Save, republish and start a new task. |
   | **Claude Code Cloud** | At **claude.ai/code**, open the cloud environment selector, edit your environment, and paste the whole block into **Environment variables**. Save and start a new session.                                                                                                                                  |

   Use **environment variables**, not **network secrets**: the app must read the
   private key to sign Google's login request. These values are accessible to
   agent-run code and anyone authorized to use the environment. Choose a private
   environment for this repository. Never paste the block into chat or write it
   into repository files. See the current [Codex settings](https://learn.chatgpt.com/docs/environments/cloud-environments)
   and [Claude settings](https://code.claude.com/docs/en/cloud-environments#set-environment-variables).

3. Allow `oauth2.googleapis.com` and `bigquery.googleapis.com` in that environment's
   network settings, keeping the package/browser hosts needed for setup. The agent
   needs no Google Cloud console login, `gcloud`, or MCP connection for this path.
4. Send the agent this message, which contains no secret:

   ```text
   I configured the Development app block in this environment and authorize
   read-only debugging against that warehouse. Follow docs/cloud.md#debug-with-live-data.
   Run pnpm diagnose yourself, then pnpm schema for the tables needed for my task.
   Do not inspect secret files or print environment values. If diagnose confirms
   Live data and passes, run the relevant pnpm test:live checks to verify the change.
   Run pnpm check too. Keep automated tests on fixtures; verify the protected hosted
   preview with actual data before publication.
   Report what you verified and any remaining failure. Do not deploy or change IAM.
   ```

The existing commands consume environment settings directly; no local secret
file is needed. `pnpm test:live` signs in automatically using `APP_BASIC_AUTH`,
runs one browser worker without automatic retries, and disables traces, videos,
screenshots and HTML reports. It executes real queries and uses the app's query
allowance. Start with `pnpm diagnose`; use `pnpm test:live --grep Overview`
when only Overview changed, or omit the filter for all included views. Treat
live test output as internal; it may identify warehouse fields or values.

`pnpm check` and `pnpm test:e2e` stay on synthetic data even in a live-configured
environment. Cloudflare builds and `pnpm test:secrets` scan for both local-file
and injected credentials. Keep any
live browser session private and guarded; never remove the password to make
automation easier. Hosted previews and authorized agent debugging share the
Development credential. Neither requires the production key.

Replace or revoke the **Development** app in SourceMedium when needed. Follow
[Replacing secrets](operations.md#replacing-secrets) to update Base, retire old
preview URLs, and recreate active previews. Update agent environment settings
and start a new task/session too. Revoking Development affects both preview
queries and agent debugging; it does not revoke Production.

**Legacy Codex Cloud:** its Secrets are only available during setup, so that
field cannot support interactive live debugging. Use the current Codex Cloud
environment described above; do not copy a setup secret into a file to retain it.
See [the legacy environment guide](https://learn.chatgpt.com/docs/environments/cloud-environment).

### Discover schemas without sharing the app key

Both cloud agents can use `pnpm schema <relation>` on the bundled starter
snapshot with no secrets. Its output labels the snapshot; it does not verify
your warehouse. For a custom relation, use your separately authorized
SourceMedium MCP connection if your agent environment supports it. Otherwise
ask your SourceMedium admin for the relation's columns and types, or run
`pnpm schema <relation>` from an authorized local checkout and share that
schema-only output. For direct inspection by your cloud agent, opt into the
[Development credential](#debug-with-live-data) above. A deployed app's
key does not connect MCP.

## Setup help

Tell the agent what failed. It should resolve setup before asking you to run commands.

For browser installation, allow `cdn.playwright.dev`, `storage.googleapis.com`,
and `playwright.download.prss.microsoft.com` in the agent environment. These
are download destinations, not warehouse credentials. An agent can check the
current URLs with `pnpm exec playwright install --dry-run chromium`.
For the starter's fonts, also allow `fonts.googleapis.com`, `fonts.gstatic.com`,
`api.fontshare.com`, and `cdn.fontshare.com`; otherwise font loading or the
production build can fail. Keep the
locked Playwright browser version for release checks; a different preinstalled
Chromium is only a limited visual smoke check.

| What happened                            | What the agent should do                                                                                                                                                                                                   |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Repository missing                       | Check that the GitHub connection includes your copy; organization approval may be needed.                                                                                                                                  |
| Install failed or dependencies changed   | Run `node scripts/setup-agent.mjs` again. It preserves the lockfile and uses the pinned pnpm without a global install. Use Node 24 if the runtime is too old.                                                              |
| Browser download blocked                 | Allow `cdn.playwright.dev` and its download redirect hosts reported by Playwright, then rerun setup. Keep TLS verification enabled.                                                                                        |
| Cache directory is read-only             | In the Codex environment, set writable workspace paths for `npm_config_cache`, `XDG_DATA_HOME`, `XDG_CACHE_HOME`, `XDG_CONFIG_HOME`, and `PLAYWRIGHT_BROWSERS_PATH`. Save them for both setup and later tasks, then retry. |
| Port 3000 is occupied                    | Reuse the intended server or stop only the stale process the agent started. Stopping an npm wrapper may leave Next running; verify the listener stops. Do not switch ports silently.                                       |
| Linux browser libraries missing          | Run `pnpm exec playwright install --with-deps chromium` in the cloud VM. No changes to your own computer.                                                                                                                  |
| Cached environment is stale              | Rerun setup in the task. In Codex, update and republish the environment for future tasks too.                                                                                                                              |
| No hosted preview link                   | Confirm the preview Worker is connected, the task branch was pushed, preview builds are enabled, and its Cloudflare build passed. `localhost` is not a hosted link.                                                        |
| Preview says it requires live data       | Follow [Connect preview data](#connect-preview-data). If the preview existed before Base was configured, update that preview's own settings too. Do not switch it to sample mode.                                          |
| Agent cannot open the preview            | Allow that specific hostname in its network settings; you can still open the link yourself.                                                                                                                                |
| MCP asks for login                       | Skip it for sample work. Use bundled `pnpm schema` output. Live metadata access is optional and separately authorized.                                                                                                     |
| Agent still sees sample data after setup | Put all eight Development values in environment variables, start a new task/session, and run `pnpm diagnose`. A network-secret placeholder cannot sign Google requests.                                                    |
| Google requests cannot connect           | Allow `oauth2.googleapis.com` and `bigquery.googleapis.com`. Keep TLS verification enabled; do not change the key or disable the guard to fix a network policy.                                                            |
| Live app shows a configuration error     | Fix the named production runtime settings using [operations.md](operations.md); never paste secret values into chat.                                                                                                       |

The platform account/authorization screens must be completed by the account
owner. Fresh-account journeys in both cloud agents are tracked separately in
[release readiness](release-readiness.md); local checks do not prove those screens.
