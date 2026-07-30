import PlayerAvatar from "./PlayerAvatar.jsx";

const ROLE_LABEL = { undercover: "UNDERCOVER", civilian: "CIVILIAN", mrwhite: "MR. WHITE" };
const ROLE_CLASS = {
  undercover: "role-undercover",
  civilian: "role-civilian",
  mrwhite: "role-mrwhite",
};

export default function RevealScreen({ state, isHost, onContinue }) {
  const { lastResult } = state;
  const hadMrWhiteGuess = lastResult && "mrWhiteGuess" in lastResult;

  return (
    <div className="screen">
      <div className="card">
        <h2>Round {lastResult?.round} results</h2>

        {lastResult?.decoySavedName ? (
          <div className="reveal-result">
            <PlayerAvatar name={lastResult.decoySavedName} size={64} />
            <p className="reveal-text">
              <strong>{lastResult.decoySavedName}</strong> was voted out — but activated their{" "}
              <strong className="role-decoy">🛡️ DECOY</strong> and survived!
            </p>
          </div>
        ) : lastResult?.tie ? (
          <p className="reveal-text">It's a tie — no one is eliminated this round.</p>
        ) : lastResult?.eliminatedId ? (
          <div className="reveal-result">
            <PlayerAvatar name={lastResult.eliminatedName} size={64} />
            <p className="reveal-text">
              <strong>{lastResult.eliminatedName}</strong> was voted out and was the{" "}
              <strong className={ROLE_CLASS[lastResult.eliminatedRole]}>
                {ROLE_LABEL[lastResult.eliminatedRole]}
              </strong>
              !
            </p>

            {hadMrWhiteGuess && (
              <p className="reveal-text">
                They guessed <strong>"{lastResult.mrWhiteGuess || "(nothing)"}"</strong> for the
                civilians' word —{" "}
                {lastResult.mrWhiteCorrect ? (
                  <strong className="role-civilian">correct! They win!</strong>
                ) : (
                  <>
                    wrong. The word was <strong>"{lastResult.civilianWord}"</strong>.
                  </>
                )}
              </p>
            )}
          </div>
        ) : (
          <p className="reveal-text">No one was eliminated.</p>
        )}

        {isHost ? (
          <button className="btn btn-primary" onClick={onContinue}>
            Next Round
          </button>
        ) : (
          <p className="waiting-text">Waiting for the host to continue…</p>
        )}
      </div>
    </div>
  );
}
