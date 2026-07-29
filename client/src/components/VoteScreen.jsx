import PlayerAvatar from "./PlayerAvatar.jsx";
import Timer from "./Timer.jsx";

export default function VoteScreen({ state, onVote }) {
  const me = state.players.find((p) => p.id === state.you);
  const alivePlayers = state.players.filter((p) => p.alive);

  return (
    <div className="screen">
      <div className="card wide">
        <h2>Who's undercover?</h2>
        <p className="subtitle">Vote for the player you think has the different word.</p>

        <Timer endsAt={state.voteEndsAt} totalSeconds={state.settings?.voteSeconds} />

        <ul className="clue-list vote-recap">
          {state.clues.map((c, i) => (
            <li key={i} className="clue-row">
              <PlayerAvatar name={c.name} size={28} />
              <span className="clue-name">{c.name}:</span>
              <span className="clue-text">{c.clue}</span>
            </li>
          ))}
        </ul>

        {me?.alive ? (
          <div className="vote-grid">
            {alivePlayers.map((p) => (
              <button
                key={p.id}
                className={`vote-card ${me.hasVoted ? "disabled" : ""}`}
                disabled={me.hasVoted}
                onClick={() => onVote(p.id)}
              >
                <PlayerAvatar name={p.name} size={48} />
                <span>{p.name}</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="eliminated-banner">You've been eliminated — watch how it plays out.</p>
        )}

        {me?.hasVoted && <p className="waiting-text">Vote locked in. Waiting on others…</p>}
      </div>
    </div>
  );
}
