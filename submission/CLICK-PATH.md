# Owner click-path — Superteam Earn submission (Cookie Clash)

Everything below is owner-only (listing is `HUMAN_ONLY`; wallet/host/social accounts
are yours). Each step ends with the exact artifact the next step needs. Total: ~30 min
after the COOK lands. Deadline: **2026-09-22 21:59 UTC**.

## Step 0 — Fund the deploy wallet (≈ $1–2, one-time)

1. Buy ~$2 of COOK on Solana via https://jup.ag (mint
   `36ZrtQoab5MhhySaP1YSTwUahSk6GRVUTtZ6cuVfm9e1`).
2. Bridge 1:1 at https://hyperlane.cookiescan.io → recipient
   `2S47M67zuLTGESd3ofBkrUcDHSfWBhND3ob1uExkxZ3A`.
3. Check: `curl -s -X POST https://rpc.cookiescan.io -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"getBalance","params":["2S47M67zuLTGESd3ofBkrUcDHSfWBhND3ob1uExkxZ3A"]}'`
   → expect ≥ 2,000,000,000 lamports.
4. Say the word on the issue — the agent run deploys (`npm run deploy`, keypair already
   on this machine) and fills `submission/SUBMISSION.md` `PENDING_DEPLOY_SIG`.
   *(Or run the deploy yourself: `export DEPLOY_KEYPAIR=~/.config/solana/cookie-deploy.json && npm run deploy` in the repo.)*

## Step 1 — Host the live app (free tier, ~10 min)

1. Log into https://vercel.com (or Netlify) → **Add New → Project → Import**
   `mskutlu/cookie-clash`.
2. Settings: leave **root directory at the repo root** — the repo's `vite.config.ts`
   already points Vite at `app/` and outputs to `dist/`. Build command `npm run build`,
   output `dist`. No env vars needed: the app defaults to Cookie Chain RPC
   (`https://rpc.cookiescan.io`).
3. Deploy → copy the URL → this is **Field 3 (Live application URL)**. Replace
   `PENDING_LIVE_URL` in `submission/SUBMISSION.md`.

## Step 2 — Post the X thread (~10 min)

1. Open `submission/X-THREAD.md` — it is the thread, pre-written. Replace
   `[LIVE_URL]` and capture the 2 screenshots / 1 screen recording it marks.
2. Record the demo per `EVIDENCE.md` §"Where the demo evidence lands"
   (connect → create 0.01 COOK game → `npm run bot -- <gameAddress>` joins → ~5 moves →
   win payout; live feed visible).
3. Post the thread from your X account → keep the thread URL.

## Step 3 — Share in Telegram (2 min)

Post the thread URL in https://t.me/TheCookieNetChain (listing's "Final Step").

## Step 4 — Submit on Superteam Earn (5 min)

1. Log into https://earn.superteam.fun with **your** account (HUMAN_ONLY listing).
2. Profile check (payout identity): connect the wallet that should receive **USDC**,
   and make sure your X + Telegram socials are on the profile — payout & winner
   contact use these. Use the X/TG handles that posted Step 2/3.
3. Open the listing → **Submit** → paste exactly from `submission/SUBMISSION.md`:

   | # | Form field (all required) | Value |
   |---|---|---|
   | 1 | GitHub repository (link) | `https://github.com/mskutlu/cookie-clash` |
   | 2 | Relevant program, contract, token, or application addresses (if applicable) (text) | the field-2 block from `SUBMISSION.md` (program ID + network + deploy sig) |
   | 3 | Live application URL (link) | your Vercel/Netlify URL |

4. Sanity-check before Submit: repo public ✓ README has setup ✓ Nightly connect works
   on the live URL ✓ deploy tx visible on cookiescan.io ✓ thread posted & shared in TG ✓
5. Submit. (Winners announced ~Sep 28.)

## If anything is missing at submit time

Deadline buffer: submission targeted Sep 18; hard deadline Sep 22 21:59 UTC. The only
hard prerequisites are Steps 0–1 (fund → deploy → live URL). If Step 2 (X thread) is
not done before submitting, check whether the listing enforces the thread at submission
or at payout — the form itself has only the 3 fields above.
