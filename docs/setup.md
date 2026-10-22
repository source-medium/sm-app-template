# Set up once, resume from current state

Start with `node scripts/setup-agent.mjs`, then `pnpm dev` for the local sample. The local URL is labeled local and is never a hosted preview. No credential is needed for this first look.

Choose individual email sign-in with Cloudflare Access for ongoing use, or a shared password for a small trusted demo. Collect allowed emails once and reuse that choice for production and previews. Keep management credentials out of the reporting app.

From the customer copy, record your non-secret intent:

```sh
pnpm app:setup plan --auth access --data live --workspace your-workspace --viewers owner@example.com,reviewer@example.com
pnpm app:setup plan --production https://your-app.example.com --preview https://actual-branch-preview.example.com
pnpm app:setup plan --production-build https://dash.cloudflare.com/your-account/workers/services/view/your-worker/production/builds
pnpm app:setup status
```

Use actual URLs copied from Cloudflare. Do not guess a branch URL. `setup.json` is owner intent, suitable for committing to your customer repository. It contains no credentials or completion flags. Optional workspace and allowed-viewer intent preserve the decisions already collected; verify the actual Access policy rather than treating that list as enforcement. Worker names remain in `wrangler.jsonc`; reporting currency, channel defaults and branding remain in `app.config.ts`.

Choosing `--data live` writes root `vars.APP_REQUIRE_LIVE=true` into `wrangler.jsonc`. Deploy that change when connecting production. Previews already require live data. A missing credential then produces a configuration error instead of plausible sample numbers. Explicit sample demos remain supported before live setup. Changing intent back to sample does not remove an existing live requirement: intentionally edit that setting only when reverting to a demo.

`pnpm app:setup status` observes local configuration, the current remote branch head, and the recorded URLs again each run. It never sends local credentials to a host. It reports pending verification when Access protects build identity. Its exit code is not a release approval. Use `pnpm diagnose` for local connectivity and the hosted Connection page after private sign-in for each hosted instance.

The command does not discover preview URLs, inspect Cloudflare build progress or verify Access policies. The agent obtains those from the connected account and records the actual links. If account access is unavailable, report the specific check as pending and provide its destination.

## Private credential handoff

Use Production credentials only for production. Reuse one Development credential for previews and optional local debugging. Do not create a third app or ask for a SourceMedium admin key.

| Target          | Exact destination                             | With individual email sign-in                                                                 | With shared password                           |
| --------------- | --------------------------------------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| Local           | `.env.local`, Development app                 | Use the Development block's shared password for localhost                                     | `SM_CONNECTION` and `APP_BASIC_AUTH`           |
| Branch previews | `<worker>-preview` → Settings → Previews Base | Encrypted `SM_CONNECTION`; `CF_ACCESS_TEAM_DOMAIN` and `CF_ACCESS_AUD`; omit `APP_BASIC_AUTH` | Encrypted `SM_CONNECTION` and `APP_BASIC_AUTH` |
| Production      | `<worker>` → Settings → Variables and Secrets | Encrypted `SM_CONNECTION`; `CF_ACCESS_TEAM_DOMAIN` and `CF_ACCESS_AUD`; omit `APP_BASIC_AUTH` | Encrypted `SM_CONNECTION` and `APP_BASIC_AUTH` |

Run `pnpm app:setup credentials local`, `preview` or `production` for the destination using your Worker name and sign-in choice. Create Access and its allowed-viewer policy using [auth.md](auth.md). Protect every production and preview hostname. Never paste the entire SourceMedium block into an Access environment: the issuer currently includes a shared password. Copy only the `SM_CONNECTION` value, without its variable name or quotes, into that encrypted secret's value field. Save and deploy. If an old shared password is present, remove `APP_BASIC_AUTH` from the same environment.

Preview secrets copy from Previews Base when a preview is created. Updating Base does not repair existing previews. Update that preview's own settings or create a new preview. Retiring older credentials or viewer access requires [operations.md](operations.md#replacing-secrets), since immutable previews remain separate.

## When setup needs your browser

Before handing a step back, the agent names what is needed: account sign-in, private secret entry, hosting authorization, repository permission or browser connection. It provides the actual destination link, account and Worker or repository, and the next action. Reuse decisions and approvals already given for that scope.

When browser control is available, reuse the intended signed-in tab. If connecting it requires a Chrome extension or approval popup, follow the connection flow exposed by the active agent. The agent identifies the browser, tab and prompt it has actually opened, then confirms access by reading the tab's title or URL. Do not tell the person to wait for a popup that has not been launched. If the flow is unavailable or no prompt appears, state that browser access is pending and provide the direct setup link and exact manual action.

Hosting authorization and browser access are separate steps. Explain which one is pending instead of asking for a generic confirmation. The person completes sign-in, billing acceptance and secret entry privately; the agent checks the resulting saved or deployed state without reading or copying secret values, then resumes setup from there.

## The preview loop

1. **Local**: make the change and run the appropriate checks. Return a localhost link only with the word “local.”
2. **Pushed**: record the exact commit. A push says nothing about deployment. Give the recorded Cloudflare build link immediately.
3. **Building**: report this only when Cloudflare shows a build running for that commit. On failure, give the failing stage and build link.
4. **Deployed**: copy the actual URL from the preview Worker, match the build, and return the link immediately with “verification pending.” Do not wait to finish reviewing every report before sharing the available URL.
5. **Live verified**: sign in, inspect Connection's environment, build, data mode and sign-in, run Check connection, then inspect the changed report with the intended store, dates and channels. Report metric reconciliation separately.

`check:deploy` runs the full release gate once and reuses its built artifact. Every stage logs elapsed time and `.sm/release-timings.json` records timings. Do not skip tests to make a build faster. There is no need for another local `test:e2e` immediately before this gate if its inputs have not changed.

Initial dashboard imports can carry different build metadata from ordinary source pushes. If the host reports an invalid or mismatched commit, fix the source connection and trigger a build from a real source commit. Never disable build identity verification or add a fabricated commit value.

Use [cloud.md](cloud.md) for source, hosting and build connection. Account login, billing acceptance and private secret entry remain private account steps; an agent completes the surrounding work and gives the exact pending destination.
