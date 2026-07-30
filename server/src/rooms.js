import { customAlphabet } from "nanoid";
import { pickWordPair } from "./words.js";

const makeRoomCode = customAlphabet("ABCDEFGHJKLMNPQRSTUVWXYZ23456789", 5);

// In-memory room store. Fine for a small multiplayer party game running on
// one server process. If you outgrow one process later, swap this Map for
// Redis and keep the same function signatures.
const rooms = new Map();

const MIN_PLAYERS = 3;
const MAX_PLAYERS = 10;

const SETTINGS_LIMITS = {
  clueSeconds: { min: 10, max: 120, default: 30 },
  voteSeconds: { min: 10, max: 90, default: 45 },
  guessSeconds: { min: 10, max: 60, default: 20 },
};

// The Socket.IO server instance, set once from index.js via initRooms(io).
// Needed here because round timers fire outside of a socket handler and
// still need to broadcast the resulting state to everyone in the room.
let ioInstance = null;
export function initRooms(io) {
  ioInstance = io;
}

function defaultSettings() {
  return {
    clueSeconds: SETTINGS_LIMITS.clueSeconds.default,
    voteSeconds: SETTINGS_LIMITS.voteSeconds.default,
    guessSeconds: SETTINGS_LIMITS.guessSeconds.default,
    includeMrWhite: false,
  };
}

function clamp(n, { min, max }) {
  return Math.min(max, Math.max(min, Math.round(Number(n))));
}

// One random gadget per player per game — a small hidden-ability layer that
// adds a second kind of bluffing (do you reveal you're holding Decoy by
// surviving a vote you should've lost?) on top of the core role bluff.
const GADGETS = ["intel", "decoy", "doubleagent"];
export const GADGET_INFO = {
  intel: { label: "Intel", icon: "🔍", hint: "Secretly peek one player's role during voting." },
  decoy: { label: "Decoy", icon: "🛡️", hint: "Arm it to survive if you'd be voted out this round." },
  doubleagent: { label: "Double Agent", icon: "🎯", hint: "Arm it to make your vote count twice." },
};

function newPlayer(id, name, isHost) {
  return {
    id,
    name,
    isHost,
    alive: true,
    role: null, // 'civilian' | 'undercover' | 'mrwhite'
    word: null,
    hasSubmittedClue: false,
    hasVoted: false,
    score: 0,
    connected: true,
    gadget: null, // 'intel' | 'decoy' | 'doubleagent', assigned at game start
    gadgetUsed: false,
    decoyArmed: false,
    doubleAgentArmed: false,
  };
}

export function createRoom(hostId, hostName) {
  let code;
  do {
    code = makeRoomCode();
  } while (rooms.has(code));

  const room = {
    code,
    hostId,
    phase: "lobby", // lobby -> clue -> vote -> (mrwhiteGuess) -> reveal -> gameover
    players: new Map([[hostId, newPlayer(hostId, hostName, true)]]),
    round: 0,
    category: "random",
    wordPair: null,
    turnOrder: [],
    currentTurnIndex: 0,
    clues: [], // { playerId, name, clue }
    votes: new Map(), // voterId -> votedId
    lastResult: null,
    winner: null,
    settings: defaultSettings(),
    turnEndsAt: null,
    voteEndsAt: null,
    guessEndsAt: null,
    mrWhiteGuesserId: null,
    pendingReveal: null,
    _timer: null,
    createdAt: Date.now(),
  };
  rooms.set(code, room);
  return room;
}

export function getRoom(code) {
  return rooms.get((code || "").toUpperCase());
}

