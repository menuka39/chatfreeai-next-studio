# Deploying to Vercel

## The short version

Two different things get confused easily:

| | What it is | When it runs | Does it change files? |
|---|---|---|---|
| `npm run verify:prices` | a command **you** run on your laptop | only when you type it | **yes** — edits `lib/*.ts`, then you commit |
| The price oracle | code inside the app | automatically on every generation | **no** — just charges the right amount |

So: `verify:prices` is a one-time developer task. It never runs on Vercel.
The oracle is what protects you in production, and it needs no setup.

## Step 0 — getting the code onto Vercel

Vercel deploys from a git repository, so the code has to live in one first.

```bash
unzip chatfreeai-next.zip && cd chatfreeai-next

# prove it builds on your machine before involving any hosting
npm install
npm run build
```

If that build fails locally it will fail on Vercel too — fix it here first,
where the feedback loop is seconds instead of minutes.

Then push it to GitHub (**make the repo private** — this is your business
logic and pricing model):

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/chatfreeai-next.git
git push -u origin main
```

`.gitignore` already excludes `node_modules`, `.next` and every real `.env`
file, so nothing secret gets committed. `.env.example` is committed on
purpose — it is the reference for which variables exist.

Then on vercel.com: **Add New → Project → Import** your repo. Vercel detects
Next.js and needs no build configuration.

**Set the environment variables below BEFORE clicking Deploy**, or the first
build will produce a site with analytics and Supabase baked in as undefined —
`NEXT_PUBLIC_*` values are compiled into the bundle, so fixing them later
needs a *redeploy*, not just a save.

After this, every `git push` to `main` deploys automatically.

## Before your first deploy — 3 steps

### 1. Get a Redis database (5 minutes, free) — **this one is not optional**

Vercel runs your code as many small short-lived instances that **do not share
memory**. The daily free limits currently count in memory, so on Vercel a user
could refresh and get a fresh 8,000 tokens over and over. You'd be paying for
unlimited free usage.

1. Sign up at https://upstash.com (free tier is plenty)
2. Create a Redis database
3. Open the **REST** section, copy the URL and the token

The app switches to Redis automatically once those two variables exist — no
code change. It also makes charging atomic, so parallel requests can't slip
past the limit.

### 2. Set environment variables in Vercel

Project → Settings → Environment Variables. The full list, in the order the
site breaks without them:

**Required — the site is not usable without these**

| Variable | Where to get it |
|---|---|
| `OPENROUTER_API_KEY` | openrouter.ai → Keys. Every chat/image/video/audio call uses this |
| `SITE_URL` | `https://chatfreeai.com` — used for canonical URLs, OG tags, PayPal return links |
| `UPSTASH_REDIS_REST_URL` | Upstash → REST section (see step 1) |
| `UPSTASH_REDIS_REST_TOKEN` | same page |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | same page — safe to expose, RLS protects the data |
| `SUPABASE_SERVICE_ROLE_KEY` | same page — **server-only, never prefix with NEXT_PUBLIC** |

**Required for payments**

| Variable | Notes |
|---|---|
| `PAYPAL_ENV` | `sandbox` while testing, `live` when real |
| `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET` | developer.paypal.com → your app |
| `PAYPAL_WEBHOOK_ID` | from the webhook you create; without it, webhook signatures are not verified |

**Required for the guest tier to be safe**

| Variable | Notes |
|---|---|
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | cloudflare.com/turnstile (free) |
| `TURNSTILE_SECRET_KEY` | same page. Without both, guests are gated only by an IP hash and a browser-generated id, both trivially rotated — and guest searches cost real money with no revenue behind them |

**Strongly recommended**

| Variable | Notes |
|---|---|
| `VIDEO_URL_SECRET` | any long random string. Signs provider video URLs so the frame-extraction proxy can't be pointed elsewhere (SSRF). Falls back to `OPENROUTER_API_KEY` if unset — set a dedicated value |
| `NEXT_PUBLIC_GA_MEASUREMENT_ID` | `G-…` from analytics.google.com. Skipped automatically in local dev |

