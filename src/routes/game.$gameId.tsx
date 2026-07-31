import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  Check,
  Copy,
  Crown,
  LogIn,
  Play,
  RotateCw,
  ShieldCheck,
  Sparkles,
  UserRound,
  Wifi,
  WifiOff,
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import type { Card, ClientMessage, GameView, PlayerView, ServerMessage } from "../types";

export const Route = createFileRoute("/game/$gameId")({ component: GamePage });

type Session = { playerId: string; token: string; name: string };

function GamePage() {
  const { gameId: rawGameId } = Route.useParams();
  const gameId = rawGameId.toUpperCase();
  const navigate = useNavigate();
  const socketRef = useRef<WebSocket | null>(null);
  const retryRef = useRef<number | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [game, setGame] = useState<GameView | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const raw = localStorage.getItem(`lucky-seven:${gameId}`);
    if (raw) {
      try { setSession(JSON.parse(raw) as Session); } catch { localStorage.removeItem(`lucky-seven:${gameId}`); }
    }
  }, [gameId]);

  const connect = useCallback(() => {
    if (!session) return;
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const url = new URL(`${protocol}//${window.location.host}/api/games/${gameId}/socket`);
    url.searchParams.set("playerId", session.playerId);
    url.searchParams.set("token", session.token);
    const socket = new WebSocket(url);
    socketRef.current = socket;
    socket.onopen = () => { setConnected(true); setError(""); };
    socket.onmessage = (event) => {
      const message = JSON.parse(event.data as string) as ServerMessage;
      if (message.type === "state") setGame(message.game);
      if (message.type === "error") setError(message.message);
    };
    socket.onerror = () => setError("Realtime connection interrupted.");
    socket.onclose = () => {
      setConnected(false);
      if (socketRef.current === socket) retryRef.current = window.setTimeout(connect, 1800);
    };
  }, [gameId, session]);

  useEffect(() => {
    connect();
    return () => {
      if (retryRef.current) window.clearTimeout(retryRef.current);
      const socket = socketRef.current;
      socketRef.current = null;
      socket?.close();
    };
  }, [connect]);

  if (!session) {
    return <JoinFromLink gameId={gameId} onJoined={setSession} />;
  }

  const send = (message: ClientMessage) => {
    setError("");
    if (socketRef.current?.readyState !== WebSocket.OPEN) {
      setError("Still reconnecting — try that move again in a moment.");
      return;
    }
    socketRef.current.send(JSON.stringify(message));
  };

  const share = async () => {
    const shareData = {
      title: "Join my Lucky Seven game",
      text: `Join my game with code ${gameId}`,
      url: window.location.href,
    };
    if (navigator.share) await navigator.share(shareData).catch(() => undefined);
    else await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  if (!game) {
    return (
      <main className="loading-screen">
        <span className="brand-mark loading-seven">7</span>
        <p>{connected ? "Reading the table…" : "Connecting to the table…"}</p>
      </main>
    );
  }

  const me = game.players.find((player) => player.id === session.playerId)!;
  const isMyTurn = game.currentPlayerId === me.id;
  const isChoosingTarget = game.pendingActionPlayerId === me.id && !!game.pendingAction;
  const canStart = me.isHost && ["lobby", "round-over"].includes(game.phase);
  const activePlayer = game.players.find((player) => player.id === game.currentPlayerId);

  return (
    <main className="game-shell">
      <header className="game-header">
        <button className="icon-button" aria-label="Leave table" onClick={() => navigate({ to: "/" })}>
          <ArrowLeft size={20} />
        </button>
        <div className="game-brand">
          <span className="brand-mark">7</span>
          <div><b>LUCKY SEVEN</b><small>GAME <span>{game.id}</span></small></div>
        </div>
        <div className="header-actions">
          <span className={`connection ${connected ? "online" : "offline"}`}>
            {connected ? <Wifi size={14} /> : <WifiOff size={14} />}
            <span>{connected ? "Live" : "Reconnecting"}</span>
          </span>
          <button className="button button-ghost share-button" onClick={share}>
            {copied ? <Check size={17} /> : <Copy size={17} />}
            {copied ? "Copied" : "Share game"}
          </button>
        </div>
      </header>

      <section className="status-strip">
        <div>
          <span className="round-label">{game.phase === "lobby" ? "WAITING ROOM" : `ROUND ${game.round}`}</span>
          <p>{game.message}</p>
        </div>
        <div className="deck-counter" title="Cards remaining in deck">
          <span className="mini-deck"><i /><i /><b>7</b></span>
          <div><strong>{game.deckCount}</strong><small>cards left</small></div>
        </div>
      </section>

      {error && <div className="toast-error" role="alert">{error}</div>}

      <section className="table-layout">
        <aside className="score-panel">
          <div className="panel-heading"><span>TABLE</span><small>{game.players.length}/8 players</small></div>
          <div className="players-scroll">
            {game.players.map((player) => {
              const targetable = isChoosingTarget && player.status === "active" && (
                game.pendingAction !== "secondChance" || (player.id !== me.id && !player.hasSecondChance)
              );
              return (
                <button
                  key={player.id}
                  className={`player-row ${player.id === me.id ? "is-me" : ""} ${player.id === game.currentPlayerId ? "is-turn" : ""} ${targetable ? "is-targetable" : ""}`}
                  disabled={!targetable}
                  onClick={() => send({ type: "target", targetId: player.id })}
                >
                  <span className="avatar">{initials(player.name)}</span>
                  <span className="player-identity">
                    <b>{player.name} {player.isHost && <Crown size={13} />} {player.id === game.dealerId && <span className="dealer-tag">DEALER</span>}</b>
                    <small>{playerStatus(player, game)}</small>
                  </span>
                  <span className="score"><b>{player.score}</b><small>PTS</small></span>
                  {targetable && <span className="target-hint">TARGET</span>}
                </button>
              );
            })}
          </div>
        </aside>

        <section className="play-area">
          {game.phase === "lobby" ? (
            <LobbyView game={game} me={me} canStart={canStart} send={send} share={share} />
          ) : (
            <>
              <div className="turn-banner">
                {isChoosingTarget ? (
                  <><Sparkles size={18} /> Choose {game.pendingAction === "secondChance" ? "another player for" : "any active player for"} <b>{actionName(game.pendingAction)}</b></>
                ) : isMyTurn && game.phase === "playing" ? (
                  <><span className="pulse-dot" /> Your turn — flip or stay?</>
                ) : game.phase === "playing" ? (
                  <><span className="watch-dot" /> Waiting for <b>{activePlayer?.name}</b></>
                ) : game.phase === "game-over" ? (
                  <><Crown size={18} /> {game.players.find((p) => p.id === game.winnerId)?.name} wins the table</>
                ) : (
                  <>Round complete</>
                )}
              </div>

              <div className="hands-list">
                {game.players.map((player) => (
                  <PlayerHand key={player.id} player={player} isMe={player.id === me.id} />
                ))}
              </div>
            </>
          )}
        </section>
      </section>

      <footer className="action-bar">
        <div className="action-context">
          <span>{me.name}</span>
          <b>{me.status === "active" ? `${handScore(me.cards)} on the table` : playerStatus(me, game)}</b>
        </div>
        <div className="action-buttons">
          {canStart ? (
            <button className="button button-primary" onClick={() => send({ type: "start" })} disabled={game.phase === "lobby" && game.players.length < 2}>
              <Play size={18} fill="currentColor" /> {game.phase === "lobby" ? "Start game" : "Next round"}
            </button>
          ) : game.phase === "playing" ? (
            <>
              <button className="button button-stay" disabled={!isMyTurn || isChoosingTarget || me.status !== "active" || me.cards.length === 0} onClick={() => send({ type: "stay" })}>
                <ShieldCheck size={19} /> Stay
              </button>
              <button className="button button-flip" disabled={!isMyTurn || isChoosingTarget || me.status !== "active"} onClick={() => send({ type: "hit" })}>
                <RotateCw size={19} /> Flip a card
              </button>
            </>
          ) : (
            <span className="waiting-host">{game.phase === "game-over" ? "Game complete" : "Waiting for the host…"}</span>
          )}
        </div>
      </footer>
    </main>
  );
}

