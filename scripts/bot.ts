// Cookie Clash demo bot — plays the opponent side from the CLI so a single
// person can demo the full 2-player flow.
//
//   npm run bot -- <gameAddress>
//
// Keypair: COOKIE_BOT_KEYPAIR env var, or ~/.config/solana/bot.json
// (auto-created). The bot wallet needs native COOK on Cookie Chain —
// see README "Get COOK".
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
} from "@solana/web3.js";
import * as clash from "../shared/clash";

const RPC = process.env.RPC_URL ?? clash.COOKIE_RPC;
const conn = new Connection(RPC, "confirmed");

function loadBotKeypair(): Keypair {
  const p = process.env.COOKIE_BOT_KEYPAIR ?? path.join(os.homedir(), ".config/solana/bot.json");
  if (!fs.existsSync(p)) {
    const kp = Keypair.generate();
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(Array.from(kp.secretKey)));
    console.log(`created bot keypair ${p}`);
  }
  return Keypair.fromSecretKey(new Uint8Array(JSON.parse(fs.readFileSync(p, "utf8"))));
}

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

async function fetchGame(addr: string): Promise<clash.Game> {
  const address = new PublicKey(addr);
  const info = await conn.getAccountInfo(address);
  if (!info) throw new Error(`game ${addr} not found on ${RPC}`);
  return clash.decodeGame(address, info.data);
}

async function main() {
  const gameAddr = process.argv[2];
  if (!gameAddr) {
    console.error("usage: npm run bot -- <gameAddress>");
    console.error("open games are listed in the web app, or derive one: <playerA pubkey> + seed used at creation");
    process.exit(1);
  }
  const bot = loadBotKeypair();
  const bal = await conn.getBalance(bot.publicKey);
  console.log(`bot: ${bot.publicKey.toBase58()}  balance: ${clash.fmtCook(BigInt(bal))} COOK  rpc: ${RPC}`);
  if (bal < 0.05 * LAMPORTS_PER_SOL) {
    console.error("bot wallet needs funds (>= ~0.05 COOK). Send COOK to the address above and retry.");
    process.exit(1);
  }

  const provider = {
    publicKey: bot.publicKey,
    async connect() {},
    async signTransaction(tx: Parameters<clash.WalletProvider["signTransaction"]>[0]) { tx.sign(bot); return tx; },
  };

  for (let round = 0; ; round++) {
    const game = await fetchGame(gameAddr);
    const meIsA = game.playerA.equals(bot.publicKey);
    const meIsB = game.playerB.equals(bot.publicKey);
    if (!meIsA && !meIsB) {
      console.error(`bot ${bot.publicKey.toBase58()} is not a player in game ${gameAddr}`);
      process.exit(1);
    }
    const myMark = meIsA ? 1 : 2;

    if (game.status === clash.STATUS_WAITING && meIsB) {
      console.log("joining game…");
      const sig = await clash.sendTx(conn, provider, [clash.ixJoinGame(clash.PROGRAM_ID, game.address, bot.publicKey)]);
      console.log(`  joined: ${sig}`);
      await sleep(1200);
      continue;
    }
    if (game.status !== clash.STATUS_ACTIVE) {
      console.log(`game over — status: ${clash.STATUS_NAMES[game.status] ?? game.status}`);
      break;
    }
    const myTurn = game.turn % 2 === (meIsA ? 0 : 1);
    if (!myTurn) {
      if (round === 0) console.log("waiting for opponent…");
      await sleep(1500);
      continue;
    }

    // win if possible, block if needed, else center / corner / first empty
    const empty = game.cells.map((c, i) => (c === 255 ? i : -1)).filter((i) => i >= 0);
    const pick = (mark: number): number | null => {
      for (const l of [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]] as const) {
        const vals = l.map((i) => game.cells[i]);
        if (vals.filter((v) => v === mark).length === 2 && vals.includes(255)) {
          return l[vals.indexOf(255)];
        }
      }
      return null;
    };
    const cell = pick(myMark) ?? pick(myMark === 1 ? 2 : 1) ?? (empty.includes(4) ? 4 : empty.find((c) => [0,2,6,8].includes(c)) ?? empty[0]);

    console.log(`playing cell ${cell}…`);
    const sig = await clash.sendTx(conn, provider, [
      clash.ixMove(clash.PROGRAM_ID, game.address, bot.publicKey, game.playerA, game.playerB, cell),
    ]);
    console.log(`  move: ${sig}`);
    await sleep(1200);
  }
}

main().catch((e) => { console.error(clash.parseProgramError(e)); process.exit(1); });
