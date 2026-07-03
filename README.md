# AIM Screener

Educational portfolio rebalancing tool (Lichello AIM formula) for India (NSE) and USA stocks.
₹299/month subscription with 7-day free trial. PWA — installable on iPhone and Android from the browser.

## Stack
- Static frontend (`index.html` landing, `app.html` app) on Netlify
- Auth + user data: Supabase (email/password, `profiles` + `portfolios` tables, RLS)
- Billing: Razorpay Subscriptions (monthly plan) + webhook sync
- Prices: Yahoo Finance via `netlify/functions/yahoo.js`

## Netlify environment variables required
| Variable | Source |
|---|---|
| `SUPABASE_URL` | Supabase → Project Settings → API |
| `SUPABASE_ANON_KEY` | Supabase → Project Settings → API (anon public) |
| `SUPABASE_SERVICE_ROLE` | Supabase → Project Settings → API (service_role — secret) |
| `RAZORPAY_KEY_ID` | Razorpay dashboard → API Keys |
| `RAZORPAY_KEY_SECRET` | Razorpay dashboard → API Keys |
| `RAZORPAY_PLAN_ID` | Razorpay → Subscriptions → Plans (₹299/month plan) |
| `RAZORPAY_WEBHOOK_SECRET` | Set when creating the webhook in Razorpay |
| `SECRETS_SCAN_OMIT_KEYS` | `RAZORPAY_KEY_ID,SUPABASE_ANON_KEY,SUPABASE_URL` |

## One-time setup
1. Run `supabase-setup.sql` in Supabase SQL Editor.
2. Supabase → Authentication → Providers → Email: disable "Confirm email" for one-tap signup (optional).
3. Razorpay → create Plan: ₹299, monthly. Copy plan_id.
4. Razorpay → Webhooks → add `https://<site>/.netlify/functions/rzp-webhook` with events: subscription.activated, subscription.charged, subscription.cancelled, subscription.halted, subscription.paused, subscription.resumed, subscription.completed. Set a secret; store as `RAZORPAY_WEBHOOK_SECRET`.

## Legal positioning
Educational tool only — NOT investment advice, NOT SEBI/SEC registered. Analysis output uses
ACCUMULATE / REDUCE / HOLD wording with reasoning and disclaimers. Do not add "buy/sell now"
language or order placement without SEBI registration.
