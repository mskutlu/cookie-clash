// Cookie Clash shared client — plain @solana/web3.js, no generated SDK.
// Used by the web app (browser), the e2e test and the demo bot (node).
import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  TransactionSignature,
} from "@solana/web3.js";

export const PROGRAM_ID = new PublicKey("8t1WJbixxfUk9Q3eyVt7DaGi8y2fE2embzHdBU9hFXh6");
export const COOKIE_RPC = "https://rpc.cookiescan.io";
export const COOKIE_WS = "wss://wss.cookiescan.io";
export const COOKIE_GENESIS = "9wDaBRDgArEUpvhHxGguNkwozsZh4UpGZB9o2EoEcBB2";
export const EXPLORER = "https://cookiescan.io";
export const LAMPORTS_PER_COOK = 1_000_000_000;
export const TIMEOUT_SLOTS = 15_000;

export const STATUS_NAMES = ["waiting", "active", "finished", "draw", "cancelled", "abandoned"];
export const STATUS_WAITING = 0;
export const STATUS_ACTIVE = 1;

// Anchor discriminators: sha256("global:<method>")[0..8], precomputed.
const DISC = {
  create_game: [0x7c, 0x45, 0x4b, 0x42, 0xb8, 0xdc, 0x48, 0xce],
  join_game: [0x6b, 0x70, 0x12, 0x26, 0x38, 0xad, 0x3c, 0x80],
  make_move: [0x4e, 0x4d, 0x98, 0xcb, 0xde, 0xd3, 0xd0, 0xe9],
  cancel_game: [0x79, 0xc2, 0x9a, 0x76, 0x67, 0xeb, 0x95, 0x34],
  timeout_refund: [0xc2, 0xcd, 0x8d, 0x25, 0xe7, 0x76, 0x93, 0x09],
};

export const ERROR_CODES: Record<number, string> = {
  6000: "Stake too small (minimum 0.001 COOK)",
  6001: "You cannot challenge yourself",
  6002: "Game is not waiting for a player to join",
  6003: "Game is not active",
  6004: "You are not a player in this game",
  6005: "It is not your turn",
  6006: "Cell is already taken",
  6007: "Cell must be 0-8",
  6008: "Unauthorized",
  6009: "Game has not been idle long enough to refund",
  6010: "Pot underflow",
  6011: "Wrong payout account",
  6012: "Stake transfer failed",
};

export function parseProgramError(e: unknown): string {
  const m = String((e as Error)?.message ?? e);
  const hex = m.match(/custom program error: 0x([0-9a-f]+)/i);
  if (hex) {
    const code = parseInt(hex[1], 16);
    if (ERROR_CODES[code]) return ERROR_CODES[code];
  }
  const anchor = m.match(/Error Code: (\w+)/);
  if (anchor) return anchor[1];
  return m.split("\n")[0].slice(0, 160);
}

export interface Game {
  address: PublicKey;
  playerA: PublicKey;
  playerB: PublicKey;
  stake: bigint;
  seed: number;
  turn: number;
  cells: number[];
  status: number;
  bump: number;
  lastMoveSlot: number;
}

export function decodeGame(address: PublicKey, data: Uint8Array): Game {
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let o = 8; // anchor discriminator
  const pk = () => new PublicKey(data.slice(o, (o += 32)));
  const playerA = pk();
  const playerB = pk();
  const stake = dv.getBigUint64(o, true); o += 8;
  const seed = dv.getUint16(o, true); o += 2;
  const turn = dv.getUint8(o); o += 1;
  const cells = Array.from(data.slice(o, o + 9)); o += 9;
  const status = dv.getUint8(o); o += 1;
  const bump = dv.getUint8(o); o += 1;
  const lastMoveSlot = Number(dv.getBigUint64(o, true));
  return { address, playerA, playerB, stake, seed, turn, cells, status, bump, lastMoveSlot };
}

