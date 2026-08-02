import { useEffect, useState, useCallback } from "react";
import { socket, SERVER_URL } from "./socket.js";
import JoinScreen from "./components/JoinScreen.jsx";
import Lobby from "./components/Lobby.jsx";
import ClueScreen from "./components/ClueScreen.jsx";
import VoteScreen from "./components/VoteScreen.jsx";
import MrWhiteGuessScreen from "./components/MrWhiteGuessScreen.jsx";
import RevealScreen from "./components/RevealScreen.jsx";
import GameOverScreen from "./components/GameOverScreen.jsx";

export default function App() {
  const [state, setState] = useState(null); // sanitized room state from server
  const [error, setError] = useState("");
  const [connectionError, setConnectionError] = useState(false);
  const [intelResult, setIntelResult] = useState(null);

  useEffect(() => {
    function onState(s) {
      setState(s);
      setError("");
      if (s.phase !== "vote") setIntelResult(null);
    }
    function onError(msg) {
      setError(msg);
    }
    function onConnectError() {
      setConnectionError(true);
    }
    function onIntelResult(result) {
      setIntelResult(result);
    }

    socket.on("room:state", onState);
    socket.on("room:error", onError);
    socket.on("connect_error", onConnectError);
    socket.on("connect", () => setConnectionError(false));
    socket.on("gadget:intelResult", onIntelResult);

    return () => {
      socket.off("room:state", onState);
      socket.off("room:error", onError);
      socket.off("connect_error", onConnectError);
      socket.off("gadget:intelResult", onIntelResult);
    };
  }, []);

  const ensureConnected = useCallback(() => {
    if (!socket.connected) socket.connect();
  }, []);

  function handleCreate(name) {
    ensureConnected();
    socket.emit("room:create", { name }, (res) => {
      if (!res?.ok) setError(res?.error || "Could not create room.");
    });
  }

  function handleJoin(name, code) {
    ensureConnected();
    socket.emit("room:join", { code, name }, (res) => {
      if (!res?.ok) setError(res?.error || "Could not join room.");
    });
  }

  function handleStart(category) {
    socket.emit("game:start", { category });
  }

  function handleUpdateSettings(settings) {
    socket.emit("room:updateSettings", settings);
  }

  function handleUpdateCustomWords(words) {
    socket.emit("room:updateCustomWords", { words });
  }

  function handleSubmitGuess(guess) {
    socket.emit("game:mrWhiteGuess", { guess });
  }

  function handleSubmitClue(clue) {
    socket.emit("game:submitClue", { clue });
  }

  function handleVote(votedId) {
    socket.emit("game:submitVote", { votedId });
  }

  function handleContinue() {
    socket.emit("game:continue");
  }

  function handlePlayAgain() {
    socket.emit("game:playAgain");
  }

  function handleArmDecoy() {
    socket.emit("game:armDecoy");
  }

  function handleArmDoubleAgent() {
    socket.emit("game:armDoubleAgent");
  }

  function handleUseIntel(targetId) {
    socket.emit("game:useIntel", { targetId });
  }

  if (connectionError) {
    return (
      <div className="screen">
        <div className="card">
          <h2>Can't reach the game server</h2>
          <p className="subtitle">
            Make sure the backend is running (<code>npm run dev</code> in{" "}
            <code>server/</code>) and reachable at{" "}
            <code>{SERVER_URL || window.location.origin}</code>.
          </p>
        </div>
      </div>
    );
  }

  if (!state) {
    return <JoinScreen onCreate={handleCreate} onJoin={handleJoin} error={error} />;
  }

  const isHost = state.hostId === state.you;

  switch (state.phase) {
    case "lobby":
      return (
        <Lobby
          state={state}
          isHost={isHost}
          onStart={handleStart}
          onUpdateSettings={handleUpdateSettings}
          onUpdateCustomWords={handleUpdateCustomWords}
          serverUrl={SERVER_URL}
        />
      );
    case "clue":
      return (
        <ClueScreen
          state={state}
          onSubmitClue={handleSubmitClue}
          onArmDecoy={handleArmDecoy}
          onArmDoubleAgent={handleArmDoubleAgent}
          onUseIntel={handleUseIntel}
          intelResult={intelResult}
          onDismissIntel={() => setIntelResult(null)}
        />
      );
    case "vote":
      return (
        <VoteScreen
          state={state}
          onVote={handleVote}
          onArmDecoy={handleArmDecoy}
          onArmDoubleAgent={handleArmDoubleAgent}
          onUseIntel={handleUseIntel}
          intelResult={intelResult}
          onDismissIntel={() => setIntelResult(null)}
        />
      );
    case "mrwhiteGuess":
      return <MrWhiteGuessScreen state={state} onSubmitGuess={handleSubmitGuess} />;
    case "reveal":
      return <RevealScreen state={state} isHost={isHost} onContinue={handleContinue} />;
    case "gameover":
      return <GameOverScreen state={state} isHost={isHost} onPlayAgain={handlePlayAgain} />;
    default:
      return null;
  }
}
