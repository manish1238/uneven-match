import { useState } from "react";

// A simple CSS 3D flip card showing the player's secret word. Tap/click to
// flip it face down again if someone's peeking over your shoulder.
export default function WordCard({ word }) {
  const [revealed, setRevealed] = useState(true);

  return (
    <div
      className={`word-card ${revealed ? "is-revealed" : ""}`}
      onClick={() => setRevealed((r) => !r)}
      role="button"
      tabIndex={0}
      title="Tap to flip"
    >
      <div className="word-card-inner">
        <div className="word-card-face word-card-front">
          <span className="word-card-label">Your word</span>
          <span className="word-card-text">{word}</span>
        </div>
        <div className="word-card-face word-card-back">🕵️</div>
      </div>
    </div>
  );
}
