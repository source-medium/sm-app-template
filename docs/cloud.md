# Deploy and iterate on Cloudflare

Cloudflare owns the default deployment path: **Artifacts stores your Git
repository, Workers Builds checks each push, and Workers hosts the app.**
GitHub Actions and pull requests are not required to publish.

**Describe a change → open its branch preview → ask for adjustments → approve publication.**

Use your coding agent to handle setup and changes. You sign into accounts,
accept billing, enter warehouse credentials privately, and review the result.
Samples are for the first look; after connection, previews use your actual data.
Choose [how viewers sign in](auth.md#choose-sign-in-with-your-agent) once;
the agent carries that choice through production and preview setup.

Artifacts is in **open beta** and requires Workers Paid, as does this app.
Check current [Artifacts pricing](https://developers.cloudflare.com/artifacts/platform/pricing/)
and [build allowances](https://developers.cloudflare.com/workers/ci-cd/builds/limits-and-pricing/).
Workers Paid starts at US$5 a month; Artifacts storage/operations and build
usage have their own allowances and billing dates; check the pricing page for the current terms.
An existing GitHub repository can stay there if you prefer: Cloudflare runs
the same checks and deployments directly from that source too.

## 1. Make your copy

Keep using your existing app repository. For a new app, have your local agent
clone [this starter](https://github.com/source-medium/sm-app-template) into a
new project directory; reading the public starter needs no GitHub account.
Have it create your own Artifacts repository and push the starter there once.
Do not point a customer's deploy at the upstream template repository.

The agent handles these one-time steps with your authorization:

1. Sign in to Cloudflare with the project-local `pnpm exec wrangler login`.
   Confirm the account, namespace, repository and unique Worker name first.
   Artifacts needs Read/Edit permissions; refresh an older Wrangler login if
   it lacks Artifacts access. You complete sign-in and billing privately.
2. Use the installed `wrangler artifacts repos` commands to create the app's
   repository in the chosen namespace (`default` is enough for one app).
   Creating a repository also creates a missing namespace. Reuse an existing
   repository during iteration; do not create a second copy.
3. Configure Git with the returned HTTPS remote and repo-scoped write access.
   Keep token values out of chat, command arguments, logs and remote URLs.
   Set `WRANGLER_WRITE_LOGS=false` when capturing credential-bearing CLI output
   privately, and use a secure Git credential helper or process-scoped Git
   configuration. Treat returned tokens as opaque credentials. Track their
   expiration; renew repo-scoped access with `wrangler artifacts repos issue-token`
   and replace the saved credential when needed. Never store a token in tracked
   files or `.git/config`. Follow [Artifacts Git authentication](https://developers.cloudflare.com/artifacts/api/git-protocol/).
4. Preserve the upstream remote, add the customer's remote as `cloudflare`,
   and push the intended initial commit to `main`. Do not force-push or copy
   unrelated branches. Confirm that the remote contains the commit before
   connecting Builds. Artifacts Builds requires `main` for production.

For later changes, the agent uses ordinary Git against that same remote.
No GitHub account, pull request, or GitHub Actions secret is needed.

## 2. Choose your agent

Use local Codex or Claude Code with the Artifacts-backed checkout for the
Cloudflare-only path. Ask it to run `node scripts/setup-agent.mjs` with Node 24.
The setup installs the pinned dependencies and test browser; it needs no
warehouse key. Start with the message below.

### Your first message, in either agent

```text
Help me get this app running. Read AGENTS.md and use the sm-cloud skill.
Use the existing defaults. Run setup and checks yourself.
Set up Cloudflare Artifacts and Workers Builds using docs/cloud.md, so pushing
an approved change to main automatically checks and deploys it.
I authorize creating this app's repository and Workers, seeding main for the
initial sample deployment, committing my requested changes, and pushing task
branches for previews. Reuse my existing app if present.
Sample data is for initial setup only; help me connect production and protected
previews to my warehouse before iteration.
Recommend sign-in once, then handle setup; reuse any choice I already made.
Give me the hosted link, build id, and verified data mode. After initial setup,
do not push to main or publish changes until I approve the reviewed change. Ask only for
account connections or decisions you cannot complete yourself.
```

### Optional browser coding agents

If your browser agent uses a GitHub repository connection, keep GitHub as its
source host and connect that same repository to Workers Builds in step 3.
There is no additional GitHub deployment step; Cloudflare runs the release gate.
Use [a copy of the template](https://github.com/source-medium/sm-app-template/generate),
not the upstream repository. The starter message's Artifacts setup can be
replaced with “Use my existing GitHub repository as the source.” Authorize PR
creation if that is how your agent hands off changes.

### Codex Cloud

Open [Codex](https://chatgpt.com/codex), connect GitHub, and select **your copy**.
Create a cloud environment for it. Before setup, enable package-manager
network access and allow the [browser download hosts](#setup-help). Ask it to
use Node 24 and run `node scripts/setup-agent.mjs`, then `pnpm check`.
If caches are read-only, have it choose writable workspace caches and save
those paths for subsequent tasks. Publish the environment and start a task.
Publishing this environment saves its tools; it does not publish the app.
Allow the preview hostname when needed. See [OpenAI's environment guide](https://learn.chatgpt.com/docs/environments/cloud-environments).

### Claude Code in the cloud

Open [Claude Code](https://claude.ai/code), connect GitHub, and grant access
to **your copy**. Select its default branch. Use the Default environment with
Trusted network access plus the [browser download hosts](#setup-help), and an
editing mode. Trusted alone may block browser downloads. The startup hook
runs setup automatically and selects Node 24 if needed. Use one repository
per session so its hooks load. Organization accounts may need an owner to
enable the connector. See Anthropic's [quickstart](https://code.claude.com/docs/en/web-quickstart)
and [environment guide](https://code.claude.com/docs/en/cloud-environments).

## 3. Connect Cloudflare once

Connect the **Production Worker** first for the initial sample app, then the
**Preview Worker** and its data before iteration. Both use the same repository.
The agent supplies the name from `wrangler.jsonc` (initially `sm-app`); choose
a unique name first if either target already belongs to another app.

For Artifacts, open [Workers & Pages](https://dash.cloudflare.com/?to=/:account/workers-and-pages),
choose **Create application → Continue with Artifacts**, then the namespace
and repository. For an existing Worker, use **Settings → Builds → Connect**
and select the Artifacts namespace in **Git connection**. With the optional
GitHub source, choose **Import a repository** instead. See [Cloudflare's Artifacts integration](https://developers.cloudflare.com/workers/ci-cd/builds/git-integration/artifacts-integration/).

| Setting           | Production Worker                                    | Preview Worker                                       |
| ----------------- | ---------------------------------------------------- | ---------------------------------------------------- |
| Worker name       | `<app>` (initially `sm-app`)                         | `<app>-preview`                                      |
| Production branch | `main`                                               | `main`                                               |
| Build command     | `pnpm exec playwright install --only-shell chromium` | `pnpm exec playwright install --only-shell chromium` |
| Deploy command    | `pnpm run deploy`                                    | `pnpm run deploy --env preview`                      |
| Preview command   | Unused                                               | `pnpm run deploy:preview`                            |
| Production builds | Enabled                                              | Disabled                                             |
| Preview builds    | Disabled                                             | Enabled for trusted non-production branches          |
| Build cache       | Enabled                                              | Enabled for Previews Base                            |
| Root directory    | Repository root                                      | Repository root                                      |
| Runtime secrets   | Production app block                                 | Development app block in **Previews Base**           |

Use the repository's Node version and pinned pnpm version from `package.json`;
set the build variable `PNPM_VERSION` to that pnpm version if needed. The build
command downloads the locked Chromium headless shell used by this app's
browser tests. Do not use `--with-deps` in Workers Builds: it attempts a
root-only system package install. `pnpm test:browser` supplies missing Linux
libraries automatically in Workers Builds, using the locked Playwright
dependency list and Ubuntu's signed package repositories. Packages are extracted
to a temporary directory for the test process, then removed; no root access,
system changes, or extra build variables are needed. Both deployment
commands then run **`pnpm check:deploy`**: format/lint/types/guardrails/unit
checks, one sanitized Cloudflare build, secret isolation, browser tests, and
Worker smoke tests. All tests reuse that build; only a passing gate uploads it. The
same gate runs for local deployment, so GitHub CI is never the release gate.
Missing browser dependencies or failed checks stop the deploy; fix the cause
instead of bypassing the command. No live warehouse credentials belong in Builds.
When upgrading an existing connection, set the browser-install command in
**Builds → Production** on both Workers and **Builds → Previews Base** on the
Preview Worker. Save before pushing the next change, then inspect that build's
commands. If it still executes an old command despite a saved setting, reconnect
that Worker to the same repository with the corrected commands. Restore its
branch filters, pinned pnpm variable and existing build token, and enable Worker
Previews again on the Preview Worker. Keep runtime secrets in place. Verify a
new push before calling the connection repaired.

On the Preview Worker, turn on **Builds → Production → Disable builds**.
Keep **Builds → Previews Base → Builds for Preview branches** enabled. This
prevents a second, unused deployment on each push to `main`. Enable **Build
cache** for production on the Production Worker and for Previews Base on the
Preview Worker. Cloudflare caches pnpm packages and Next.js compilation output;
tests still run on every deployment. Existing previews keep their own build
settings, so enable the cache under each retained preview’s **Settings → Builds** too.

Preview and production each run the release gate in their own build. A preview
pass is not a transferable production artifact. Keeping both gates avoids
custom artifact storage, credentials, or a second release service.

Cloudflare supplies its deployment credentials through Workers Builds. Keep
app credentials in runtime settings only. See [Builds settings](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/).
For Artifacts, check **Advanced settings → API token** before connecting. An
older build token may lack Artifacts permissions; choose **Create new token**
and confirm its deployment access instead of reusing that incompatible token.
Wrangler's local login is separate and does not update the hosted build token.
If the form reports an internal error, check the actual failure before retrying:
`The Workers Builds token cannot authenticate with Cloudflare Artifacts` means
the selected build token needs Artifacts access.
Leave production secrets empty only for the initial sample app. A preview
without live configuration deliberately returns a setup error, not sample
numbers. Complete [Connect your data](#connect-your-data) and
[Connect preview data](#connect-preview-data) before iteration.

Every successful push to `main` checks and deploys production automatically.
Task branches build on `<app>-preview` and get their own Worker Preview URL
under its **Previews** tab. Production keeps serving its current version if
checks fail. Keep production Version URLs disabled; adding `--env preview`
to the production Worker's preview command does not replace the separate
preview Worker. See [environment setup](https://developers.cloudflare.com/workers/ci-cd/builds/advanced-setups/#wrangler-environments)
and [preview hosts](https://developers.cloudflare.com/workers/previews/custom-domains/).

For an existing Worker using the old preview system, follow Cloudflare's
[one-time switch](https://developers.cloudflare.com/workers/ci-cd/builds/build-branches/#existing-workers-connected-to-builds)
before setting the Preview command. Do not turn on production `preview_urls`.

**Setup is complete only after the first real task-branch push creates a
passing preview build for that commit.** Check the actual commands and source
connection on both Workers. A local commit, a push to a different remote, or
passing GitHub checks does not establish auto-deploy. Before migrating an
existing connection, push its reviewed source to Artifacts, then disconnect
the old Builds source and connect Artifacts. Existing deployments stay live
during this switch. Keep the old remote until the new path is verified.

## 4. Change, review, publish

Ask your agent to make a change on a task branch and push it to the connected
remote. Open its URL under the `<app>-preview` Worker's **Previews** tab and
sign in. Confirm **Live data**, the intended store, and the requested change.
The agent matches `/healthz` to that branch commit and runs the
[hosted verification](#verify-a-hosted-build) when authenticated access is
available. If it cannot sign in, it gives you the exact private check to finish.
Keep feedback in the same conversation and branch. The app's **Vibe code**
button can compose the next request from a page or component.

When it looks right, say:

```text
Publish the change I just reviewed. Follow the sm-cloud publication checks.
Give me the live link only after verifying the deployment, or the exact step
that still needs me. Do not include unrelated changes.
```

The agent checks the remote `main` and reviewed branch again, promotes only
that reviewed change, and pushes `main` to the connected remote. Cloudflare
runs the release gate and deploys it. If combining with newer `main` changes
alters the reviewed result, verify that combined commit on the task preview
before promotion. Never force-push. With GitHub source hosting, an approved PR
merge can do this promotion instead; GitHub Actions is not required by the
Cloudflare deploy commands. Keep any repository protection rules in place.

The agent verifies the resulting production commit via `/healthz`, anonymous
sign-in protection, hosted Connection, and the changed page with the intended
store. If authenticated verification needs you, it reports **Deployed,
awaiting verification**. A successful build alone is not proof the app works.
Do not publish a broken or sample-data preview after connecting live data.

To undo a publication, revert its code on a task branch, review, and push the
approved revert to `main` using current runtime settings. For urgent Worker
version rollbacks, first follow [Rolling back](operations.md#rolling-back):
they can restore old passwords and store restrictions. Revert the source too
so the next push does not restore the broken change.

### Verify a hosted build

For shared-password deployments, the agent can run one command from the
matching checkout:

```sh
pnpm test:hosted <https-origin> <full-git-commit>
```

Clean local builds and Workers Builds both identify the source commit in
`/healthz`. A local checkout with uncommitted or untracked files appends
`-dirty`; a source archive without Git or host metadata uses a unique `local-`
identifier. Neither passes commit verification. Commit the reviewed changes
and rebuild before publishing a verifiable manual deployment.

Use the actual deployed origin (no page path) and the full task-branch commit, or the
resulting `main` commit after publication. Enter only that deployment's
`APP_BASIC_AUTH` privately in a private agent environment, never in chat or
command arguments; anyone using that environment can view the app's data. The
agent needs no warehouse key or local `.env` file. Allow the exact app hostname
in its network settings.

The command starts no server and deploys nothing. It checks the build and
anonymous protection, then runs the hosted Connection check and the live
browser tests with one worker and no retries. It fails on the wrong commit, a
missing guard, sample mode, or a failed Connection check; review any counted
warnings on Connection. It checks app behavior, not the completeness or
accuracy of your warehouse data, and issues real warehouse queries, so run it
only with permission to view the data. Traces, screenshots and videos are
disabled.

Use the full suite above for first connection and changes to shared auth,
configuration, data handling, filters, runtime, or dependencies. For a change
confined to one report, select its relevant test titles from `e2e/live.spec.ts`:

```sh
pnpm test:hosted <https-origin> <full-git-commit> --grep '/overview|Overview'
```

`--grep` narrows report tests by title; build, guard, and Connection checks
always run, and a filter matching no tests fails. For a new interaction, add or
update its test. Use the same scope on the preview and resulting production commit.

Still confirm the intended store and requested change. For a restricted app,
verify that another `?store=` returns 403. With Cloudflare Access, or if you
prefer not to give the agent viewer access, sign in yourself and perform those
checks plus **Live data → Check connection** and each changed report. The agent
can still check the build and anonymous challenge. A redirect to sign-in is
not proof that authenticated data works. Do not remove Access to automate this.

## Connect your data

Your agent carries the [agreed sign-in](auth.md#choose-sign-in-with-your-agent)
through these steps; there is no new sign-in decision when replacing a key.

Use two app credentials for the same warehouse:

| SourceMedium app | Where its configuration goes                                                                                 |
| ---------------- | ------------------------------------------------------------------------------------------------------------ |
| **Production**   | Production Worker's runtime settings only                                                                    |
| **Development**  | Preview Worker's **Previews Base**, and optionally the coding agent's private environment for live debugging |

Create each once and keep its one-time block in your private password manager.
Reuse Development for previews and debugging; there is no third credential, and
replacing or revoking Development does not change Production. Already created
an app named Preview? Reuse it as Development; the names only describe how you
use the apps.

An accepted organization admin gets each block from **Apps** in their
SourceMedium workspace: name the app, confirm its read access, and copy the
one-time configuration. Apps appears in the workspace menu once data has been
delivered. If the page says credentials are still being enabled, stay on sample
data and ask SourceMedium support. An agent cannot generate a valid warehouse
credential for you.

Then ask the agent to follow [Connect and deploy](connect.md#connect-a-hosted-app),
which also covers how money is labeled. Enter the values privately
in the Worker's **production runtime** settings; no `.env.local` file, terminal,
or warehouse key in the agent's environment is needed. Connect
[preview data](#connect-preview-data) at the same time, with the same warehouse,
reporting currency, and store scope. Keep the complete viewer guard in place
before sharing live data.

After entering the runtime settings, click **Live data → Check connection**
in your hosted app. The report is safe to paste into either coding agent; it
contains no credentials, configured values, SQL, or warehouse rows.

## Connect preview data

Do this once before the first branch preview. The agent handles code,
deployment settings and the agreed [preview sign-in](auth.md#preview-sign-in);
you enter credentials privately.

1. Use the **Development** block from [Connect your data](#connect-your-data).
   If it does not exist yet, an organization admin creates that app in
   **SourceMedium → Apps** for the same warehouse. Keep the complete block
   privately so it can also be entered in your coding environment later.
2. In Cloudflare, open **`<app>-preview` → Settings → Variables and Secrets →
   Previews Base**. Add `SM_CONNECTION` as one **Secret**, then
   [configure the chosen sign-in](auth.md#configure-the-chosen-sign-in) there.
   For a shared password, use the issued Development `APP_BASIC_AUTH`. For
   Access, use the preview application's settings and omit `APP_BASIC_AUTH`.
   Do not put this block in build settings or the preview Worker's
   **Production** tab. Production and Previews Base are different settings
   even on the preview Worker.
3. If production restricts a store, add the same `APP_STORE_ID` as a secret in
   Previews Base. Match any custom `BIGQUERY_MAX_BYTES_BILLED` limit too.
   These settings are not inherited from production. The repository already
   sets `APP_REQUIRE_LIVE=true` for previews, so missing credentials cannot
   produce sample reports. Do not remove that setting to clear an error.
4. Push the task branch after saving those settings. Open its actual Preview
   URL, sign in, confirm **Live data** and the correct store, then run
   **Live data → Check connection**. In a private window, opening a report
   without credentials must require the chosen sign-in. For Cloudflare Access,
   also verify allowed and denied reviewers on branch and immutable URLs as
   described in [preview sign-in](auth.md#preview-sign-in).

New previews receive the saved secrets automatically. Cloudflare copies Base
secrets **when a preview is created**; changing Base later does not update
existing previews. For a preview created before setup, enter the block in that
preview's own settings and deploy it again, or have your agent delete and
recreate that specific preview with your approval. Republishing its code alone
does not import the new Base secrets. See [Cloudflare's secret inheritance](https://developers.cloudflare.com/workers/previews/configuration/#secrets).
For credential rotation or tighter access, follow [Replacing secrets](operations.md#replacing-secrets).
Old immutable preview URLs keep their original secrets until you retire the
preview Worker; updating or deleting a branch does not revoke access.

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
   Local browser tests use `SM_CONNECTION` and `APP_BASIC_AUTH`, even when
   hosted previews use Access. This is a separate
   local viewer guard, not a change to hosted sign-in. Keep the
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

The commands read environment settings directly; no local secret file is
needed. `pnpm test:live` signs in with `APP_BASIC_AUTH`, runs one browser
worker without retries or artifacts, and executes real queries. Use
`pnpm test:live --grep Overview` when only Overview changed, or omit the filter
for all views. Treat its output as internal; it may identify warehouse fields or
values. `pnpm check` and `pnpm test:e2e` stay on synthetic data even in a
live-configured environment. Never remove the password to make automation easier.

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

Without secrets, `pnpm schema <relation>` prints the bundled starter snapshot,
labeled as such; it does not verify your warehouse. For a custom relation, use
a separately authorized SourceMedium MCP connection, ask your SourceMedium
admin for its columns and types, or share schema-only `pnpm schema` output from
an authorized local checkout. For direct inspection, use the
[Development credential](#debug-with-live-data) above.

## Setup help

Tell the agent what failed. It should resolve setup before asking you to run commands.

Browser tests need Chromium. Setup tries to download it and only warns if it
cannot; `pnpm check` and `pnpm dev` work without it. To enable browser tests,
allow `cdn.playwright.dev`, `storage.googleapis.com`, and
`playwright.download.prss.microsoft.com` in the agent environment. These are
download destinations, not warehouse credentials; an agent can check the
current URLs with `pnpm exec playwright install --dry-run chromium`. The app
uses system fonts, so no font hosts are needed. Keep the locked Playwright
browser version for release checks; a different preinstalled Chromium is only
a limited visual smoke check.

| What happened                            | What the agent should do                                                                                                                                                                                                   |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Repository missing                       | Check the connected Artifacts namespace/repository and Git access. For a browser agent, check its GitHub access to your copy.                                                                                              |
| Install failed or dependencies changed   | Run `node scripts/setup-agent.mjs` again. It preserves the lockfile and uses the pinned pnpm without a global install. Use Node 24 if the runtime is too old.                                                              |
| Browser download blocked                 | Setup warns and continues; `pnpm check` and `pnpm dev` still work. For browser tests, allow `cdn.playwright.dev` and the redirect hosts Playwright reports, then rerun setup. Keep TLS verification enabled.               |
| Cache directory is read-only             | In the Codex environment, set writable workspace paths for `npm_config_cache`, `XDG_DATA_HOME`, `XDG_CACHE_HOME`, `XDG_CONFIG_HOME`, and `PLAYWRIGHT_BROWSERS_PATH`. Save them for both setup and later tasks, then retry. |
| Port 3000 is occupied                    | Reuse the intended server or stop only the stale process the agent started. Stopping an npm wrapper may leave Next running; verify the listener stops. Do not switch ports silently.                                       |
| Linux browser libraries missing          | Run `pnpm exec playwright install --with-deps chromium` in the cloud VM. No changes to your own computer.                                                                                                                  |
| Cached environment is stale              | Rerun setup in the task. In Codex, update and republish the environment for future tasks too.                                                                                                                              |
| No hosted preview link                   | Confirm the preview Worker is connected, the task branch was pushed, preview builds are enabled, and its Cloudflare build passed. `localhost` is not a hosted link.                                                        |
| Preview says it requires live data       | Follow [Connect preview data](#connect-preview-data). If the preview existed before Base was configured, update that preview's own settings too. Do not switch it to sample mode.                                          |
| Agent cannot open the preview            | Allow that specific hostname in its network settings; you can still open the link yourself.                                                                                                                                |
| MCP asks for login                       | Skip it for sample work. Use bundled `pnpm schema` output. Live metadata access is optional and separately authorized.                                                                                                     |
| Agent still sees sample data after setup | Put the Development connection and viewer password in environment variables, start a new task/session, and run `pnpm diagnose`. A network-secret placeholder cannot sign Google requests.                                  |
| Google requests cannot connect           | Allow `oauth2.googleapis.com` and `bigquery.googleapis.com`. Keep TLS verification enabled; do not change the key or disable the guard to fix a network policy.                                                            |
| Live app shows a configuration error     | Fix the named production runtime settings using [operations.md](operations.md); never paste secret values into chat.                                                                                                       |

The account owner completes the platform account and authorization screens.
Fresh-account journeys in both cloud agents have not yet been verified end to
end; local checks do not prove those screens.
