import { useEffect, useState } from "react";

function secondsLeft(endsAt) {
  if (!endsAt) return 0;
  return Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
}

// Countdown driven by a server-provided deadline (epoch ms) rather than a
// locally-started interval, so every player in the room sees the same
// number regardless of when their own client rendered this component.
export default function Timer({ endsAt, totalSeconds }) {
  const [remaining, setRemaining] = useState(() => secondsLeft(endsAt));

  useEffect(() => {
    setRemaining(secondsLeft(endsAt));
    if (!endsAt) return undefined;
    const id = setInterval(() => setRemaining(secondsLeft(endsAt)), 200);
    return () => clearInterval(id);
  }, [endsAt]);

  if (!endsAt) return null;

  const pct = totalSeconds ? Math.max(0, Math.min(100, (remaining / totalSeconds) * 100)) : 100;
  const low = remaining <= 5;

  return (
    <div className={`timer ${low ? "timer-low" : ""}`}>
      <div className="timer-track">
        <div className="timer-bar" style={{ width: `${pct}%` }} />
      </div>
      <span className="timer-text">{remaining}s</span>
    </div>
  );
}
