import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Connection, PublicKey } from "@solana/web3.js";
import * as clash from "@shared/clash";

const RPC = (import.meta.env.VITE_RPC_URL as string | undefined) ?? clash.COOKIE_RPC;
const WS = (import.meta.env.VITE_WS_URL as string | undefined) ?? clash.COOKIE_WS;
const IS_COOKIE = RPC.includes("cookiescan");

interface WalletLike {
  publicKey: PublicKey | null;
  connect(): Promise<void>;
  signTransaction(tx: Parameters<clash.WalletProvider["signTransaction"]>[0]): Promise<Parameters<clash.WalletProvider["signTransaction"]>[0]>;
  on?(ev: string, cb: (p: unknown) => void): void;
  removeListener?(ev: string, cb: (p: unknown) => void): void;
}

function getInjected(): { provider: WalletLike; name: string } | null {
  const w = window as unknown as Record<string, any>;
  if (w.nightly?.solana) return { provider: w.nightly.solana, name: "Nightly" };
  if (w.phantom?.solana) return { provider: w.phantom.solana, name: "Phantom" };
  if (w.solana?.isNightly) return { provider: w.solana, name: "Nightly" };
  if (w.solana) return { provider: w.solana, name: "Injected wallet" };
  return null;
}

interface Toast { id: number; text: string; kind: "ok" | "err" | "info" }

const short = (k: PublicKey) => `${k.toBase58().slice(0, 4)}…${k.toBase58().slice(-4)}`;

