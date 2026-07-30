import PlayerAvatar from "./PlayerAvatar.jsx";
import AdSlot from "./AdSlot.jsx";

const ROLE_LABEL = { undercover: "Undercover", civilian: "Civilian", mrwhite: "Mr. White" };
const ROLE_CLASS = {
  undercover: "role-undercover",
  civilian: "role-civilian",
  mrwhite: "role-mrwhite",
};

const WINNER_BANNER = {
  civilians: "🕵️ Civilians win!",
  undercover: "🥸 Undercover wins!",
  mrwhite: "🎩 Mr. White wins solo!",
};

export default function GameOverScreen({ state, isHost, onPlayAgain }) {
  const sorted = [...state.players].sort((a, b) => b.score - a.score);

  return (
    <div className="screen screen--with-ad">
      <div className="card wide">
        <h2 className="winner-banner">{WINNER_BANNER[state.winner] || "Game over!"}</h2>

        <ul className="reveal-list">
          {state.players.map((p) => (
            <li key={p.id} className="player-row">
              <PlayerAvatar name={p.name} />
              <span>{p.name}</span>
              <span className={ROLE_CLASS[p.role]}>{ROLE_LABEL[p.role]}</span>
              <span className="word-reveal">{p.word ? `"${p.word}"` : "(no word)"}</span>
            </li>
          ))}
        </ul>

        <h3>Scoreboard</h3>
        <ul className="player-list">
          {sorted.map((p, i) => (
            <li key={p.id} className={i === 0 && p.score > 0 ? "player-row is-leader" : "player-row"}>
              {i === 0 && p.score > 0 && <span className="trophy">🏆</span>}
              <PlayerAvatar name={p.name} />
              <span>{p.name}</span>
              <span className="badge">{p.score} pts</span>
            </li>
          ))}
        </ul>

        {isHost ? (
          <button className="btn btn-primary" onClick={onPlayAgain}>
            Play Again
          </button>
        ) : (
          <p className="waiting-text">Waiting for the host to start a new game…</p>
        )}
      </div>

      <AdSlot label="Game Over" slot="9542895200" format="fluid" layout="in-article" />
    </div>
  );
}
