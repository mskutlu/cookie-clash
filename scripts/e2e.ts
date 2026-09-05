// Cookie Clash end-to-end check — runs against a local validator
// (started by `anchor test`, or manually: `npm run validator`).
// Asserts the full lifecycle: create -> join -> moves -> win payout,
// plus the cancel and timeout guard paths.
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as clash from "../shared/clash";

const RPC = process.env.RPC_URL ?? "http://127.0.0.1:8899";
const conn = new Connection(RPC, "confirmed");

let failures = 0;
function check(name: string, cond: boolean, extra = "") {
  if (cond) console.log(`  PASS  ${name}`);
  else { failures++; console.error(`  FAIL  ${name} ${extra}`); }
}

function kpProvider(kp: Keypair): clash.WalletProvider {
  return {
    publicKey: kp.publicKey,
    async connect() {},
    async signTransaction(tx) { tx.sign(kp); return tx; },
  };
}

async function runIx(name: string, ixs: TransactionInput[], signers: Keypair[]): Promise<string> {
  const tx = new Transaction().add(...ixs);
  return sendAndConfirmTransaction(conn, tx, signers);
}
type TransactionInput = Parameters<Transaction["add"]>[0];

async function expectFail(name: string, ixs: TransactionInput[], signers: Keypair[], expectedCode: number) {
  try {
    await runIx(name, ixs, signers);
    check(name, false, "(transaction unexpectedly succeeded)");
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    const ok = msg.includes(`0x${expectedCode.toString(16)}`);
    check(name, ok, `(wanted ${expectedCode}, got: ${msg.split("\n")[0].slice(0, 140)})`);
  }
}

