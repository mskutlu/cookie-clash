# Proof-of-deployment evidence — Cookie Clash

Status as of 2026-09-05: **program built and fully tested on a local validator; mainnet
deploy pending one owner action** (fund the deploy wallet with ≥2 COOK ≈ $0.001 — Cookie
Chain has no testnet or faucet, so mainnet is the only deployment surface).

## Verified today (2026-09-05, live RPC probes)

- `getHealth` on `https://rpc.cookiescan.io` → `{"result":"ok"}`
- Deploy wallet `2S47M67zuLTGESd3ofBkrUcDHSfWBhND3ob1uExkxZ3A` balance: `0` lamports
  (funding is the owner action; nothing to spend yet)
- Program `8t1WJbixxfUk9Q3eyVt7DaGi8y2fE2embzHdBU9hFXh6`: `getAccountInfo` → `null`
  (not yet on-chain — expected pre-deploy; re-run the probe after deploy and expect
  `owner: <BPFLoaderUpgradeab1e...>`, `executable: true`, `data` length ≈ 176,688+)
- Listing deadline re-verified: `2026-09-22T21:59:59.000Z`; `agentAccess: HUMAN_ONLY`

## Local verification (stage-2 evidence)

`npm run validator` + `npm run e2e` against a local validator running the real built
`.so` — **16/16 checks pass**: stake escrow on create/join, turn & non-player guards,
win payout in-tx (net +8,379,200 lamports = pot − own stake − rent − fees), cancel
refund, timeout guard, `clash:win` log emission. Local tx signatures rotate per
validator reset, so they are not citable to judges — the mainnet signatures below are
the ones that count.

## After the deploy — fill these in (commands produce the values)

```bash
export DEPLOY_KEYPAIR=~/.config/solana/cookie-deploy.json
export COOKIE_RPC=https://rpc.cookiescan.io
npm run deploy
```

1. `Deploy tx` → the signature printed by the deploy command → paste into
   `SUBMISSION.md` field 2 as `PENDING_DEPLOY_SIG`.
2. Program on-chain check:
   ```bash
   curl -s -X POST https://rpc.cookiescan.io -H 'Content-Type: application/json' \
     -d '{"jsonrpc":"2.0","id":1,"method":"getAccountInfo","params":["8t1WJbixxfUk9Q3eyVt7DaGi8y2fE2embzHdBU9hFXh6",{"encoding":"base64"}]}'
   ```
3. First demo game txs → from the app or `npm run bot`, copy 1–2 signatures from the
   app's tx links / `solana confirm -v <SIG> --url https://rpc.cookiescan.io`.
4. Explorer links: `https://cookiescan.io/account/8t1WJbixxfUk9Q3eyVt7DaGi8y2fE2embzHdBU9hFXh6`
   (the explorer is a client-side app; if a deep link doesn't resolve, paste the
   address into the cookiescan.io search box).

## Where the demo evidence lands

- Live app URL → `SUBMISSION.md` field 3 (`PENDING_LIVE_URL`)
- Demo usage → screenshots/screen-recording of the X-thread steps in `X-THREAD.md`
  (connect Nightly → create 0.01 COOK game → bot joins → 5 moves each confirming <1 s
  → win payout) — capture after the live URL exists.