export default function App() {
  const conn = useMemo(() => new Connection(RPC, { wsEndpoint: WS, commitment: "confirmed" }), []);
  const [wallet, setWallet] = useState<WalletLike | null>(null);
  const [walletName, setWalletName] = useState("");
  const [me, setMe] = useState<PublicKey | null>(null);
  const [balance, setBalance] = useState<bigint | null>(null);
  const [games, setGames] = useState<clash.Game[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [feed, setFeed] = useState<string[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [opponent, setOpponent] = useState("");
  const [stake, setStake] = useState("0.01");
  const [busy, setBusy] = useState(false);
  const [genesisOk, setGenesisOk] = useState<boolean | null>(null);
  const toastId = useRef(0);

  const toast = useCallback((text: string, kind: Toast["kind"] = "info") => {
    const id = ++toastId.current;
    setToasts((t) => [...t, { id, text, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 6000);
  }, []);

  // network guard
  useEffect(() => {
    conn.getGenesisHash().then((g) => setGenesisOk(g === clash.COOKIE_GENESIS)).catch(() => setGenesisOk(false));
  }, [conn]);

  // wallet balance + live updates
  useEffect(() => {
    if (!me) return;
    const id = conn.onAccountChange(me, (acc) => setBalance(BigInt(acc.lamports)));
    conn.getBalance(me).then((b) => setBalance(BigInt(b))).catch(() => {});
    return () => { void conn.removeAccountChangeListener(id); };
  }, [conn, me]);

  // games list polling
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const raw = await conn.getProgramAccounts(clash.PROGRAM_ID);
        if (!alive) return;
        setGames(
          raw
            .map((r) => clash.decodeGame(r.pubkey, r.account.data))
            .filter((g) => g.status === clash.STATUS_WAITING || g.status === clash.STATUS_ACTIVE)
            .sort((a, b) => b.lastMoveSlot - a.lastMoveSlot),
        );
      } catch { /* rpc hiccup — next poll */ }
    };
    load();
    const t = setInterval(load, 2000);
    return () => { alive = false; clearInterval(t); };
  }, [conn]);

  // live feed (program logs)
  useEffect(() => {
    const id = conn.onLogs(clash.PROGRAM_ID, ({ logs }) => {
      const lines = logs.filter((l) => l.startsWith("Program log: clash:"));
      if (lines.length) setFeed((f) => [...lines.map((l) => l.replace("Program log: ", "")), ...f].slice(0, 25));
    });
    return () => { void conn.removeOnLogsListener(id); };
  }, [conn]);

  const connect = useCallback(async () => {
    const found = getInjected();
    if (!found) {
      toast("No injected wallet found. Install Nightly (https://nightly.app) and reload.", "err");
      return;
    }
    try {
      await found.provider.connect();
      setWallet(found.provider);
      setWalletName(found.name);
      setMe(found.provider.publicKey);
      toast(`Connected via ${found.name}`, "ok");
    } catch (e) {
      toast(clash.parseProgramError(e), "err");
    }
  }, [toast]);

  const guard = useCallback((): clash.WalletProvider | null => {
    if (!wallet?.publicKey) { toast("Connect a wallet first", "err"); return null; }
    return wallet as unknown as clash.WalletProvider;
  }, [wallet, toast]);

  const run = useCallback(async (label: string, make: () => Promise<{ ixs: Parameters<typeof clash.sendTx>[2] }>) => {
    const p = guard();
    if (!p) return;
    setBusy(true);
    try {
      const { ixs } = await make();
      const sig = await clash.sendTx(conn, p, ixs);
      toast(`${label} ✓ ${sig.slice(0, 12)}…`, "ok");
    } catch (e) {
      toast(`${label} failed: ${clash.parseProgramError(e)}`, "err");
    } finally {
      setBusy(false);
    }
  }, [conn, guard, toast]);

  const createGame = () => {
    let opp: PublicKey;
    try { opp = new PublicKey(opponent.trim()); } catch { toast("Opponent is not a valid address", "err"); return; }
    if (!wallet?.publicKey) { toast("Connect a wallet first", "err"); return; }
    const lamports = BigInt(Math.round(parseFloat(stake) * clash.LAMPORTS_PER_COOK));
    const playerA = wallet.publicKey;
    const seed = Date.now() % 65536;
    const [pda] = clash.gamePda(playerA, seed);
    run("create game", async () => ({
      ixs: [clash.ixCreateGame(clash.PROGRAM_ID, pda, playerA, opp, lamports, seed)],
    })).then(() => setSelected(pda.toBase58()));
  };

  const selectedGame = games.find((g) => g.address.toBase58() === selected) ?? null;

  const play = (cell: number) => {
    const g = selectedGame;
    if (!g) return;
    run(`move ${cell}`, async () => ({
      ixs: [clash.ixMove(clash.PROGRAM_ID, g.address, wallet!.publicKey!, g.playerA, g.playerB, cell)],
    }));
  };

  const join = (g: clash.Game) => {
    setSelected(g.address.toBase58());
    run("join game", async () => ({
      ixs: [clash.ixJoinGame(clash.PROGRAM_ID, g.address, wallet!.publicKey!)],
    }));
  };

  const cancel = (g: clash.Game) =>
    run("cancel game", async () => ({ ixs: [clash.ixCancel(clash.PROGRAM_ID, g.address, wallet!.publicKey!)] }));

  const timeout = (g: clash.Game) =>
    run("timeout refund", async () => ({
      ixs: [clash.ixTimeout(clash.PROGRAM_ID, g.address, wallet!.publicKey!, g.playerA, g.playerB)],
    }));

  const isMine = (g: clash.Game) => me && (g.playerA.equals(me) || g.playerB.equals(me));
  void isMine;

  return (
    <div className="app">
      <header>
        <div>
          <h1>🍪 Cookie Clash</h1>
          <p className="sub">wagered tic-tac-toe — every move settles on-chain on <b>Cookie Chain</b></p>
        </div>
        <div className="wallet-box">
          {me ? (
            <>
              <span className="addr" title={me.toBase58()}>{short(me)}</span>
              <span className="bal">{balance === null ? "…" : clash.fmtCook(balance)} COOK</span>
            </>
          ) : (
            <button className="btn primary" onClick={connect}>Connect wallet (Nightly)</button>
          )}
        </div>
      </header>

      {genesisOk === false && (
        <div className="banner">
          ⚠️ {IS_COOKIE
            ? "This RPC is not reporting Cookie Chain genesis — check your connection."
            : `Local/dev network (not Cookie Chain). Cookie Chain RPC: ${clash.COOKIE_RPC}`}
        </div>
      )}

      <main>
        <section className="col">
          <div className="card">
            <h2>Create a game</h2>
            {!me ? <p className="muted">Connect a wallet first.</p> : (
              <>
                <label>Opponent address
                  <input value={opponent} onChange={(e) => setOpponent(e.target.value)} placeholder="paste your opponent's Cookie Chain address" />
                </label>
                <label>Stake (COOK)
                  <input value={stake} onChange={(e) => setStake(e.target.value)} inputMode="decimal" />
                </label>
                <button className="btn primary" disabled={busy} onClick={createGame}>Stake & create challenge</button>
                <p className="muted small">No second wallet? Start a game, then run <code>npm run bot -- &lt;game address&gt;</code></p>
              </>
            )}
          </div>

          <div className="card">
            <h2>Open & active games <span className="muted small">({games.length})</span></h2>
            {games.length === 0 && <p className="muted">No games yet — create the first one.</p>}
            <table>
              <tbody>
                {games.map((g) => (
                  <tr key={g.address.toBase58()} className={g.address.toBase58() === selected ? "sel" : ""} onClick={() => setSelected(g.address.toBase58())}>
                    <td className="mono">{short(g.playerA)}</td>
                    <td>vs</td>
                    <td className="mono">{short(g.playerB)}</td>
                    <td>{clash.fmtCook(g.stake * 2n)} COOK</td>
                    <td><span className={`badge ${g.status === clash.STATUS_ACTIVE ? "live" : "wait"}`}>{clash.STATUS_NAMES[g.status]}</span></td>
                    <td>
                      {g.status === clash.STATUS_WAITING && me?.equals(g.playerB) && (
                        <button className="btn small" disabled={busy} onClick={(e) => { e.stopPropagation(); join(g); }}>Join</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="col">
          <div className="card">
            <h2>Board</h2>
            {!selectedGame && <p className="muted">Select or create a game.</p>}
            {selectedGame && (
              <Board
                game={selectedGame}
                me={me}
                conn={conn}
                onPlay={play}
                onCancel={cancel}
                onTimeout={timeout}
                busy={busy}
                refresh={async () => {
                  const info = await conn.getAccountInfo(selectedGame.address);
                  if (info) setGames((gs) => gs.map((x) => (x.address.equals(selectedGame.address) ? clash.decodeGame(selectedGame.address, info.data) : x)));
                }}
              />
            )}
            {selected && (
              <p className="small">
                game <code>{selected}</code>{" "}
                <a href={`${clash.EXPLORER}/account/${selected}`} target="_blank" rel="noreferrer">view on cookiescan ↗</a>
              </p>
            )}
          </div>

          <div className="card">
            <h2>Live feed <span className="muted small">(program logs, live)</span></h2>
            <div className="feed">
              {feed.length === 0 && <p className="muted">Waiting for on-chain activity…</p>}
              {feed.map((l, i) => <div key={i} className="feedline">{l}</div>)}
            </div>
          </div>
        </section>
      </main>

      <footer className="muted small">
        Cookie Chain mainnet · RPC {RPC} · program <code>{clash.PROGRAM_ID.toBase58()}</code> · native COOK escrow, winner paid in-tx
      </footer>

      <div className="toasts">
        {toasts.map((t) => <div key={t.id} className={`toast ${t.kind}`}>{t.text}</div>)}
      </div>
    </div>
  );
}

function Board({ game, me, conn, onPlay, onCancel, onTimeout, busy, refresh }: {
  game: clash.Game;
  me: PublicKey | null;
  conn: Connection;
  onPlay(cell: number): void;
  onCancel(g: clash.Game): void;
  onTimeout(g: clash.Game): void;
  busy: boolean;
  refresh(): Promise<void>;
}) {
  const line = clash.winnerLine(game.cells);
  const isA = me?.equals(game.playerA) ?? false;
  const isB = me?.equals(game.playerB) ?? false;
  const active = game.status === clash.STATUS_ACTIVE;
  const myTurn = active && ((game.turn % 2 === 0 && isA) || (game.turn % 2 === 1 && isB));

  // live board updates for the selected game
  useEffect(() => {
    const id = conn.onAccountChange(game.address, () => { void refresh(); });
    return () => { void conn.removeAccountChangeListener(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.address.toBase58()]);

  return (
    <>
      <div className="players">
        <span className={game.turn % 2 === 0 && active ? "turn" : ""}>A {short(game.playerA)}{" ✕"}</span>
        <span className="stake">pot {clash.fmtCook(game.stake * 2n)} COOK</span>
        <span className={game.turn % 2 === 1 && active ? "turn" : ""}>{"○ "}B {short(game.playerB)}</span>
      </div>
      <div className="status-line">
        {clash.STATUS_NAMES[game.status]}
        {active && <span> — turn {game.turn % 2 === 0 ? "A (✕)" : "B (○)"}{myTurn ? " · your move" : ""}</span>}
        {game.status === 2 && <span> — {line && game.cells[line[0]] === 1 ? "A" : "B"} wins the pot 🏆</span>}
      </div>
      <div className="board">
        {game.cells.map((c, i) => (
          <button
            key={i}
            className={`cell ${line?.includes(i) ? "winline" : ""} ${c === 1 ? "x" : c === 2 ? "o" : ""}`}
            disabled={!myTurn || c !== 255 || busy}
            onClick={() => onPlay(i)}
          >
            {c === 1 ? "✕" : c === 2 ? "○" : ""}
          </button>
        ))}
      </div>
      <div className="actions">
        {game.status === clash.STATUS_WAITING && isA && (
          <button className="btn" disabled={busy} onClick={() => onCancel(game)}>Cancel & refund</button>
        )}
        {active && (isA || isB) && (
          <button className="btn" disabled={busy} onClick={() => onTimeout(game)}>Timeout refund (if idle &gt; {clash.TIMEOUT_SLOTS / 150} min)</button>
        )}
      </div>
    </>
  );
}