async function main() {
  console.log(`Cookie Clash e2e on ${RPC}`);
  const genesis = await conn.getGenesisHash();
  console.log(`genesis: ${genesis.slice(0, 12)}… slot: ${await conn.getSlot()}`);

  const walletPath = process.env.ANCHOR_WALLET ?? path.join(os.homedir(), ".config/solana/id.json");
  const playerA = Keypair.fromSecretKey(new Uint8Array(JSON.parse(fs.readFileSync(walletPath, "utf8"))));
  const playerB = Keypair.generate();
  const airdrop = await conn.requestAirdrop(playerB.publicKey, 2 * LAMPORTS_PER_SOL);
  await conn.confirmTransaction(airdrop, "confirmed");

  const stake = 10_000_000n; // 0.01 native units — "COOK" on Cookie Chain
  const providerA = kpProvider(playerA);
  const providerB = kpProvider(playerB);
  const balanceOf = (k: Keypair) => conn.getBalance(k.publicKey);

  // ---------- game 1: A wins the pot ----------
  console.log("\n[game 1] create -> join -> 5 moves -> A wins pot");
  const seed = 1;
  const [pda] = clash.gamePda(playerA.publicKey, seed);
  console.log(`  game PDA: ${pda.toBase58()}`);

  const rent = await conn.getMinimumBalanceForRentExemption(8 + 94);
  const balA0 = await balanceOf(playerA);

  await runIx("create", [clash.ixCreateGame(clash.PROGRAM_ID, pda, playerA.publicKey, playerB.publicKey, stake, seed)], [playerA]);
  let g = clash.decodeGame(pda, (await conn.getAccountInfo(pda))!.data);
  check("create: status waiting", g.status === clash.STATUS_WAITING);
  check("create: stake recorded", g.stake === stake);
  check("create: stake escrowed", (await conn.getBalance(pda)) === rent + Number(stake));

  await runIx("join", [clash.ixJoinGame(clash.PROGRAM_ID, pda, playerB.publicKey)], [playerB]);
  g = clash.decodeGame(pda, (await conn.getAccountInfo(pda))!.data);
  check("join: status active", g.status === clash.STATUS_ACTIVE);
  check("join: full pot escrowed", (await conn.getBalance(pda)) === rent + 2 * Number(stake));

  // guards: B cannot move on A's turn; third party is rejected
  await expectFail("guard: move out of turn", [clash.ixMove(clash.PROGRAM_ID, pda, playerB.publicKey, playerA.publicKey, playerB.publicKey, 4)], [playerB], 6005);
  const spectator = Keypair.generate();
  const drop = await conn.requestAirdrop(spectator.publicKey, LAMPORTS_PER_SOL / 10);
  await conn.confirmTransaction(drop, "confirmed");
  await expectFail("guard: non-player move", [clash.ixMove(clash.PROGRAM_ID, pda, spectator.publicKey, playerA.publicKey, playerB.publicKey, 4)], [spectator], 6004);

  // A wins: 4, 0, 8 — B takes 1, 3
  const moves: [Keypair, number][] = [[playerA, 4], [playerB, 1], [playerA, 0], [playerB, 3], [playerA, 8]];
  let winSig = "";
  for (const [who, cell] of moves) {
    const prov = who === playerA ? providerA : providerB;
    winSig = await clash.sendTx(conn, prov, [clash.ixMove(clash.PROGRAM_ID, pda, who.publicKey, playerA.publicKey, playerB.publicKey, cell)]);
  }
  g = clash.decodeGame(pda, (await conn.getAccountInfo(pda))!.data);
  check("win: status finished", g.status === 2);
  check("win: game account drained to rent", (await conn.getBalance(pda)) === rent);
  const balA1 = await balanceOf(playerA);
  const net = balA1 - balA0;
  // A paid: own stake + game-account rent + 4 tx fees; received: full pot (2x stake)
  check("win: pot paid to A (net of stake/rent/fees)", net >= Number(stake) - rent - 50_000, `(net ${net}, rent ${rent})`);

  const winTx = await conn.getTransaction(winSig, { maxSupportedTransactionVersion: 0 });
  check("feed: clash:win in program logs", (winTx?.meta?.logMessages ?? []).some((l) => l.startsWith("Program log: clash:win")));
  await expectFail("guard: move on finished game", [clash.ixMove(clash.PROGRAM_ID, pda, playerB.publicKey, playerA.publicKey, playerB.publicKey, 2)], [playerB], 6003);

  // ---------- game 2: cancel before join ----------
  console.log("\n[game 2] create -> cancel -> refund");
  const seed2 = 2;
  const [pda2] = clash.gamePda(playerA.publicKey, seed2);
  const balA2 = await balanceOf(playerA);
  await runIx("create", [clash.ixCreateGame(clash.PROGRAM_ID, pda2, playerA.publicKey, playerB.publicKey, stake, seed2)], [playerA]);
  await runIx("cancel", [clash.ixCancel(clash.PROGRAM_ID, pda2, playerA.publicKey)], [playerA]);
  g = clash.decodeGame(pda2, (await conn.getAccountInfo(pda2))!.data);
  check("cancel: status cancelled", g.status === 4);
  { const d = (await balanceOf(playerA)) - balA2; check("cancel: stake refunded", d >= -(rent + 50_000), `(delta ${d}, rent ${rent})`); }

  // ---------- game 3: timeout guard ----------
  console.log("\n[game 3] timeout guard fires before TIMEOUT_SLOTS");
  const seed3 = 3;
  const [pda3] = clash.gamePda(playerA.publicKey, seed3);
  await runIx("create", [clash.ixCreateGame(clash.PROGRAM_ID, pda3, playerA.publicKey, playerB.publicKey, stake, seed3)], [playerA]);
  await runIx("join", [clash.ixJoinGame(clash.PROGRAM_ID, pda3, playerB.publicKey)], [playerB]);
  await expectFail(
    "timeout: refund rejected while fresh",
    [clash.ixTimeout(clash.PROGRAM_ID, pda3, playerA.publicKey, playerA.publicKey, playerB.publicKey)],
    [playerA],
    6009,
  );

  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
  if (failures > 0) process.exit(1);
  void SystemProgram; // keep import for tx typing parity
}

main().catch((e) => { console.error(e); process.exit(1); });
