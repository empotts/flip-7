import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowLeft, Crown, Plus, RotateCcw, Skull, Trash2, Trophy, Undo2 } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";

export const Route = createFileRoute("/score")({ component: Scorekeeper });

type LocalPlayer = {
  id: string;
  name: string;
  total: number;
  roundScore: string;
  busted: boolean;
};

type ScoredRound = { id: string; scores: Record<string, number> };
type SavedScoreboard = { players: LocalPlayer[]; rounds: ScoredRound[] };

const storageKey = "lucky-seven:local-scoreboard";

function Scorekeeper() {
  const [players, setPlayers] = useState<LocalPlayer[]>([]);
  const [rounds, setRounds] = useState<ScoredRound[]>([]);
  const [name, setName] = useState("");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      try {
        const saved = JSON.parse(raw) as SavedScoreboard;
        setPlayers(saved.players ?? []);
        setRounds(saved.rounds ?? []);
      } catch {
        localStorage.removeItem(storageKey);
      }
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) localStorage.setItem(storageKey, JSON.stringify({ players, rounds }));
  }, [hydrated, players, rounds]);

  const leaderId = useMemo(() => {
    if (players.length === 0) return null;
    const best = Math.max(...players.map((player) => player.total));
    const leaders = players.filter((player) => player.total === best);
    return leaders.length === 1 ? leaders[0].id : null;
  }, [players]);

  const addPlayer = (event: FormEvent) => {
    event.preventDefault();
    const clean = name.trim().replace(/\s+/g, " ").slice(0, 20);
    if (!clean || players.some((player) => player.name.toLowerCase() === clean.toLowerCase())) return;
    setPlayers((current) => [
      ...current,
      { id: crypto.randomUUID(), name: clean, total: 0, roundScore: "", busted: false },
    ]);
    setName("");
  };

  const updatePlayer = (id: string, update: Partial<LocalPlayer>) => {
    setPlayers((current) => current.map((player) => player.id === id ? { ...player, ...update } : player));
  };

  const scoreRound = () => {
    if (players.length === 0 || players.some((player) => player.roundScore === "")) return;
    const scores = Object.fromEntries(players.map((player) => [player.id, Number(player.roundScore)]));
    setRounds((current) => [...current, { id: crypto.randomUUID(), scores }]);
    setPlayers((current) => current.map((player) => ({
      ...player,
      total: player.total + scores[player.id],
      roundScore: "",
      busted: false,
    })));
  };

  const undoRound = () => {
    const last = rounds.at(-1);
    if (!last) return;
    setPlayers((current) => current.map((player) => ({
      ...player,
      total: player.total - (last.scores[player.id] ?? 0),
    })));
    setRounds((current) => current.slice(0, -1));
  };

  const reset = () => {
    if (!window.confirm("Clear every player and score from this device?")) return;
    setPlayers([]);
    setRounds([]);
  };

  return (
    <main className="scorekeeper-page">
      <header className="scorekeeper-header">
        <Link className="icon-button" to="/" aria-label="Back home"><ArrowLeft size={20} /></Link>
        <div className="game-brand score-brand"><span className="brand-mark">7</span><div><b>TABLE SCORE</b><small>LOCAL GAME</small></div></div>
        <button className="icon-button" onClick={reset} aria-label="Reset scoreboard"><RotateCcw size={18} /></button>
      </header>

      <section className="scorekeeper-hero">
        <p className="eyebrow"><Trophy size={15} /> First to 200</p>
        <h1>Pass the phone.<br /><em>Count the glory.</em></h1>
        <p>For a game happening around your table. Scores stay on this device.</p>
      </section>

      <section className="score-sheet">
        <div className="score-sheet-top">
          <div><span>ROUND</span><strong>{rounds.length + 1}</strong></div>
          {rounds.length > 0 && <button className="text-button" onClick={undoRound}><Undo2 size={15} /> Undo last round</button>}
        </div>

        <form className="add-player-form" onSubmit={addPlayer}>
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Add a player's name" maxLength={20} aria-label="Player name" />
          <button className="button button-primary" disabled={!name.trim()}><Plus size={18} /> Add</button>
        </form>

        <div className="local-player-list">
          {players.length === 0 ? (
            <div className="empty-scoreboard"><span>7</span><b>Add everyone at the table</b><small>Then enter a score or tap Bust each round.</small></div>
          ) : players.map((player) => (
            <article className={`local-player ${player.busted ? "did-bust" : ""}`} key={player.id}>
              <div className="local-player-name">
                <span className="avatar">{initials(player.name)}</span>
                <span><b>{player.name} {leaderId === player.id && <Crown size={14} />}</b><small>{player.total >= 200 ? "Over 200!" : `${200 - player.total} to win`}</small></span>
              </div>
              <div className="local-total"><strong>{player.total}</strong><small>TOTAL</small></div>
              <label className="round-score-input">
                <span>THIS ROUND</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min="0"
                  max="999"
                  value={player.roundScore}
                  onChange={(event) => updatePlayer(player.id, { roundScore: event.target.value, busted: false })}
                  placeholder="0"
                  aria-label={`${player.name} round score`}
                />
              </label>
              <button className={`bust-button ${player.busted ? "active" : ""}`} onClick={() => updatePlayer(player.id, { roundScore: "0", busted: true })}>
                <Skull size={17} /> {player.busted ? "Busted" : "Bust"}
              </button>
              <button className="remove-player" onClick={() => setPlayers((current) => current.filter((candidate) => candidate.id !== player.id))} aria-label={`Remove ${player.name}`}><Trash2 size={16} /></button>
            </article>
          ))}
        </div>

        {players.length > 0 && (
          <button className="button score-round-button" onClick={scoreRound} disabled={players.some((player) => player.roundScore === "")}>
            Score round {rounds.length + 1} <Plus size={19} />
          </button>
        )}
      </section>
    </main>
  );
}

const initials = (value: string) => value.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
