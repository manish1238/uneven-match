import { useState } from "react";

export default function JoinScreen({ onCreate, onJoin, error }) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [mode, setMode] = useState("join"); // 'join' | 'create'

  const canSubmit = name.trim().length > 0 && (mode === "create" || code.trim().length === 5);

  function handleSubmit(e) {
    e.preventDefault();
    if (!canSubmit) return;
    if (mode === "create") onCreate(name.trim());
    else onJoin(name.trim(), code.trim().toUpperCase());
  }

  return (
    <div className="screen join-screen">
      <div className="card">
        <h1 className="title">🕵️ Undercover</h1>
        <p className="subtitle">
          Everyone gets a secret word — except the undercover players, who get a
          sneaky similar one. Give clues, spot the liars, don't get caught.
        </p>

        <form onSubmit={handleSubmit} className="join-form">
          <label>
            Your name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={20}
              placeholder="e.g. Alex"
              autoFocus
            />
          </label>

          <div className="tabs">
            <button
              type="button"
              className={mode === "join" ? "tab active" : "tab"}
              onClick={() => setMode("join")}
            >
              Join room
            </button>
            <button
              type="button"
              className={mode === "create" ? "tab active" : "tab"}
              onClick={() => setMode("create")}
            >
              Create room
            </button>
          </div>

          {mode === "join" && (
            <label>
              Room code
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                maxLength={5}
                placeholder="ABCDE"
                className="room-code-input"
              />
            </label>
          )}

          {error && <p className="error-text">{error}</p>}

          <button type="submit" className="btn btn-primary" disabled={!canSubmit}>
            {mode === "create" ? "Create Room" : "Join Room"}
          </button>
        </form>
      </div>
    </div>
  );
}