export function updateSettings(code, requesterId, partial) {
  const room = getRoom(code);
  if (!room) return { error: "Room not found." };
  if (room.hostId !== requesterId) return { error: "Only the host can change settings." };
  if (room.phase !== "lobby") return { error: "Can't change settings mid-game." };

  const next = { ...room.settings };
  if (partial.clueSeconds !== undefined)
    next.clueSeconds = clamp(partial.clueSeconds, SETTINGS_LIMITS.clueSeconds);
  if (partial.voteSeconds !== undefined)
    next.voteSeconds = clamp(partial.voteSeconds, SETTINGS_LIMITS.voteSeconds);
  if (partial.guessSeconds !== undefined)
    next.guessSeconds = clamp(partial.guessSeconds, SETTINGS_LIMITS.guessSeconds);
  if (partial.includeMrWhite !== undefined) next.includeMrWhite = !!partial.includeMrWhite;

  room.settings = next;
  return { room };
}

export function joinRoom(code, id, name) {
  const room = getRoom(code);
  if (!room) return { error: "Room not found." };
  if (room.players.has(id)) return { room };
  if (room.phase !== "lobby") return { error: "Game already in progress." };
  if (room.players.size >= MAX_PLAYERS) return { error: "Room is full." };
  const nameTaken = [...room.players.values()].some(
    (p) => p.name.toLowerCase() === name.toLowerCase()
  );
  if (nameTaken) return { error: "That name is already taken in this room." };

  room.players.set(id, newPlayer(id, name, false));
  return { room };
}

export function removePlayer(code, id) {
  const room = getRoom(code);
  if (!room) return null;

  const wasCurrentTurn = room.phase === "clue" && room.turnOrder[room.currentTurnIndex] === id;
  const wasPendingGuesser = room.phase === "mrwhiteGuess" && room.mrWhiteGuesserId === id;

  room.players.delete(id);

  if (room.players.size === 0) {
    clearRoomTimer(room);
    rooms.delete(code);
    return null;
  }

  if (room.hostId === id) {
    room.hostId = [...room.players.keys()][0];
    room.players.get(room.hostId).isHost = true;
  }

  const turnIdx = room.turnOrder.indexOf(id);
  if (turnIdx !== -1) {
    room.turnOrder.splice(turnIdx, 1);
    if (turnIdx < room.currentTurnIndex) room.currentTurnIndex -= 1;
  }

  if (room.phase === "clue") {
    if (wasCurrentTurn) {
      // The player who left was mid-turn; move on without them.
      if (room.currentTurnIndex >= room.turnOrder.length) {
        endClueRound(room);
      } else {
        scheduleClueTimeout(room);
      }
    }
  } else if (room.phase === "vote") {
    room.votes.delete(id);
    maybeResolveVotes(room);
  } else if (room.phase === "mrwhiteGuess" && wasPendingGuesser) {
    resolveMrWhiteGuess(room, null);
  } else {
    checkWinCondition(room);
  }

  return room;
}

