# TMS Academy — Auth + Subscription System

Built from scratch (no existing Next.js project was found in what you uploaded —
that zip contained only the static HTML site). This is a complete Next.js 15
App Router project with:

- Google login via **Auth.js (NextAuth v5)** + Prisma Adapter — no Firebase
- **Neon PostgreSQL + Prisma** for users, sessions, subscriptions, payments
- **Razorpay** subscriptions (₹9/month default, configurable)
- **Full-site paywall**: every route except `/login` and `/subscribe` requires
  an ACTIVE subscription, enforced server-side (middleware + per-route checks)
- Your 103 original lesson HTML files, served only to subscribed users
- Idempotent, signature-verified Razorpay webhook as the source of truth

## 1. Install

```bash
npm install
```

This installs Next.js, next-auth (Auth.js v5 beta), @auth/prisma-adapter,
@prisma/client, prisma, and the razorpay SDK. `postinstall` runs
`prisma generate` automatically.

## 2. Environment variables

Copy `.env.local.example` to `.env.local` and fill in real values:

```bash
cp .env.local.example .env.local
```

| Variable | Secret? | Notes |
|---|---|---|
| `DATABASE_URL` | 🔒 secret | Neon pooled connection string |
| `DIRECT_URL` | 🔒 secret | Neon direct connection string (used by `prisma migrate`) |
| `GOOGLE_CLIENT_ID` | public-ish, keep private anyway | From Google Cloud Console |
| `GOOGLE_CLIENT_SECRET` | 🔒 secret | Never expose client-side |
| `AUTH_SECRET` | 🔒 secret | `npx auth secret` to generate |
| `RAZORPAY_KEY_ID` | safe to expose (it's the publishable key) | used both server + client (client gets it via API response, never via env directly) |
| `RAZORPAY_KEY_SECRET` | 🔒 secret | Server-only, used to sign/verify |
| `RAZORPAY_WEBHOOK_SECRET` | 🔒 secret | Server-only |
| `RAZORPAY_PLAN_ID` | not secret but internal | Create this Plan in the Razorpay dashboard first |
| `NEXT_PUBLIC_PLAN_PRICE_RUPEES` | public | Just the display price, edit `lib/plans.ts` for real logic |

## 3. Database — Prisma + Neon

Schema is at `prisma/schema.prisma`: `User`, `Account`, `Session`,
`VerificationToken` (exact shape Auth.js's Prisma Adapter requires), plus
`Subscription`, `Payment`, and `ProcessedWebhookEvent` (webhook idempotency).

```bash
# generate the Prisma client
npx prisma generate

# create + apply the first migration in development
npx prisma migrate dev --name init

# deploy migrations in production (Vercel build step / CI — never migrate dev in prod)
npx prisma migrate deploy
```

These commands are additive — they will not touch or delete any existing
production data. If you later attach this schema to a project that already
has tables, run `npx prisma db pull` first and reconcile before migrating.

## 4. Google OAuth setup

In [Google Cloud Console](https://console.cloud.google.com/apis/credentials):

1. Create an OAuth 2.0 Client ID (type: Web application)
2. **Authorized JavaScript origins**:
   - `https://tamilmediumstudentsacademy.com`
   - `http://localhost:3000` (for local dev)
3. **Authorized redirect URIs**:
   - `https://tamilmediumstudentsacademy.com/api/auth/callback/google`
   - `http://localhost:3000/api/auth/callback/google`
4. Copy the Client ID and Client Secret into `.env.local` / Vercel env vars.

## 5. Razorpay setup

1. In the Razorpay dashboard, go to **Subscriptions → Plans** and create a
   plan: ₹9, monthly interval. Copy its `plan_id` into `RAZORPAY_PLAN_ID`.
   To add ₹49/₹99 plans later, create more Plans in Razorpay and extend the
   `PLANS` array in `lib/plans.ts`.
2. Go to **Settings → API Keys** and generate a Key ID + Key Secret →
   `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET`.
3. Go to **Settings → Webhooks** and add:
   - URL: `https://tamilmediumstudentsacademy.com/api/razorpay/webhook`
   - Secret: generate one, put it in `RAZORPAY_WEBHOOK_SECRET`
   - Events to enable: `subscription.activated`, `subscription.charged`,
     `subscription.completed`, `subscription.cancelled`, `subscription.halted`,
     `payment.captured`, `payment.failed`
4. Start in **Test Mode** (test API keys) until you've verified the full flow
   end-to-end, then switch to **Live Mode** keys and repeat the webhook setup
   for the live webhook URL (Razorpay keeps test/live webhooks separate).

## 6. Vercel deployment

1. Push this project to a Git repo, import it into Vercel.
2. In **Project Settings → Environment Variables**, add every variable from
   `.env.local.example` (Production, and Preview if you want staging to work).
3. In **Project Settings → Environment Variables**, do **not** add anything
   with `NEXT_PUBLIC_` unless you actually want it in client bundles.
4. Deploy. Vercel runs `npm install` → `postinstall` (`prisma generate`) →
   `next build` automatically.
5. Run `npx prisma migrate deploy` against production once (locally with
   production `DATABASE_URL`, or as a one-off Vercel deploy step) before
   first traffic hits the new schema.
6. Point your domain's DNS at Vercel per Vercel's domain settings, matching
   `tamilmediumstudentsacademy.com`.

## 7. How the paywall works

- `middleware.ts` runs on every request. Logged-out users are redirected to
  `/login` for anything except `/login`, NextAuth's own routes, and the
  Razorpay webhook (which has no user session — it's server-to-server).
- `lib/subscription.ts` exports `requireActiveSubscription()` — call this at
  the top of any server component / route handler that must be fully gated
  (used in `app/route.ts` for the homepage and `app/lessons/[slug]/route.ts`
  for every lesson). It re-checks the database directly; nothing about
  subscription status is ever trusted from the client.
- `/dashboard` and `/subscribe` only require login (not an active plan) —
  otherwise a user could never reach the page that lets them pay.
- The 103 lesson HTML files live in `content/lessons/` — **outside**
  `public/`, so they are never served as static files. The only way to read
  one is `GET /lessons/<slug>`, which runs the subscription check first.

## 8. Testing checklist

- [ ] `/` and `/lessons/*` redirect to `/login` when logged out
- [ ] Google login creates a `User` row (check via `npx prisma studio`)
- [ ] After login with no subscription, `/` redirects to `/subscribe`
- [ ] Subscribe button opens Razorpay Checkout (test mode) and completes
- [ ] `/api/razorpay/verify` marks the subscription ACTIVE immediately
- [ ] Razorpay's webhook (use their dashboard "Test webhook" or the CLI) hits
      `/api/razorpay/webhook` and updates `currentPeriodStart/End`
- [ ] Sending the same webhook event twice does not create duplicate
      `Payment` rows (check `ProcessedWebhookEvent` table)
- [ ] After subscribing, `/` and `/lessons/<any-slug>` load successfully
- [ ] Cancel subscription → status flips to CANCELLED, access is revoked
      once `currentPeriodEnd` passes
- [ ] Logout clears the session and protected pages redirect to `/login`
      again
- [ ] Directly requesting `/lessons/<slug>` with a valid session but no
      active subscription still returns a redirect, not the HTML (confirms
      the check is server-side, not just hidden in the UI)

## Project structure

```
app/
  route.ts                     gated homepage (serves content/site/home.html)
  login/page.tsx                public login page
  dashboard/page.tsx            profile + subscription status + actions
  subscribe/page.tsx            pricing + Subscribe Now
  lessons/page.tsx               lesson index (gated)
  lessons/[slug]/route.ts       serves one lesson HTML file (gated)
  api/auth/[...nextauth]/route.ts
  api/razorpay/create-subscription/route.ts
  api/razorpay/verify/route.ts
  api/razorpay/webhook/route.ts
  api/razorpay/cancel/route.ts
components/
  LoginButton.tsx  SubscribeButton.tsx  DashboardActions.tsx
lib/
  prisma.ts  subscription.ts  razorpay.ts  plans.ts
content/
  site/home.html                 your redesigned homepage, unmodified
  lessons/*.html                  your 103 lesson pages, unmodified
prisma/schema.prisma
auth.ts
middleware.ts
```
