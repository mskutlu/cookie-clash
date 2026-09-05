# 🍪 Cookie Clash

Wagered on-chain tic-tac-toe built for **[Cookie Chain](https://www.cookiechain.wtf)** — an SVM (Solana Virtual Machine) chain. Two players stake native **COOK** on a match; the stake is escrowed in the game account by an on-chain Anchor program, and the winner is paid in the **same transaction** as the winning move. Cookie Chain's ~400 ms slots mean every move and every payout confirms in under a second, live in front of both players.

- **Network:** Cookie Chain mainnet (the chain has no testnet — one live network)
- **RPC:** `https://rpc.cookiescan.io` · **Explorer:** https://cookiescan.io
- **Program ID:** `8t1WJbixxfUk9Q3eyVt7DaGi8y2fE2embzHdBU9hFXh6`
- **Stack:** Anchor (Rust) program · React + `@solana/web3.js` frontend · Nightly wallet

## Quickstart (2 minutes)

```bash
npm install
npm run dev          # opens on http://localhost:5173
```

Then in the browser:

1. Install the [Nightly](https://nightly.app) wallet extension.
2. Point it at Cookie Chain: Nightly → **Settings → Networks → Add custom network** → Solana-compatible, RPC `https://rpc.cookiescan.io`.
3. Click **Connect wallet** in the app, fund your test wallet with a little COOK (below), and play.

Any Solana-compatible injected wallet that honors a custom RPC also works; Nightly support is a bounty requirement, so it is detected first.

### Solo demo (one machine, no second wallet)

Create a challenge against the bot wallet's address, then let the bot play the opponent side:

```bash
npm run bot -- <gameAddress>          # keypair: ~/.config/solana/bot.json (auto-created)
```

The bot wallet needs ≥ ~0.05 COOK. Games with a free seat show a **Join** button when the bot wallet is the designated opponent; the web app's game list shows live status for everything.

## Get COOK (no faucet exists)

Cookie Chain has **no testnet and no faucet**. Fee token is native COOK (9 decimals).

1. Buy a few dollars of COOK on **Solana mainnet** via [Jupiter](https://jup.ag) (bridged mint `36ZrtQoab5MhhySaP1YSTwUahSk6GRVUTtZ6cuVfm9e1`).
2. Bridge 1:1 to Cookie Chain at https://hyperlane.cookiescan.io (unlock under Squads multisigs, ~instant).

~$1–2 buys enough for thousands of games; a full game costs fractions of a cent in fees.

## How it works

| Instruction | What happens on-chain |
|---|---|
| `create_game(opponent, stake, seed)` | Escrows creator's stake into the game PDA (`seeds = ["game", player_a, seed]`) |
| `join_game` | Escrows the opponent's stake — pot is now full |
| `make_move(cell)` | Validates turn/occupancy, detects win/draw; **win pays the pot in-tx**, draw refunds both |
| `cancel_game` | Creator refunds an un-joined challenge |
| `timeout_refund` | Either player refunds a game idle > 15,000 slots (~100 min) |

State (`Game` account, 94 bytes + discriminator): players, stake, seed, turn, `cells: [u8;9]`, status, bump, `last_move_slot`. Every action emits a `clash:*` program log — the app's **Live feed** renders them via websocket `logsSubscribe`. No SPL tokens, no oracles, no off-chain components: the pot lives in the PDA itself and moves via program-owned lamport settlement.

## Build & test

```bash
anchor build         # program → target/deploy/cookie_clash.so
npm run validator    # local validator with the program preloaded (keep running)
npm run e2e          # scripts/e2e.ts — 16 assert-based lifecycle checks
npm run dev          # frontend against Cookie Chain (set VITE_RPC_URL to override)
```

The e2e suite asserts: stake escrow on create/join, turn & non-player guards, win payout (pot lands with the winning move), cancel refund, timeout guard, and `clash:win` log emission.

## Deploy to Cookie Chain

The chain is mainnet-only, so deploys go straight to it (a ~200 KB program costs ≈ 1.4 COOK in rent-exempt storage; deploy fees are fractions of a cent).

```bash
solana-keygen new -o keypairs/cookie_clash-keypair.json   # program authority (keep private)
# fund your DEPLOY wallet with ≥ 2 COOK (see "Get COOK"), then:
export DEPLOY_KEYPAIR=~/.config/solana/cookie-deploy.json
export COOKIE_RPC=https://rpc.cookiescan.io
npm run deploy
# → Program Id: 8t1WJbixxfUk9Q3eyVt7DaGi8y2fE2embzHdBU9hFXh6
```

Keys are environment-only — nothing secret is committed (`keypairs/` and `.env` are gitignored).

## Repo layout

```
programs/cookie-clash/   Anchor program (Rust)
shared/clash.ts          single client lib: PDA math, tx + account codec (used by app, e2e, bot)
app/                     React frontend (Vite) — Nightly connect, board, live feed
scripts/e2e.ts           assert-based lifecycle test (anchor test)
scripts/bot.ts           CLI opponent for solo demos
```