function alivePlayers(room) {
  return [...room.players.values()].filter((p) => p.alive);
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function clearRoomTimer(room) {
  if (room._timer) {
    clearTimeout(room._timer);
    room._timer = null;
  }
}

function broadcastLater(room) {
  if (ioInstance) broadcastRoom(ioInstance, room);
}

function scheduleClueTimeout(room) {
  clearRoomTimer(room);
  const seconds = room.settings.clueSeconds;
  room.turnEndsAt = Date.now() + seconds * 1000;
  room._timer = setTimeout(() => {
    autoSkipClue(room);
    broadcastLater(room);
  }, seconds * 1000);
}

function scheduleVoteTimeout(room) {
  clearRoomTimer(room);
  const seconds = room.settings.voteSeconds;
  room.voteEndsAt = Date.now() + seconds * 1000;
  room._timer = setTimeout(() => {
    resolveVotes(room);
    broadcastLater(room);
  }, seconds * 1000);
}

function scheduleGuessTimeout(room) {
  clearRoomTimer(room);
  const seconds = room.settings.guessSeconds;
  room.guessEndsAt = Date.now() + seconds * 1000;
  room._timer = setTimeout(() => {
    resolveMrWhiteGuess(room, null);
    broadcastLater(room);
  }, seconds * 1000);
}

function endClueRound(room) {
  room.phase = "vote";
  room.turnEndsAt = null;
  room.votes = new Map();
  for (const p of room.players.values()) p.hasVoted = false;
  scheduleVoteTimeout(room);
}

function autoSkipClue(room) {
  if (room.phase !== "clue") return;
  const playerId = room.turnOrder[room.currentTurnIndex];
  const player = playerId ? room.players.get(playerId) : null;
  if (player) {
    player.hasSubmittedClue = true;
    room.clues.push({ playerId, name: player.name, clue: "(ran out of time)" });
  }
  room.currentTurnIndex += 1;

  if (room.currentTurnIndex >= room.turnOrder.length) {
    endClueRound(room);
  } else {
    scheduleClueTimeout(room);
  }
}

function maybeResolveVotes(room) {
  const alive = alivePlayers(room);
  if (alive.length > 0 && room.votes.size >= alive.length) {
    resolveVotes(room);
  }
}

export function startGame(code, requesterId, category) {
  const room = getRoom(code);
  if (!room) return { error: "Room not found." };
  if (room.hostId !== requesterId) return { error: "Only the host can start the game." };
  if (room.players.size < MIN_PLAYERS)
    return { error: `Need at least ${MIN_PLAYERS} players to start.` };

  const players = [...room.players.values()];
  const undercoverCount = players.length >= 7 ? 2 : 1;
  const includeMrWhite = room.settings.includeMrWhite && players.length >= 5;

  const shuffled = shuffle(players);
  const undercoverIds = new Set(shuffled.slice(0, undercoverCount).map((p) => p.id));
  const mrWhiteId = includeMrWhite ? shuffled[undercoverCount]?.id : null;

  room.wordPair = pickWordPair(category);
  room.category = category || "random";

  for (const p of room.players.values()) {
    p.alive = true;
    p.hasSubmittedClue = false;
    p.hasVoted = false;
    if (p.id === mrWhiteId) {
      p.role = "mrwhite";
      p.word = null;
    } else if (undercoverIds.has(p.id)) {
      p.role = "undercover";
      p.word = room.wordPair.undercover;
    } else {
      p.role = "civilian";
      p.word = room.wordPair.civilian;
    }
    p.gadget = GADGETS[Math.floor(Math.random() * GADGETS.length)];
    p.gadgetUsed = false;
    p.decoyArmed = false;
    p.doubleAgentArmed = false;
  }

  room.round = 1;
  room.clues = [];
  room.votes = new Map();
  room.lastResult = null;
  room.winner = null;
  room.pendingReveal = null;
  room.mrWhiteGuesserId = null;
  room.turnOrder = shuffle(alivePlayers(room).map((p) => p.id));
  room.currentTurnIndex = 0;
  room.phase = "clue";
  scheduleClueTimeout(room);

  return { room };
}

export function submitClue(code, playerId, clue) {
  const room = getRoom(code);
  if (!room) return { error: "Room not found." };
  if (room.phase !== "clue") return { error: "Not accepting clues right now." };
  const player = room.players.get(playerId);
  if (!player || !player.alive) return { error: "You're not in this round." };
  if (room.turnOrder[room.currentTurnIndex] !== playerId)
    return { error: "It's not your turn yet." };

  const trimmed = (clue || "").trim().slice(0, 80);
  if (!trimmed) return { error: "Clue can't be empty." };
  if (player.word && trimmed.toLowerCase().includes(player.word.toLowerCase()))
    return { error: "You can't say the word itself in your clue!" };

  player.hasSubmittedClue = true;
  room.clues.push({ playerId, name: player.name, clue: trimmed });
  room.currentTurnIndex += 1;

  if (room.currentTurnIndex >= room.turnOrder.length) {
    endClueRound(room);
  } else {
    scheduleClueTimeout(room);
  }

  return { room };
}

export function submitVote(code, voterId, votedId) {
  const room = getRoom(code);
  if (!room) return { error: "Room not found." };
  if (room.phase !== "vote") return { error: "Not voting right now." };
  const voter = room.players.get(voterId);
  if (!voter || !voter.alive) return { error: "You can't vote this round." };
  const target = room.players.get(votedId);
  if (!target || !target.alive) return { error: "Invalid vote target." };

  room.votes.set(voterId, votedId);
  voter.hasVoted = true;
  maybeResolveVotes(room);

  return { room };
}

function resolveVotes(room) {
  clearRoomTimer(room);
  room.voteEndsAt = null;

  // Double Agent: an armed vote counts twice, consumed the moment it's
  // tallied (whether or not it ends up mattering to the outcome).
  const tally = new Map();
  for (const [voterId, votedId] of room.votes.entries()) {
    const voter = room.players.get(voterId);
    const weight = voter?.doubleAgentArmed && !voter.gadgetUsed ? 2 : 1;
    tally.set(votedId, (tally.get(votedId) || 0) + weight);
    if (weight === 2) {
      voter.gadgetUsed = true;
      voter.doubleAgentArmed = false;
    }
  }

  let maxVotes = 0;
  let leaders = [];
  for (const [id, count] of tally.entries()) {
    if (count > maxVotes) {
      maxVotes = count;
      leaders = [id];
    } else if (count === maxVotes) {
      leaders.push(id);
    }
  }

  let eliminatedId = null;
  let eliminatedRole = null;
  let decoySavedName = null;
  if (leaders.length === 1) {
    const eliminated = room.players.get(leaders[0]);
    // Guard against voting for someone who disconnected before votes resolved.
    if (eliminated) {
      if (eliminated.decoyArmed && !eliminated.gadgetUsed) {
        // Decoy: survive this elimination instead of dying. One-time use.
        eliminated.gadgetUsed = true;
        eliminated.decoyArmed = false;
        decoySavedName = eliminated.name;
      } else {
        eliminatedId = leaders[0];
        eliminated.alive = false;
        eliminatedRole = eliminated.role;
      }
    }
  }

  // Armed-but-unused gadgets don't carry over past the round they were armed.
  for (const p of room.players.values()) {
    p.decoyArmed = false;
    p.doubleAgentArmed = false;
  }

  const resultBase = {
    round: room.round,
    tally: Object.fromEntries(tally),
    eliminatedId,
    eliminatedName: eliminatedId ? room.players.get(eliminatedId).name : null,
    eliminatedRole,
    decoySavedName,
    tie: leaders.length > 1,
  };

  // Mr. White gets one shot at guessing the civilian word instead of an
  // immediate reveal — that's the whole point of the role.
  if (eliminatedRole === "mrwhite") {
    room.pendingReveal = resultBase;
    room.mrWhiteGuesserId = eliminatedId;
    room.phase = "mrwhiteGuess";
    scheduleGuessTimeout(room);
    return;
  }

  room.lastResult = resultBase;
  room.phase = "reveal";
  checkWinCondition(room);
}

// Intel: a private, one-time peek at another alive player's role. Doesn't
// touch room.phase/broadcastable state beyond marking the gadget used — the
// actual revealed role is returned directly to the caller (index.js emits
// it only to the requesting socket, never broadcast).
export function useIntel(code, playerId, targetId) {
  const room = getRoom(code);
  if (!room) return { error: "Room not found." };
  const player = room.players.get(playerId);
  if (!player || !player.alive) return { error: "You can't do that right now." };
  if (player.gadget !== "intel") return { error: "You don't have this gadget." };
  if (player.gadgetUsed) return { error: "You've already used your gadget this game." };
  if (room.phase !== "vote") return { error: "Intel can only be used while voting." };
  if (targetId === playerId) return { error: "Pick someone else to peek at." };
  const target = room.players.get(targetId);
  if (!target || !target.alive) return { error: "Invalid target." };

  player.gadgetUsed = true;
  return { room, targetName: target.name, targetRole: target.role };
}

// Decoy: arm during the clue or vote phase; if you're the sole player voted
// out this round, you survive instead (consuming the gadget either way it
// resolves — armed-and-unused fizzles out at round end, see resolveVotes).
export function armDecoy(code, playerId) {
  const room = getRoom(code);
  if (!room) return { error: "Room not found." };
  const player = room.players.get(playerId);
  if (!player || !player.alive) return { error: "You can't do that right now." };
  if (player.gadget !== "decoy") return { error: "You don't have this gadget." };
  if (player.gadgetUsed) return { error: "You've already used your gadget this game." };
  if (room.phase !== "clue" && room.phase !== "vote")
    return { error: "Arm this before the vote resolves." };
  if (player.decoyArmed) return { error: "Already armed for this round." };

  player.decoyArmed = true;
  return { room };
}

// Double Agent: arm during the clue or vote phase to make your next vote
// count twice once it's cast.
export function armDoubleAgent(code, playerId) {
  const room = getRoom(code);
  if (!room) return { error: "Room not found." };
  const player = room.players.get(playerId);
  if (!player || !player.alive) return { error: "You can't do that right now." };
  if (player.gadget !== "doubleagent") return { error: "You don't have this gadget." };
  if (player.gadgetUsed) return { error: "You've already used your gadget this game." };
  if (room.phase !== "clue" && room.phase !== "vote")
    return { error: "Arm this before the vote resolves." };
  if (player.doubleAgentArmed) return { error: "Already armed for this round." };

  player.doubleAgentArmed = true;
  return { room };
}

export function submitMrWhiteGuess(code, playerId, guess) {
  const room = getRoom(code);
  if (!room) return { error: "Room not found." };
  if (room.phase !== "mrwhiteGuess") return { error: "No guess is being made right now." };
  if (room.mrWhiteGuesserId !== playerId) return { error: "It's not your guess to make." };

  resolveMrWhiteGuess(room, guess);
  return { room };
}

function resolveMrWhiteGuess(room, guess) {
  clearRoomTimer(room);
  room.guessEndsAt = null;

  const guesserId = room.mrWhiteGuesserId;
  const trimmedGuess = (guess || "").trim();
  const correct =
    !!trimmedGuess &&
    !!room.wordPair &&
    trimmedGuess.toLowerCase() === room.wordPair.civilian.toLowerCase();

  room.lastResult = {
    ...room.pendingReveal,
    mrWhiteGuess: trimmedGuess || null,
    mrWhiteCorrect: correct,
    civilianWord: room.wordPair?.civilian || null,
  };
  room.pendingReveal = null;
  room.mrWhiteGuesserId = null;
  room.phase = "reveal";

  if (correct && guesserId) {
    room.winner = "mrwhite";
    room.phase = "gameover";
    const guesser = room.players.get(guesserId);
    if (guesser) guesser.score += 1;
  } else {
    checkWinCondition(room);
  }
}

function checkWinCondition(room) {
  if (room.phase === "lobby" || room.phase === "gameover") return;

  const alive = alivePlayers(room);
  const undercoverAlive = alive.filter((p) => p.role === "undercover").length;
  const mrWhiteAlive = alive.filter((p) => p.role === "mrwhite").length;
  const civiliansAlive = alive.filter((p) => p.role === "civilian").length;
  const spiesAlive = undercoverAlive + mrWhiteAlive;

  let winner = null;
  if (room.wordPair) {
    if (spiesAlive === 0) winner = "civilians";
    else if (spiesAlive >= civiliansAlive) winner = "undercover";
  }

  if (winner) {
    clearRoomTimer(room);
    room.turnEndsAt = null;
    room.voteEndsAt = null;
    room.guessEndsAt = null;
    room.phase = "gameover";
    room.winner = winner;
    for (const p of room.players.values()) {
      const onWinningTeam =
        (winner === "civilians" && p.role === "civilian") ||
        (winner === "undercover" && (p.role === "undercover" || p.role === "mrwhite"));
      if (onWinningTeam) p.score += 1;
    }
  }
}

export function continueToNextRound(code, requesterId) {
  const room = getRoom(code);
  if (!room) return { error: "Room not found." };
  if (room.hostId !== requesterId) return { error: "Only the host can continue." };
  if (room.phase !== "reveal") return { error: "Nothing to continue yet." };

  room.round += 1;
  room.clues = [];
  room.votes = new Map();
  room.lastResult = null;
  for (const p of room.players.values()) {
    p.hasSubmittedClue = false;
    p.hasVoted = false;
  }
  room.turnOrder = shuffle(alivePlayers(room).map((p) => p.id));
  room.currentTurnIndex = 0;
  room.phase = "clue";
  scheduleClueTimeout(room);

  return { room };
}

export function resetToLobby(code, requesterId) {
  const room = getRoom(code);
  if (!room) return { error: "Room not found." };
  if (room.hostId !== requesterId) return { error: "Only the host can do that." };

  clearRoomTimer(room);
  room.phase = "lobby";
  room.round = 0;
  room.wordPair = null;
  room.turnOrder = [];
  room.currentTurnIndex = 0;
  room.clues = [];
  room.votes = new Map();
  room.lastResult = null;
  room.winner = null;
  room.turnEndsAt = null;
  room.voteEndsAt = null;
  room.guessEndsAt = null;
  room.mrWhiteGuesserId = null;
  room.pendingReveal = null;
  for (const p of room.players.values()) {
    p.alive = true;
    p.role = null;
    p.word = null;
    p.hasSubmittedClue = false;
    p.hasVoted = false;
    p.gadget = null;
    p.gadgetUsed = false;
    p.decoyArmed = false;
    p.doubleAgentArmed = false;
  }

  return { room };
}

// Builds the view of room state that's safe to send to a specific socket:
// nobody sees anyone else's secret word/role unless that player has been
// eliminated (their role is revealed to everyone) or the game has ended.
export function sanitizeForPlayer(room, viewerId) {
  const revealAll = room.phase === "gameover";

  const players = [...room.players.values()].map((p) => {
    const revealThisPlayer = revealAll || !p.alive || p.id === viewerId;
    const isViewer = p.id === viewerId;
    return {
      id: p.id,
      name: p.name,
      isHost: p.isHost,
      alive: p.alive,
      score: p.score,
      connected: p.connected,
      hasSubmittedClue: p.hasSubmittedClue,
      hasVoted: p.hasVoted,
      role: revealThisPlayer ? p.role : null,
      word: isViewer || revealAll ? p.word : null,
      // Gadgets stay private to their owner — nobody should know what
      // ability another player is holding, that's part of the bluff.
      gadget: isViewer ? p.gadget : null,
      gadgetUsed: isViewer ? p.gadgetUsed : null,
      decoyArmed: isViewer ? p.decoyArmed : null,
      doubleAgentArmed: isViewer ? p.doubleAgentArmed : null,
    };
  });

  return {
    code: room.code,
    phase: room.phase,
    round: room.round,
    category: room.category,
    hostId: room.hostId,
    players,
    clues: room.clues,
    turnPlayerId: room.turnOrder[room.currentTurnIndex] || null,
    turnOrder: room.turnOrder,
    lastResult: room.lastResult,
    winner: room.winner || null,
    settings: room.settings,
    turnEndsAt: room.turnEndsAt,
    voteEndsAt: room.voteEndsAt,
    guessEndsAt: room.guessEndsAt,
    mrWhiteGuesserId: room.mrWhiteGuesserId,
    you: viewerId,
  };
}

export function broadcastRoom(io, room) {
  for (const playerId of room.players.keys()) {
    io.to(playerId).emit("room:state", sanitizeForPlayer(room, playerId));
  }
}

export function setConnected(code, id, connected) {
  const room = getRoom(code);
  if (!room) return null;
  const p = room.players.get(id);
  if (p) p.connected = connected;
  return room;
}
