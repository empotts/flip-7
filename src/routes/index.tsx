import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowRight, Calculator, Copy, Layers3, Sparkles, Users } from "lucide-react";
import { FormEvent, useState } from "react";
import type { GameMode } from "../types";

export const Route = createFileRoute("/")({ component: Home });

type SessionResponse = { gameId: string; playerId: string; token: string; error?: string };

function Home() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"create" | "join">("create");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [gameMode, setGameMode] = useState<GameMode>("classic");
  const [pointGoal, setPointGoal] = useState(200);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const gameCode = code.trim().toUpperCase();
      const endpoint = mode === "create" ? "/api/games" : `/api/games/${gameCode}/join`;
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(mode === "create" ? { name, mode: gameMode, pointGoal } : { name }),
      });
      const data = (await response.json()) as SessionResponse;
      if (!response.ok) throw new Error(data.error || "Could not reach the table.");
      localStorage.setItem(
        `lucky-seven:${data.gameId}`,
        JSON.stringify({ playerId: data.playerId, token: data.token, name }),
      );
      await navigate({ to: "/game/$gameId", params: { gameId: data.gameId } });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="landing">
      <nav className="home-nav">
        <a className="brand" href="/" aria-label="Lucky Seven home">
          <span className="brand-mark">7</span>
          <span>LUCKY SEVEN</span>
        </a>
        <span className="live-pill"><i /> Realtime multiplayer</span>
      </nav>

      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow"><Sparkles size={14} /> Push your luck. Know when to stop.</p>
          <h1>Flip cards.<br /><em>Risk everything.</em></h1>
          <p className="hero-lede">
            Be the first to 200. Build a hand without repeating a number —
            and flip seven unique cards for a 15-point rush.
          </p>

          <div className="feature-row" aria-label="Game features">
            <span><Users size={18} /><b>2–8</b> players</span>
            <span><Layers3 size={18} /><b>94</b> cards</span>
            <span><Copy size={18} /><b>1</b> share link</span>
          </div>

          <Link className="local-score-link" to="/score">
            <span className="score-link-icon"><Calculator size={20} /></span>
            <span><b>Playing with real cards?</b><small>Keep score on this device</small></span>
            <ArrowRight size={18} />
          </Link>
        </div>

        <div className="lobby-card">
          <div className="segmented" role="tablist" aria-label="Create or join">
            <button className={mode === "create" ? "active" : ""} onClick={() => setMode("create")}>Create game</button>
            <button className={mode === "join" ? "active" : ""} onClick={() => setMode("join")}>Join game</button>
          </div>

          <form onSubmit={submit}>
            <label>
              Your name
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="How should we call you?"
                maxLength={20}
                autoComplete="nickname"
                required
              />
            </label>

            {mode === "join" && (
              <label>
                Game code
                <input
                  className="code-input"
                  value={code}
                  onChange={(event) => setCode(event.target.value.toUpperCase())}
                  placeholder="ABCDE"
                  maxLength={5}
                  autoCapitalize="characters"
                  required
                />
              </label>
            )}

            {mode === "create" && (
              <div className="game-options">
                <fieldset>
                  <legend>Game mode</legend>
                  <label className={`option-card ${gameMode === "classic" ? "selected" : ""}`}>
                    <input type="radio" name="game-mode" checked={gameMode === "classic"} onChange={() => setGameMode("classic")} />
                    <span><b>Classic</b><small>The original 94-card game</small></span>
                  </label>
                  <label className={`option-card ${gameMode === "vengeance" ? "selected" : ""}`}>
                    <input type="radio" name="game-mode" checked={gameMode === "vengeance"} onChange={() => setGameMode("vengeance")} />
                    <span><b>With a Vengeance</b><small>Special numbers, take-that cards, and negative modifiers</small></span>
                  </label>
                </fieldset>
                <label>
                  Point goal
                  <input type="number" inputMode="numeric" min="1" max="9999" value={pointGoal} onChange={(event) => setPointGoal(Number(event.target.value))} required />
                </label>
              </div>
            )}

            {error && <p className="form-error" role="alert">{error}</p>}
            <button className="button button-primary submit-button" disabled={busy}>
              {busy ? "Setting the table…" : mode === "create" ? "Create a table" : "Join the table"}
              {!busy && <ArrowRight size={18} />}
            </button>
          </form>

          <p className="fine-print">No account needed. Your private player key stays on this device.</p>
        </div>
      </section>

      <div className="decorative-cards" aria-hidden="true">
        <span className="deco-card deco-one">12</span>
        <span className="deco-card deco-two">7</span>
        <span className="deco-card deco-three">+8</span>
      </div>
    </main>
  );
}
