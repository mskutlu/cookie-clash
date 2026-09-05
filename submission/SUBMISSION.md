# Cookie Clash — Superteam Earn submission text

Copy-paste source for the listing's three required form fields
(https://earn.superteam.fun/listings/bounty/create-an-app-on-cookie-chain-app).
Anything marked `PENDING` is filled by the step in `CLICK-PATH.md` that produces it.

## Field 1 — GitHub repository (link)

```
https://github.com/mskutlu/cookie-clash
```

## Field 2 — Relevant program, contract, token, or application addresses (if applicable) (text)

```
Cookie Clash Anchor program: 8t1WJbixxfUk9Q3eyVt7DaGi8y2fE2embzHdBU9hFXh6
Network: Cookie Chain mainnet (RPC https://rpc.cookiescan.io, explorer https://cookiescan.io)
Deploy tx: PENDING_DEPLOY_SIG
Deployed by: 2S47M67zuLTGESd3ofBkrUcDHSfWBhND3ob1uExkxZ3A
```

## Field 3 — Live application URL (link)

```
PENDING_LIVE_URL   ← Vercel/Netlify URL after hosting (CLICK-PATH.md step 2)
```

## Pitch (use in the X thread / any free-text box)

**Cookie Clash** is wagered on-chain tic-tac-toe built for Cookie Chain. Two players
stake native COOK; the stake is escrowed in the game PDA by an Anchor program, and the
winner is paid **inside the winning-move transaction** — no backend, no oracles, no SPL
tokens, pure SVM.

Why it is a Cookie Chain app, not a ported Solana dapp:

- **Built and deployed on Cookie Chain mainnet** — the Anchor program runs unchanged on
  Cookie Chain's SVM, proving Solana tooling (Anchor, `@solana/web3.js`) works as-is.
- **Sub-second finality you can see**: ~400 ms slots mean every move and every payout
  confirms in under a second, live in front of both players.
- **Per-move wagering is only economical here**: each move is a separate on-chain
  instruction; on a high-fee chain the game would cost more in fees than the stake.
- **Fee-minimal design**: the pot lives in the PDA itself and moves via
  program-owned lamport settlement; the full match costs fractions of a cent in fees.

Features: Nightly wallet connect (bounty requirement), create/join games with a COOK
stake, win detection with in-tx payout, draw refunds, cancel, timeout refund for stale
games (>15,000 slots), and a live spectator feed of every `clash:*` program log via
websocket. A CLI bot (`npm run bot -- <gameAddress>`) lets one person demo the full
2-player flow in under 5 minutes.

Instructions: `create_game` / `join_game` / `make_move` / `cancel_game` / `timeout_refund`.
Open source (repo above), README with setup + deploy commands included.
