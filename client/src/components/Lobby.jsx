import { useState, useEffect } from "react";
import PlayerAvatar from "./PlayerAvatar.jsx";
import AdSlot from "./AdSlot.jsx";

export default function Lobby({ state, isHost, onStart, onUpdateSettings, onUpdateCustomWords, serverUrl }) {
  const [categories, setCategories] = useState(["random"]);
  const [category, setCategory] = useState("random");
  // Seeded once from the room's saved list (so a returning host sees what
  // they already set), then left alone — we don't want a state broadcast
  // clobbering the textarea mid-edit.
  const [wordsText, setWordsText] = useState(() => (state.customWords || []).join(", "));
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => {
    fetch(`${serverUrl}/categories`)
      .then((r) => r.json())
      .then((cats) => setCategories(["random", ...cats]))
      .catch(() => {});
  }, [serverUrl]);

  const canStart = state.players.length >= 3;
  const canUseMrWhite = state.players.length >= 5;
  const settings = state.settings || {};
  const customWords = state.customWords || [];
  const hasCustomWords = customWords.length >= 2;

  useEffect(() => {
    if (category === "custom" && !hasCustomWords) setCategory("random");
  }, [category, hasCustomWords]);

  function handleSaveWords() {
    const parsed = wordsText
      .split(/[,\n]/)
      .map((w) => w.trim())
      .filter(Boolean);
    onUpdateCustomWords(parsed);
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 1800);
  }

  return (
    <div className="screen screen--with-ad">
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

        <div className="settings-panel custom-words-panel">
          <h3>Custom words</h3>
          <p className="subtitle small">
            Add your own words — inside jokes, nicknames, anything your group will recognize.
            Each round picks two different words from this list, one for the civilians and one
            for the undercover players.
          </p>

          {isHost ? (
            <>
              <textarea
                value={wordsText}
                onChange={(e) => setWordsText(e.target.value)}
                placeholder="e.g. Pineapple Pizza, Sunday Brunch, Aunt Rita, Beach Day…"
                rows={3}
                maxLength={2000}
              />
              <div className="custom-words-row">
                <button type="button" className="btn btn-gadget" onClick={handleSaveWords}>
                  {justSaved ? "Saved ✓" : "Save Words"}
                </button>
                <span className="waiting-text">
                  {customWords.length > 0
                    ? `${customWords.length} word${customWords.length === 1 ? "" : "s"} saved`
                    : "No custom words saved yet"}
                  {customWords.length > 0 && customWords.length < 2 && " — add at least 2 to use them"}
                </span>
              </div>
            </>
          ) : customWords.length > 0 ? (
            <p className="waiting-text">
              Host set {customWords.length} custom word{customWords.length === 1 ? "" : "s"}:{" "}
              {customWords.join(", ")}
            </p>
          ) : (
            <p className="waiting-text">The host hasn't added any custom words.</p>
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
                {hasCustomWords && <option value="custom">🎉 Custom (your words)</option>}
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
      </div>

      <AdSlot label="Lobby" slot="9285423062" format="fluid" layoutKey="-6t+ed+2i-1n-4w" />
    </div>
  );
}
