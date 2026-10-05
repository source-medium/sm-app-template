# Connect and deploy

The app has three states, always shown in the top bar:

| State                   | When                                                     | What you see                                     |
| ----------------------- | -------------------------------------------------------- | ------------------------------------------------ |
| **Sample data**         | No live values are set                                   | Synthetic stores and numbers, labeled as such    |
| **Live data**           | All seven live values and one viewer guard are set       | Your warehouse, behind a password or Access      |
| **Configuration error** | Some values are missing or malformed, or no viewer guard | A list of what to fix (HTTP 503); no data at all |

There is no partial mode and no fallback: a broken live configuration never
quietly shows sample numbers.

## 1. Run it locally on sample data

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open http://127.0.0.1:3000. No account, credential, or network access to
SourceMedium is needed.

## 2. Get your configuration

An organization **admin** opens **Apps** in SourceMedium and creates an app.
The page states what the app will be able to read, then shows one
configuration block **once**:

```text
SM_APPLICATION_ID=…
SM_APP_KEY=…
BIGQUERY_JOB_PROJECT_ID=…
BIGQUERY_LOCATION=…
SM_DATA_PROJECT_ID=…
SM_TRANSFORMED_DATASET_ID=…
SM_METADATA_DATASET_ID=…
APP_BASIC_AUTH=…
```

`SM_APP_KEY` (the app's data credential) and `APP_BASIC_AUTH` (the shared
viewer password) are secrets. Treat the block like a password: keep it out of
chat, email, tickets, and git.

The credential can read everything the app's grants allow, and every viewer of
the app sees whatever the app can read. Share the app only with people who may
see all of it.

## 3. Go live locally

Paste the block into `.env.local` at the repository root (git ignores it), then:

```sh
pnpm diagnose   # checks the key, datasets, locations, and a bounded example query
pnpm dev
```

Your browser asks for the password from `APP_BASIC_AUTH` (the part after the
colon), even on localhost. The top bar shows **Live data**.

## 4. Deploy to Cloudflare

Click **Deploy to Cloudflare** in the README. Cloudflare copies the repository
into your GitHub or GitLab account, then asks for each value from
`.env.example` as an encrypted secret: paste each one from your block. Then
deploy, open the URL, enter the password, and confirm **Live data** and the
store you expect.

- Values are runtime secrets, never build variables. The build needs none.
- Later deploys keep the secrets you entered; nothing in `wrangler.jsonc`
  overwrites them.
- `workers.dev` stays on so you have a URL; the password protects it. Preview
  URLs are off. With Cloudflare Access, see `docs/auth.md` for every hostname.
- To deploy from your own machine instead: `pnpm run deploy` (not
  `pnpm deploy`, a pnpm built-in). It builds a Worker with no local secrets in
  it; set the secrets in the Cloudflare dashboard or with `wrangler secret put`.

## 5. Or deploy to Vercel

Import the repository in Vercel (framework: Next.js), add the same eight values
as environment variables for Production (mark the two secrets as sensitive),
and deploy. Use the shared password on Vercel; Cloudflare Access is
Cloudflare-only. Vercel's own deployment protection is optional and separate.

## Test the Worker locally

`pnpm preview` builds the Worker and serves it in workerd. It reads runtime
values from `.dev.vars` (also git-ignored), not `.env.local`, exactly as the
deployed Worker reads only its runtime variables.

## Lost a secret?

SourceMedium never stores your key or password and cannot show them again.
On the Apps page:

- **Issue replacement key** returns a new `SM_APP_KEY`. The old key stops
  working; update every host and `.env.local`.
- **Replace password** returns a new `APP_BASIC_AUTH`. It takes effect when you
  update your hosts.
- The non-secret values can be copied again at any time.

See `docs/operations.md` for what each replacement interrupts.
