import { useState, useEffect } from "react";
import PlayerAvatar from "./PlayerAvatar.jsx";
import AdSlot from "./AdSlot.jsx";

export default function Lobby({ state, isHost, onStart, onUpdateSettings, serverUrl }) {
  const [categories, setCategories] = useState(["random"]);
  const [category, setCategory] = useState("random");

  useEffect(() => {
    fetch(`${serverUrl}/categories`)
      .then((r) => r.json())
      .then((cats) => setCategories(["random", ...cats]))
      .catch(() => {});
  }, [serverUrl]);

  const canStart = state.players.length >= 3;
  const canUseMrWhite = state.players.length >= 5;
  const settings = state.settings || {};

  return (
    <div className="screen">
      <div className="card wide">
        <div className="room-code-banner">
          Room code <strong>{state.code}</strong> — share it with friends
        </div>

        <h2>Players ({state.players.length})</h2>
        <ul className="player-list">
          {state.players.map((p) => (
            <li key={p.id} className="player-row">
              <PlayerAvatar name={p.name} />
              <span>{p.name}</span>
              {p.isHost && <span className="badge">Host</span>}
              {p.id === state.you && <span className="badge badge-you">You</span>}
            </li>
          ))}
        </ul>

        <div className="settings-panel">
          <h3>Game settings</h3>

          {isHost ? (
            <>
              <label className="range-row">
                <span>Clue timer: {settings.clueSeconds}s</span>
                <input
                  type="range"
                  min={10}
                  max={120}
                  step={5}
                  value={settings.clueSeconds || 30}
                  onChange={(e) => onUpdateSettings({ clueSeconds: Number(e.target.value) })}
                />
              </label>

              <label className="range-row">
                <span>Vote timer: {settings.voteSeconds}s</span>
                <input
                  type="range"
                  min={10}
                  max={90}
                  step={5}
                  value={settings.voteSeconds || 45}
                  onChange={(e) => onUpdateSettings({ voteSeconds: Number(e.target.value) })}
                />
              </label>

              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={!!settings.includeMrWhite}
                  disabled={!canUseMrWhite}
                  onChange={(e) => onUpdateSettings({ includeMrWhite: e.target.checked })}
                />
                <span>
                  Include Mr. White (a player with no word who must bluff — if caught, they get
                  one guess at the secret word to steal the win)
                  {!canUseMrWhite && " — needs 5+ players"}
                </span>
              </label>
            </>
          ) : (
            <p className="waiting-text">
              Clue timer: {settings.clueSeconds}s · Vote timer: {settings.voteSeconds}s · Mr.
              White: {settings.includeMrWhite ? "On" : "Off"}
            </p>
          )}
        </div>

        {isHost ? (
          <div className="start-controls">
            <label>
              Category
              <select value={category} onChange={(e) => setCategory(e.target.value)}>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c === "random" ? "Random" : c}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="btn btn-primary"
              disabled={!canStart}
              onClick={() => onStart(category)}
            >
              {canStart ? "Start Game" : "Need at least 3 players"}
            </button>
          </div>
        ) : (
          <p className="waiting-text">Waiting for the host to start the game…</p>
        )}

        <AdSlot label="Lobby" />
      </div>
    </div>
  );
}
