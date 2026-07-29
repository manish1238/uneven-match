import { useState } from "react";
import PlayerAvatar from "./PlayerAvatar.jsx";
import Timer from "./Timer.jsx";

export default function MrWhiteGuessScreen({ state, onSubmitGuess }) {
  const [guess, setGuess] = useState("");
  const isGuesser = state.you === state.mrWhiteGuesserId;
  const guesser = state.players.find((p) => p.id === state.mrWhiteGuesserId);

  function handleSubmit(e) {
    e.preventDefault();
    if (!guess.trim()) return;
    onSubmitGuess(guess.trim());
  }

  return (
    <div className="screen">
      <div className="card">
        <h2>🥸 Mr. White was caught!</h2>

        <div className="reveal-result">
          <PlayerAvatar name={guesser?.name || "?"} size={64} />
          <p className="reveal-text">
            <strong>{guesser?.name}</strong> was secretly <strong className="role-mrwhite">MR. WHITE</strong>{" "}
            (no word at all) — but gets one shot to guess the civilians' word and steal the win.
          </p>
        </div>

        <Timer endsAt={state.guessEndsAt} totalSeconds={state.settings?.guessSeconds} />

        {isGuesser ? (
          <form onSubmit={handleSubmit} className="clue-form" style={{ marginTop: 16 }}>
            <input
              value={guess}
              onChange={(e) => setGuess(e.target.value)}
              placeholder="What was the civilians' word?"
              maxLength={40}
              autoFocus
            />
            <button type="submit" className="btn btn-primary" disabled={!guess.trim()}>
              Guess
            </button>
          </form>
        ) : (
          <p className="waiting-text">Waiting for {guesser?.name} to guess…</p>
        )}
      </div>
    </div>
  );
}