function JoinFromLink({ gameId, onJoined }: { gameId: string; onJoined: (session: Session) => void }) {
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const join = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/games/${gameId}/join`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = (await response.json()) as { playerId?: string; token?: string; error?: string };
      if (!response.ok || !data.playerId || !data.token) throw new Error(data.error || "Could not join.");
      const next = { playerId: data.playerId, token: data.token, name };
      localStorage.setItem(`lucky-seven:${gameId}`, JSON.stringify(next));
      onJoined(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not join.");
    } finally { setBusy(false); }
  };

  return (
    <main className="join-page">
      <a className="brand" href="/"><span className="brand-mark">7</span><span>LUCKY SEVEN</span></a>
      <div className="lobby-card invite-card">
        <span className="invite-icon"><LogIn size={24} /></span>
        <p className="eyebrow">YOU'VE BEEN INVITED</p>
        <h1>Take a seat.</h1>
        <p>Game code <b className="inline-code">{gameId}</b></p>
        <form onSubmit={join}>
          <label>Your name<input value={name} onChange={(e) => setName(e.target.value)} maxLength={20} placeholder="How should we call you?" required autoFocus /></label>
          {error && <p className="form-error">{error}</p>}
          <button className="button button-primary submit-button" disabled={busy}>{busy ? "Joining…" : "Join game"}<LogIn size={18} /></button>
        </form>
      </div>
    </main>
  );
}

function LobbyView({ game, me, canStart, send, share }: { game: GameView; me: PlayerView; canStart: boolean; send: (m: ClientMessage) => void; share: () => void }) {
  return (
    <div className="waiting-room">
      <span className="waiting-icon"><UserRound size={30} /></span>
      <p className="eyebrow">THE TABLE IS OPEN</p>
      <h2>Waiting for players</h2>
      <p>Share the link with friends. The host can deal once at least two players are seated.</p>
      <div className="game-code-block"><small>GAME CODE</small><strong>{game.id}</strong></div>
      <div className="lobby-actions">
        <button className="button button-ghost" onClick={share}><Copy size={17} /> Copy invite</button>
        {canStart && <button className="button button-primary" onClick={() => send({ type: "start" })} disabled={game.players.length < 2}><Play size={17} fill="currentColor" /> Start game</button>}
      </div>
      {!me.isHost && <small className="host-note">The host will start the game.</small>}
    </div>
  );
}

function PlayerHand({ player, isMe }: { player: PlayerView; isMe: boolean }) {
  return (
    <article className={`hand-row ${isMe ? "my-hand" : ""} ${player.status === "busted" ? "busted" : ""}`}>
      <div className="hand-meta">
        <div><span className="avatar small">{initials(player.name)}</span><b>{isMe ? "Your hand" : player.name}</b></div>
        <span><b>{player.status === "busted" ? 0 : handScore(player.cards)}</b> round pts</span>
      </div>
      <div className="cards-scroll">
        {player.cards.length ? player.cards.map((card) => <CardTile key={card.id} card={card} />) : <span className="empty-hand">No cards yet</span>}
      </div>
      {player.status !== "active" && <span className={`hand-stamp ${player.status}`}>{player.status}</span>}
    </article>
  );
}

function CardTile({ card }: { card: Card }) {
  if (card.kind === "number") return <span className={`playing-card number-card n${card.value % 6}`}><small>7</small><strong>{card.value}</strong><small>{card.value}</small></span>;
  if (card.kind === "bonus") return <span className="playing-card bonus-card"><small>BONUS</small><strong>+{card.value}</strong><small>PTS</small></span>;
  if (card.kind === "double") return <span className="playing-card double-card"><small>SCORE</small><strong>×2</strong><small>DOUBLE</small></span>;
  if (card.kind === "secondChance") return <span className="playing-card chance-card"><small>SECOND</small><strong>↺</strong><small>CHANCE</small></span>;
  return <span className="playing-card action-card"><small>ACTION</small><strong>{card.kind === "freeze" ? "❄" : "3×"}</strong><small>{card.kind === "freeze" ? "FREEZE" : "FLIP"}</small></span>;
}

const initials = (name: string) => name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();

const actionName = (action: GameView["pendingAction"]) =>
  action === "freeze" ? "Freeze" : action === "flip3" ? "Flip Three" : "Second Chance";

const handScore = (cards: Card[]) => {
  const number = cards.reduce((sum, card) => sum + (card.kind === "number" ? card.value : 0), 0);
  const bonus = cards.reduce((sum, card) => sum + (card.kind === "bonus" ? card.value : 0), 0);
  return number * (cards.some((card) => card.kind === "double") ? 2 : 1) + bonus + (cards.filter((card) => card.kind === "number").length >= 7 ? 15 : 0);
};

const playerStatus = (player: PlayerView, game: GameView) => {
  if (!player.connected) return "Offline";
  if (game.phase === "lobby") return "Ready";
  if (player.status === "busted") return "Busted";
  if (player.status === "stayed") return `Stayed · +${player.roundScore}`;
  if (player.status === "frozen") return `Frozen · +${player.roundScore}`;
  if (game.currentPlayerId === player.id) return "Taking a turn";
  return "In the round";
};
