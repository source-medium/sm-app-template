# Who can see the app

Every viewer of a deployment sees the same data. Both shipped viewer guards decide
**who may open the app**. Set `APP_STORE_ID` to limit a deployment to one store;
leave it empty or unset to allow all stores in the configured warehouse. A
deployment where individual viewers must see different data needs a separate
authorization design that this starter does not provide.

## One deployment per store

For a few stores with different audiences, deploy the same code separately
for each store. Set the optional runtime variable `APP_STORE_ID` to its exact
`sm_store_id`, and give that deployment its own viewer guard:

- With Cloudflare Access, create a separate application and audience (AUD) for
  each deployment, and allow only that store's viewers. Cover every hostname
  as described below.
- With a shared password, use a different password for each deployment.

Set the restriction before sharing the URL. The store selector is locked to
that store, and reports, period comparisons, order details, and CSV downloads
use it. A request with a different `?store=` gets HTTP 403. Omitting the
parameter uses the configured store. Invalid configuration gets HTTP 503;
an unknown store never falls back to another store. `pnpm diagnose` checks
that the configured store has rows in the roster.

Your internal deployment can leave `APP_STORE_ID` unset and keep switching
between stores. Anyone admitted there can see all its stores, so keep its
viewer policy separate from the restricted deployments. Each deployment needs
updates when the shared code changes; no per-viewer permission database is involved.

This restriction is enforced by the app, and does not narrow the underlying
service-account grants. Only trusted maintainers should hold the app key or
change the code/configuration. New data queries must keep the store predicate
described in [data.md](data.md#store-scope).

To widen access deliberately, delete `APP_STORE_ID` from the Worker's runtime
settings and apply the change. Ordinary code deploys preserve it. Before
sharing a restricted deployment, test an allowed request and an authenticated
request with another store id, including a CSV URL. The latter must return 403.

Live data always needs exactly one viewer guard, even on localhost. With no
live values, a guard is optional for the initial sample app. Hosted previews
require live data and a guard.

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
(`user:password`). The password is 24 to 128 letters, digits, `-` or `_`; the
issued block already fits, and a shorter local password is a configuration
error. The app compares them in constant time and answers wrong or missing
ones with `401` and nothing else.

Limits: everyone shares one identity, so there is no per-person record and no
per-person removal; browsers have no "log out"; and it is not a design for
writes, which would need real accounts and CSRF protection. Hosted apps are
HTTPS; plain HTTP is only for the local dev server on 127.0.0.1.

To remove someone, use **Generate new viewer password** on the Apps page of your
SourceMedium workspace and update every deployment (`docs/operations.md`).
SourceMedium cannot change your host's secrets, so the old password works
until you do.

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
   Keep production's `preview_urls` set to `false` too; the separate protected
   preview Worker in [cloud.md](cloud.md#3-connect-cloudflare-once) turns it on.
   See [preview sign-in](#preview-sign-in) for its hostnames. Disabling workers.dev only in the
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

## Preview sign-in

Hosted previews read actual data and need the same level of protection as
production. The simplest setup is the shared password issued with the
Development app block. It protects every branch and immutable preview URL without
configuring each hostname individually. Keep its audience limited to reviewers.

For Cloudflare Access, create an Access application covering **all** of the
preview Worker's branch and immutable hostnames (and any preview custom domains).
Use that application's team domain and AUD in Previews Base and remove
`APP_BASIC_AUTH`; do not assume production's AUD covers previews. Follow
[Cloudflare's preview access guidance](https://developers.cloudflare.com/workers/previews/custom-domains/#protect-preview-content).
Verify an allowed reviewer can open both URL forms and an anonymous request
cannot. Existing previews need their own settings updated when Base changes.

Preview credentials and `APP_STORE_ID` are separate from production. Match the
intended store restriction in Previews Base before creating previews. Anyone
able to deploy preview code is a trusted warehouse reader; app guards cannot
make untrusted pull-request code safe to run with credentials.

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