const EMPTY = 255;
export function gamePda(playerA: PublicKey, seed: number, programId: PublicKey = PROGRAM_ID): [PublicKey, number] {
  const s = new Uint8Array(2);
  new DataView(s.buffer).setUint16(0, seed, true);
  return PublicKey.findProgramAddressSync([Buffer.from("game"), playerA.toBytes(), s], programId);
}

export function winnerLine(cells: number[]): [number, number, number] | null {
  const L: [number, number, number][] = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6],
  ];
  for (const l of L) {
    const v = cells[l[0]];
    if (v !== EMPTY && v === cells[l[1]] && v === cells[l[2]]) return l;
  }
  return null;
}

function u64le(n: bigint): Uint8Array {
  const b = new Uint8Array(8);
  new DataView(b.buffer).setBigUint64(0, n, true);
  return b;
}

function ix(programId: PublicKey, disc: number[], data: Uint8Array, keys: { pubkey: PublicKey; isSigner: boolean; isWritable: boolean }[]): TransactionInstruction {
  const full = new Uint8Array(8 + data.length);
  full.set(disc, 0);
  full.set(data, 8);
  return new TransactionInstruction({ programId, keys, data: Buffer.from(full) });
}

const K = (pubkey: PublicKey, isSigner: boolean, isWritable: boolean) => ({ pubkey, isSigner, isWritable });

export function ixCreateGame(programId: PublicKey, pda: PublicKey, playerA: PublicKey, opponent: PublicKey, stake: bigint, seed: number): TransactionInstruction {
  const data = new Uint8Array(42);
  data.set(opponent.toBytes(), 0);
  data.set(u64le(stake), 32);
  new DataView(data.buffer).setUint16(40, seed, true);
  return ix(programId, DISC.create_game, data, [K(pda, false, true), K(playerA, true, true), K(SystemProgram.programId, false, false)]);
}

export function ixJoinGame(programId: PublicKey, pda: PublicKey, playerB: PublicKey): TransactionInstruction {
  return ix(programId, DISC.join_game, new Uint8Array(0), [K(pda, false, true), K(playerB, true, true), K(SystemProgram.programId, false, false)]);
}

export function ixMove(programId: PublicKey, pda: PublicKey, mover: PublicKey, playerA: PublicKey, playerB: PublicKey, cell: number): TransactionInstruction {
  return ix(programId, DISC.make_move, new Uint8Array([cell]), [
    K(pda, false, true), K(mover, true, false), K(playerA, false, true), K(playerB, false, true),
  ]);
}

export function ixCancel(programId: PublicKey, pda: PublicKey, playerA: PublicKey): TransactionInstruction {
  return ix(programId, DISC.cancel_game, new Uint8Array(0), [K(pda, false, true), K(playerA, true, true)]);
}

export function ixTimeout(programId: PublicKey, pda: PublicKey, caller: PublicKey, playerA: PublicKey, playerB: PublicKey): TransactionInstruction {
  return ix(programId, DISC.timeout_refund, new Uint8Array(0), [
    K(pda, false, true), K(caller, true, false), K(playerA, false, true), K(playerB, false, true),
  ]);
}

export interface WalletProvider {
  publicKey: PublicKey;
  connect(): Promise<void>;
  signTransaction(tx: Transaction): Promise<Transaction>;
}

export async function sendTx(conn: Connection, provider: WalletProvider, ixs: TransactionInstruction[]): Promise<TransactionSignature> {
  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash();
  const tx = new Transaction().add(...ixs);
  tx.feePayer = provider.publicKey;
  tx.recentBlockhash = blockhash;
  const signed = await provider.signTransaction(tx);
  const sig = await conn.sendRawTransaction(signed.serialize(), { skipPreflight: false });
  await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
  return sig;
}

export function fmtCook(lamports: bigint | number): string {
  const n = typeof lamports === "bigint" ? Number(lamports) : lamports;
  return (n / LAMPORTS_PER_COOK).toFixed(n % LAMPORTS_PER_COOK === 0 ? 0 : 3);
}
