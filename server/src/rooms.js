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

  const tally = new Map();
  for (const votedId of room.votes.values()) {
    tally.set(votedId, (tally.get(votedId) || 0) + 1);
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
  if (leaders.length === 1) {
    const eliminated = room.players.get(leaders[0]);
    // Guard against voting for someone who disconnected before votes resolved.
    if (eliminated) {
      eliminatedId = leaders[0];
      eliminated.alive = false;
      eliminatedRole = eliminated.role;
    }
  }

  const resultBase = {
    round: room.round,
    tally: Object.fromEntries(tally),
    eliminatedId,
    eliminatedName: eliminatedId ? room.players.get(eliminatedId).name : null,
    eliminatedRole,
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
      word: p.id === viewerId || revealAll ? p.word : null,
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