**Optional**

| Variable | Notes |
|---|---|
| `NEXT_PUBLIC_ADSENSE_CLIENT_ID` | `ca-pub-…`, only after AdSense approves the site. A placeholder containing `XXXX` is treated as unconfigured |
| `PAYPAL_PLAN_STARTER`, `PAYPAL_PLAN_PRO`, `PAYPAL_PLAN_PROMAX` | pin specific PayPal plan ids. Leave unset and the app creates/finds them itself, which is what you want — it keys them by price so an admin price change correctly creates a new plan |
| `LOG_MARGIN` | set to `1` to log real per-request cost vs charge. Useful for a week after launch, noisy after |
| `OPENROUTER_BASE_URL`, `PAYPAL_BASE_URL`, `TURNSTILE_VERIFY_URL` | test-only overrides. **Leave unset in production** |

Note the deliberate design across all of these: a missing optional variable
disables its feature quietly rather than crashing the app, and a missing
required one logs a loud warning at boot. Check the deployment logs after the
first deploy rather than assuming silence means success.

After setting these, **redeploy** — `NEXT_PUBLIC_*` values are baked into the
build, so a restart alone won't pick up a change.

### 3. Confirm the estimated prices, once

```bash
export OPENROUTER_API_KEY=sk-or-...
npm run verify:prices          # look at the report
npm run verify:prices:write    # write real prices, drop the flags
npm run audit:margins          # confirm no loss
git commit -am "confirm live prices"
```

## What's already handled

- **Function timeouts** — `maxDuration` is set per route (chat 300s for long
  streams, image 120s, video 60s since it only submits the job and returns).
- **Video taking minutes** — the route returns a job id immediately and the
  browser polls, so no function ever waits minutes.
- **Prices changing after deploy** — the oracle reads the live price at
  generation time, so a provider price rise is absorbed automatically.
- **Redis outage** — charging fails **closed**: requests are refused rather
  than handing out unmetered free usage.

## Auth + payments setup (Supabase + PayPal)

Auth and subscriptions are BUILT — they activate when the env vars exist.
Until then the app falls back to the dev cookie shim (with a loud warning in
production logs).

### Supabase (login: magic link + Google) — ~15 minutes

1. Create a project at https://supabase.com
2. SQL Editor → paste and run `supabase/schema.sql` (creates the profiles
   table, the signup trigger, and Row Level Security)
3. Authentication → Providers → enable **Email**. Then, for the password
   option to be properly secure, set under Auth settings:
   - **Minimum password length: 8** (the UI enforces this too)
   - **Leaked password protection: ON** — rejects passwords found in known
     breaches (checked against HaveIBeenPwned)
   - **Confirm email: ON** — new password accounts must verify before use
   - **Secure email change: ON** — required for the account page's email
     change to send a confirmation to BOTH the old and the new address. With
     it off, whoever holds a session could move the account to their own
     email.
4. **Email Templates** — this matters more than it looks. Edit both
   **Magic Link** and **Confirm signup** so each email carries a link that
   works on any device AND a code the user can type:

   ```html
   <p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email">
     Sign in to Chat Free AI
   </a></p>
   <p>Or enter this code: <strong>{{ .Token }}</strong></p>
   ```

   For **Reset password** use `&type=recovery`. For **Change Email Address**
   use `&type=email_change`.

   Why not the default `{{ .ConfirmationURL }}`? That uses the PKCE flow,
   which only works in the same browser that requested the link. Request it
   on your laptop, open the email on your phone, and it fails with a
   "code verifier" error that looks like an expired link. The `token_hash`
   URL above has no such restriction.
5. **Authentication → URL Configuration** — this is the step that breaks
   logins if it's wrong:
   - **Site URL**: `https://chatfreeai.com`
   - **Redirect URLs**: add `https://chatfreeai.com/auth/callback`
     (and `http://localhost:3000/auth/callback` if you develop locally)
   Without the callback URL listed, Supabase refuses the redirect and the
   user lands back on the login page.
