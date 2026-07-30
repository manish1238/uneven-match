import { useState } from "react";
import PlayerAvatar from "./PlayerAvatar.jsx";
import WordCard from "./WordCard.jsx";
import Timer from "./Timer.jsx";
import GadgetPanel from "./GadgetPanel.jsx";

export default function ClueScreen({
  state,
  onSubmitClue,
  onArmDecoy,
  onArmDoubleAgent,
  onUseIntel,
  intelResult,
  onDismissIntel,
}) {
  const [clue, setClue] = useState("");
  const me = state.players.find((p) => p.id === state.you);
  const isMyTurn = state.turnPlayerId === state.you;
  const turnPlayer = state.players.find((p) => p.id === state.turnPlayerId);

  function handleSubmit(e) {
    e.preventDefault();
    if (!clue.trim()) return;
    onSubmitClue(clue.trim());
    setClue("");
  }

  return (
    <div className="screen">
      <div className="card wide">
        <div className="round-header">
          <span>Round {state.round}</span>
          <span className="category-chip">{state.category}</span>
        </div>

        <Timer endsAt={state.turnEndsAt} totalSeconds={state.settings?.clueSeconds} />

        {me?.alive ? (
          <WordCard word={me.word} />
        ) : (
          <p className="eliminated-banner">You've been eliminated — watch how it plays out.</p>
        )}

        <div className="turn-indicator">
          {isMyTurn ? (
            <strong>Your turn — give a one-line clue!</strong>
          ) : (
            <span>
              Waiting on <strong>{turnPlayer?.name || "…"}</strong>
            </span>
          )}
        </div>

        <ul className="clue-list">
          {state.clues.map((c, i) => (
            <li key={i} className="clue-row">
              <PlayerAvatar name={c.name} size={28} />
              <span className="clue-name">{c.name}:</span>
              <span className="clue-text">{c.clue}</span>
            </li>
          ))}
        </ul>

        {isMyTurn && me?.alive && (
          <form onSubmit={handleSubmit} className="clue-form">
            <input
              value={clue}
              onChange={(e) => setClue(e.target.value)}
              placeholder="Describe your word without saying it…"
              maxLength={80}
              autoFocus
            />
            <button type="submit" className="btn btn-primary" disabled={!clue.trim()}>
              Send
            </button>
          </form>
        )}

        <div className="player-strip">
          {state.players.map((p) => (
            <div
              key={p.id}
              className={
                p.id === state.turnPlayerId
                  ? "player-strip-item is-turn"
                  : "player-strip-item"
              }
            >
              <PlayerAvatar name={p.name} size={32} dimmed={!p.alive} />
              <span className={p.alive ? "" : "strikethrough"}>{p.name}</span>
              {p.hasSubmittedClue && p.alive && <span className="check">✓</span>}
            </div>
          ))}
        </div>

        {me?.alive && (
          <GadgetPanel
            me={me}
            phase={state.phase}
            players={state.players}
            onArmDecoy={onArmDecoy}
            onArmDoubleAgent={onArmDoubleAgent}
            onUseIntel={onUseIntel}
            intelResult={intelResult}
            onDismissIntel={onDismissIntel}
          />
        )}
      </div>
    </div>
  );
}
