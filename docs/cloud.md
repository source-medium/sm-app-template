# Build in your browser

Use **Codex Cloud** or **Claude Code in the cloud** to change this app by
chatting. Both follow the same loop:

**Describe a change → open its preview → ask for adjustments → approve publication.**

You need GitHub, access to either coding agent's cloud service, and a
Cloudflare account on Workers Paid for hosted previews. You do not need to
install anything on your computer. Start with sample data; connect your
warehouse after the app looks useful.

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
sessions. No setup script needs to be pasted into Claude's settings.

Use one repository per session so its hooks load. Organization accounts may
need an owner to enable the GitHub connector. See Anthropic's
[quickstart](https://code.claude.com/docs/en/web-quickstart) and
[environment guide](https://code.claude.com/docs/en/cloud-environments).

### Your first message, in either agent

```text
Help me get this app running. Read AGENTS.md and use the sm-cloud skill.
Keep sample data and the existing defaults. Run the setup and checks yourself.
Walk me through connecting this repository to Cloudflare using docs/cloud.md.
I authorize committing my requested changes, pushing a task branch, and
opening or updating its pull request to get a hosted sample preview.
Give me the preview link when it is ready. Do not merge or publish to the
production branch until I approve the reviewed change. Ask me only for
account connections or choices you cannot complete yourself.
```

## 3. Connect Cloudflare once

In [Cloudflare Workers & Pages](https://dash.cloudflare.com/?to=/:account/workers-and-pages),
choose **Create application → Import a repository** and connect **your copy**.
The agent can walk you through this screen; sign in and accept billing yourself.

Connect the same repository twice, with the settings below. Your agent supplies
the app name from `wrangler.jsonc` (initially `sm-app`). If either name already
belongs to another app, have the agent prepare a unique name in your copy
before connecting it. Never overwrite a different app.

| Setting           | Production Worker            | Sample preview Worker               |
| ----------------- | ---------------------------- | ----------------------------------- |
| Worker name       | `<app>` (initially `sm-app`) | `<app>-preview`                     |
| Production branch | `main`                       | `main`                              |
| Build command     | `pnpm check`                 | `pnpm check`                        |
| Deploy command    | `pnpm run deploy`            | `pnpm run deploy --env preview`     |
| Preview command   | Unused                       | `pnpm run deploy:preview`           |
| Preview builds    | Disabled                     | Enabled for non-production branches |
| Root directory    | Repository root              | Repository root                     |
| Runtime secrets   | Leave empty for sample data  | Always empty                        |

The first import deploys the unchanged starter on sample data. The first actual
edit starts the branch-preview loop; no empty pull request is needed. Task
branches get their own Preview URL; merging into `main` updates the production
URL. Both commands build the Worker and remove build-time environment values.
Cloudflare handles its deployment credentials; neither agent needs a Cloudflare
API token. See [Workers Builds settings](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/).

The second connection uses the `preview` environment and creates one **Worker
Preview** per task branch. Cloudflare Builds targets its connected Worker;
adding `--env preview` to the production Worker's preview command is not a
substitute for this second connection. See [Cloudflare's environment setup](https://developers.cloudflare.com/workers/ci-cd/builds/advanced-setups/#wrangler-environments).

Keep the preview Worker and its Preview Base settings free of warehouse
credentials. New branch previews ignore the Base configuration; existing
previews retain any secrets previously added to them. Its URLs are public,
so keep sensitive content out of sample fixtures. The live Worker's extra
URLs remain disabled. This separation matters because Cloudflare uses the
same URL switch for branch previews and production Version URLs.
See [preview hosts](https://developers.cloudflare.com/workers/previews/custom-domains/).

For an existing Worker using the old preview system, follow Cloudflare's
[one-time switch](https://developers.cloudflare.com/workers/ci-cd/builds/build-branches/#existing-workers-connected-to-builds)
before setting the Preview command. Do not turn on `preview_urls` as a workaround.

## 4. Change, review, publish

Ask either agent to make a change and prepare its preview. Open the Preview URL
on the pull request (the proposed change in GitHub), or under the `<app>-preview` Worker's
**Previews**. Keep feedback in the same agent conversation to update that preview.
The app's **Ask agent** button can compose the next request from a page or component.

When it looks right, say:

```text
Publish the change I just reviewed. Confirm the latest pull request commit
is the one I previewed and all checks passed. Merge that pull request, or give
me its merge link if you cannot. Verify Cloudflare's production deployment
and give me the live URL. Do not include unrelated changes.
```

If the agent cannot merge, click **Merge pull request** in GitHub after the
checks pass. Cloudflare then deploys `main`. A public URL can still show
**Sample data**; publishing code and connecting live data are separate steps.

For enforced review, protect `main` with a GitHub branch rule requiring a pull
request and the CI checks. Have the agent guide that one-time setting where
your GitHub plan supports it. Cloudflare does not wait for GitHub CI by itself;
its build runs `pnpm check`, while the PR's CI also tests browsers and the Worker.
Never merge a failing PR or push directly to `main` in this workflow.

To undo a change, ask the agent to revert that publication through a new PR.
For urgent recovery, use the Worker's deployment rollback, then also revert
the Git change so the next build does not restore it. Runtime secrets and
warehouse data are separate from code rollback.

## Connect your data

Once you have an app-specific SourceMedium block, ask the agent to follow
[Connect and deploy](connect.md#connect-a-hosted-app). Enter the values privately
in the Worker's **production runtime** settings. No `.env.local` file, terminal,
or warehouse key in either agent's environment is needed for hosted setup.
Keep the complete viewer guard in place before sharing live data.

Preview with sample data by default. If you need to test live queries before
publishing, have the agent prepare a separately protected staging Worker using
[the same deployment instructions](connect.md#4-deploy-to-cloudflare). Add its
runtime settings privately. Do not reuse public sample previews for this.

SourceMedium's self-service Apps provisioning is still planned. Without an
issued app block, stay on sample data and contact your SourceMedium admin.
An agent cannot generate a valid warehouse credential for you.

## Setup help

Tell the agent what failed. It should resolve setup before asking you to run commands.

For browser installation, allow `cdn.playwright.dev`, `storage.googleapis.com`,
and `playwright.download.prss.microsoft.com` in the agent environment. These
are download destinations, not warehouse credentials. An agent can check the
current URLs with `pnpm exec playwright install --dry-run chromium`.

| What happened                          | What the agent should do                                                                                                                                      |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Repository missing                     | Check that the GitHub connection includes your copy; organization approval may be needed.                                                                     |
| Install failed or dependencies changed | Run `node scripts/setup-agent.mjs` again. It preserves the lockfile and uses the pinned pnpm without a global install. Use Node 24 if the runtime is too old. |
| Browser download blocked               | Allow `cdn.playwright.dev` and its download redirect hosts reported by Playwright, then rerun setup. Keep TLS verification enabled.                           |
| Linux browser libraries missing        | Run `pnpm exec playwright install --with-deps chromium` in the cloud VM. No changes to your own computer.                                                     |
| Cached environment is stale            | Rerun setup in the task. In Codex, update and republish the environment for future tasks too.                                                                 |
| No hosted preview link                 | Confirm the task branch was pushed, preview builds are enabled, and its Cloudflare build passed. `localhost` is not a hosted link.                            |
| Agent cannot open the preview          | Allow that specific hostname in its network settings; you can still open the link yourself.                                                                   |
| MCP asks for login                     | Skip it for sample work. Use bundled `pnpm schema` output. Live metadata access is optional and separately authorized.                                        |
| Live app shows a configuration error   | Fix the named production runtime settings using [operations.md](operations.md); never paste secret values into chat.                                          |

The platform account/authorization screens must be completed by the account
owner. Fresh-account journeys in both cloud agents are tracked separately in
[release readiness](release-readiness.md); local checks do not prove those screens.