6. For Google: Authentication → Providers → Google → follow the wizard
   (you create an OAuth client in Google Cloud Console, paste id + secret)
7. **Settings → Data API** (Project URL) and **Settings → API Keys** —
   copy three values into Vercel env vars. The URL and the keys must come
   from the SAME project:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` ← server-only, bypasses RLS, guard it

### PayPal (subscriptions) — ~5 minutes

1. https://developer.paypal.com → My Apps → Create App → copy two values:
   - `PAYPAL_CLIENT_ID`
   - `PAYPAL_CLIENT_SECRET`
2. Set `PAYPAL_ENV=sandbox` (switch to `live` with live credentials later).

**That's it.** On the first subscribe click the app automatically creates (or
finds) the product, the three monthly billing plans ($14.99 / $44.99 /
$139.99, read from `lib/packages.ts`), and the webhook pointing at
`SITE_URL/api/webhooks/paypal` — no ids to copy. Change a price in code and a
fresh plan is provisioned on its own.

Requirements for the auto-setup: `SITE_URL` must be your real https domain
(PayPal refuses http webhooks), and the app must be deployed when the first
subscription happens.

Optional: `npm run setup:paypal` pre-creates everything from your laptop and
prints the ids, and `PAYPAL_PLAN_*` / `PAYPAL_WEBHOOK_ID` env vars pin
specific ids — useful if you manage plans by hand. Env values always win.

### Why it's built this way (security)

- **Three sign-in methods, all safe** — Google OAuth, emailed magic links,
  and optional passwords. Passwords are bcrypt-hashed by Supabase, must be 8+
  characters, are screened against known breach lists, and a new password
  account cannot be used until the emailed 6-digit code is verified — so
  nobody can register with an email they don't control.
- **Account security page** — signed-in users can change their email (needs
  confirmation from the old AND the new address), change or set a password
  (current password required, or an emailed one-time code if they've only
  ever used Google/magic links), and sign out every other device.
- **Password reset** built in — emailed link → `/auth/reset` → new password.
  The callback only redirects to an allow-list of our own paths (no open
  redirects).
- **Cards never touch your server** — users pay on PayPal's page; cards are
  saved/removed inside the PayPal wallet (PCI-DSS Level 1). You cannot leak
  what you do not have.
- **Plans cannot be self-granted** — the plan lives in the database behind
  Row Level Security with NO client write policy. The only writer is the
  webhook handler, which (a) verifies the event signature with PayPal's API
  and (b) re-fetches the subscription from PayPal and trusts that, not the
  webhook body.
- **JWTs validated server-side** — every API call uses `getUser()`, which
  checks the token signature, not just reads the cookie.
- **Security headers on every response** — HSTS preload, X-Frame-Options
  DENY, nosniff, strict referrer, locked-down Permissions-Policy.

## Troubleshooting login

**"Invalid path specified in request URL"** — `NEXT_PUBLIC_SUPABASE_URL` is
malformed. It must be just `https://<ref>.supabase.co` with no path and no
trailing slash. (The app normalises common mistakes, but fix the value too.)

**DNS error / "site can't be reached" on `<ref>.supabase.co`** — the ref is
from a different or deleted project, or the project is paused. Free projects
pause after ~7 days idle; open the dashboard and restore it. Re-copy the URL
AND both keys from the same project.

**Signs in, then bounces back to /login** — the session cookie isn't reaching
the server. Check, in order:
1. `https://chatfreeai.com/auth/callback` is listed under Supabase →
   Authentication → URL Configuration → Redirect URLs
2. Supabase Site URL matches your real domain
3. `SITE_URL` env var matches too
4. You redeployed after changing any `NEXT_PUBLIC_*` var — those are baked in
   at build time and do NOT update without a rebuild
The login page now shows the actual failure reason instead of silently
returning to the form, so read the message it gives you.

**Magic link opened on a different device** than the one that requested it
will fail by design (the PKCE verifier lives in the first browser). Request a
fresh link from the device you want to sign in on.

## Still to build

- `/checkout?package=…` links can now point to `/account` (subscription lives
  there); or delete the checkout references.
