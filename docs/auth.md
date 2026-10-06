# Who can see the app

Every viewer sees everything the app can read. Both shipped options decide
**who may open the app**; neither limits **which data** a viewer sees. A
customer-facing portal, or anything where viewers must see different data,
needs a separate authorization design that this starter does not provide.

Live data always needs exactly one viewer guard, even on localhost. With no
live values, a guard is optional: it protects the sample preview.

The guard covers every page, data request, and file in `public/`, on every
host. Only `/healthz` (the build id), `/favicon.ico`, and the build's hashed
scripts and styles under `/_next/static` are open; they carry no data.

## The options, with their real costs

1. **Shared password (default).** In your configuration block as
   `APP_BASIC_AUTH`. Right for a handful of trusted people and read-only
   numbers.
2. **Cloudflare Access.** When someone leaving must lose access on their own,
   when you want to know who looked, or past roughly ten viewers. No code: host
   configuration plus two variables.
3. **Sign-in inside the app.** On Vercel, or when the app grows actions tied to
   a person. `requireViewer()` in `src/lib/auth/require-viewer.ts` is the seam:
   it can read a Clerk or Auth.js session instead of a header. The identity
   integration, session handling, and tests are your work, not a few lines.
4. **Sign in with SourceMedium.** Not available yet.

## The shared password

The browser asks for a user name and password; both are in `APP_BASIC_AUTH`
(`user:password`). The app compares them in constant time and answers wrong
or missing ones with `401` and nothing else.

Limits: everyone shares one identity, so there is no per-person record and no
per-person removal; browsers have no "log out"; and it is not a design for
writes, which would need real accounts and CSRF protection. Hosted apps are
HTTPS; plain HTTP is only for the local dev server on 127.0.0.1.

To remove someone, replace the password through your app provisioning process
(the planned Apps page will provide this) and update
every deployment (`docs/operations.md`). SourceMedium cannot change your host's
secrets, so the old password works until you do.

## Cloudflare Access

Access puts a Cloudflare sign-in in front of the app. The app owner manages
allowed viewers in **their own Cloudflare account**. Viewers need no Cloudflare
account when using emailed one-time PINs; there is no signup form or user
database to build in this app.

1. Complete [Zero Trust setup](https://developers.cloudflare.com/cloudflare-one/setup/)
   in the account hosting your Worker. Cloudflare asks for a plan and payment
   details, including for the Free plan.
2. For email-code login, go to **Zero Trust > Integrations > Identity providers**,
   choose **Add new identity provider**, then **One-time PIN**. New organizations
   do not enable this automatically. You can use your existing SSO instead.
   See [Cloudflare's login guide](https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/one-time-pin/).
3. Add a **self-hosted application** for your app's exact hostname, with an
   **Allow** policy for specific email addresses or your company's email domain.
   Select **One-time PIN** as an available login method if using email codes.
4. Set the application's **session duration** to one hour.
5. Copy your **team domain** (`yourteam.cloudflareaccess.com`) and the
   application's **Audience (AUD) tag**.
6. In your Worker's variables, set `CF_ACCESS_TEAM_DOMAIN` and `CF_ACCESS_AUD`,
   **remove `APP_BASIC_AUTH`** (both guards at once is a configuration error),
   and redeploy.
7. Cover every hostname that reaches the Worker, including its exact
   `your-worker.your-account.workers.dev` hostname. If you use only a custom
   domain, set `workers_dev` to `false` in `wrangler.jsonc` and redeploy instead.
   Keep `preview_urls` set to `false` too. Disabling workers.dev only in the
   dashboard can be undone by your next deploy; see
   [Cloudflare's hostname guide](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/).
8. Open the app in a private browser window. Sign in with an allowed email and
   confirm the app loads and shows your email in the desktop top bar. Confirm
   an email outside the policy cannot get in. Test each hostname you kept enabled.

The app also verifies the token Access attaches (issuer, audience, RS256
signature, expiry) against your team's published keys, and refuses everything
if those keys cannot be fetched. That catches a request that skipped Access,
but a valid token replayed against a hostname Access does not cover still
verifies, so covering every hostname matters.

The top bar shows the signed-in viewer's email.

**Adding someone:** add their email to the application's Allow policy and send
them the app link. They enter their email and the code they receive. If you
allow your entire company email domain, colleagues in that domain do not need
to be added individually. Every allowed viewer sees the same data.

**Removing someone:** remove them from the policy **and** revoke their
sessions in Zero Trust. Removing a policy entry alone does not end sessions
already issued; the one-hour session duration bounds how long one lasts.

## Leaving SourceMedium's organization is separate

Removing a member from your SourceMedium organization changes neither who can
open your app nor any key someone already copied. Rotate the password (or
update Access) and, if they held the configuration block, issue a replacement
key.

## Extending the app safely

`pnpm check` requires the first executable statement in a loader, handler or
server action to await the canonical `requireViewer` import, directly or in a
single variable declaration. Import aliases work; deferred callbacks, caught
auth failures, computed imports and CommonJS loaders fail the check. It follows
local re-exports and React `cache` wrappers.

This is a development guardrail, not a security sandbox for arbitrary source
changes. Keep the runtime guard and review new request entry points. The
`.claude/settings.json` read-deny patterns cover `.env*` and `.dev.vars*`, with
an exception for `.env.example`. Claude Code's file-tool rules do not prevent
arbitrary subprocesses from opening secrets; follow AGENTS.md and never read
secret files through shell commands or scripts either. Confirm permissions in
your installed agent before using a real configuration block.
