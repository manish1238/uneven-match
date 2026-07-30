import { useState } from "react";
import PlayerAvatar from "./PlayerAvatar.jsx";

const GADGET_INFO = {
  intel: { label: "Intel", icon: "🔍", hint: "Secretly peek one player's role — usable during voting." },
  decoy: { label: "Decoy", icon: "🛡️", hint: "Arm it now to survive if you're voted out this round." },
  doubleagent: { label: "Double Agent", icon: "🎯", hint: "Arm it now to make your vote count twice." },
};

const ROLE_LABEL = { undercover: "UNDERCOVER", civilian: "CIVILIAN", mrwhite: "MR. WHITE" };

// A one-time hidden ability every player secretly gets at game start. Shown
// on the clue and vote screens so it's always visible but only actionable
// at the right moment (Intel needs the vote-phase target list; Decoy and
// Double Agent just need arming ahead of the vote resolving).
export default function GadgetPanel({
  me,
  phase,
  players,
  onArmDecoy,
  onArmDoubleAgent,
  onUseIntel,
  intelResult,
  onDismissIntel,
}) {
  const [picking, setPicking] = useState(false);

  if (!me?.gadget) return null;
  const info = GADGET_INFO[me.gadget];

  if (me.gadgetUsed) {
    return (
      <div className="gadget-panel is-spent">
        <div className="gadget-header">
          <span className="gadget-icon">{info.icon}</span>
          <span className="gadget-label">{info.label} — used</span>
        </div>
        {intelResult && (
          <div className="gadget-result">
            🔍 <strong>{intelResult.targetName}</strong> is{" "}
            <strong>{ROLE_LABEL[intelResult.targetRole] || intelResult.targetRole}</strong>
            <button className="gadget-dismiss" onClick={onDismissIntel} aria-label="Dismiss">
              ×
            </button>
          </div>
        )}
      </div>
    );
  }

  const targets = players.filter((p) => p.alive && p.id !== me.id);

  return (
    <div className="gadget-panel">
      <div className="gadget-header">
        <span className="gadget-icon">{info.icon}</span>
        <span className="gadget-label">{info.label}</span>
      </div>
      <p className="gadget-hint">{info.hint}</p>

      {me.gadget === "intel" && (
        <>
          {phase !== "vote" ? (
            <span className="gadget-waiting">Available once voting starts</span>
          ) : picking ? (
            <div className="gadget-target-list">
              {targets.map((p) => (
                <button
                  key={p.id}
                  className="gadget-target"
                  onClick={() => {
                    onUseIntel(p.id);
                    setPicking(false);
                  }}
                >
                  <PlayerAvatar name={p.name} size={30} />
                  <span>{p.name}</span>
                </button>
              ))}
              <button className="gadget-cancel" onClick={() => setPicking(false)}>
                Cancel
              </button>
            </div>
          ) : (
            <button className="btn btn-gadget" onClick={() => setPicking(true)}>
              Peek a role
            </button>
          )}
        </>
      )}

      {me.gadget === "decoy" &&
        (me.decoyArmed ? (
          <span className="gadget-armed">Armed — you'll survive if voted out</span>
        ) : (
          <button className="btn btn-gadget" onClick={onArmDecoy}>
            Arm Decoy
          </button>
        ))}

      {me.gadget === "doubleagent" &&
        (me.doubleAgentArmed ? (
          <span className="gadget-armed">Armed — your next vote counts twice</span>
        ) : (
          <button className="btn btn-gadget" onClick={onArmDoubleAgent}>
            Arm Double Agent
          </button>
        ))}

      {intelResult && (
        <div className="gadget-result">
          🔍 <strong>{intelResult.targetName}</strong> is{" "}
          <strong>{ROLE_LABEL[intelResult.targetRole] || intelResult.targetRole}</strong>
          <button className="gadget-dismiss" onClick={onDismissIntel} aria-label="Dismiss">
            ×
          </button>
        </div>
      )}
    </div>
  );
}
