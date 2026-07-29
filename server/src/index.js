import express from "express";
import http from "http";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { Server } from "socket.io";
import {
  initRooms,
  createRoom,
  joinRoom,
  removePlayer,
  startGame,
  submitClue,
  submitVote,
  submitMrWhiteGuess,
  continueToNextRound,
  resetToLobby,
  updateSettings,
  getRoom,
  broadcastRoom,
  setConnected,
} from "./rooms.js";
import { getCategories } from "./words.js";

const PORT = process.env.PORT || 4000;

// CLIENT_ORIGIN can be a comma-separated list ("https://a.com,https://b.com")
// for locking this down to specific origins once you know your deployed
// URL(s). Left unset, we reflect whatever origin made the request — safe
// here because this app has no cookies/auth, and it means the single-service
// deploy (server serves the built client from its own origin, see below)
// just works without any extra config on first deploy.
const rawOrigins = process.env.CLIENT_ORIGIN;
const corsOrigin = rawOrigins ? rawOrigins.split(",").map((o) => o.trim()) : true;

const app = express();
app.use(cors({ origin: corsOrigin }));
app.get("/health", (_req, res) => res.json({ ok: true }));
app.get("/categories", (_req, res) => res.json(getCategories()));

// Production deploys run as a single service: this serves the built React
// app (client/dist, produced by `npm run build` in client/) from the same
// Express server that runs Socket.IO, so there's one URL and no CORS to
// worry about. In local dev this folder won't exist yet (you run the Vite
// dev server separately on :5173) — express.static just no-ops if it's
// missing, it won't crash the server.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_DIST = path.join(__dirname, "../../client/dist");
app.use(express.static(CLIENT_DIST));

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: corsOrigin, methods: ["GET", "POST"] },
});

// Lets rooms.js broadcast state on its own when a server-side timer fires
// (e.g. a clue/vote/guess timeout), not just in response to a socket event.
initRooms(io);

// Track which room each socket is in so we can clean up on disconnect.
const socketRoom = new Map();

io.on("connection", (socket) => {
  socket.on("room:create", ({ name }, cb) => {
    const cleanName = (name || "").trim().slice(0, 20) || "Player";
    const room = createRoom(socket.id, cleanName);
    socket.join(room.code);
    socketRoom.set(socket.id, room.code);
    cb?.({ ok: true, code: room.code });
    broadcastRoom(io, room);
  });

  socket.on("room:join", ({ code, name }, cb) => {
    const cleanName = (name || "").trim().slice(0, 20) || "Player";
    const { room, error } = joinRoom(code, socket.id, cleanName);
    if (error) return cb?.({ ok: false, error });
    socket.join(room.code);
    socketRoom.set(socket.id, room.code);
    cb?.({ ok: true, code: room.code });
    broadcastRoom(io, room);
  });

  socket.on("room:updateSettings", (settings = {}) => {
    const code = socketRoom.get(socket.id);
    if (!code) return;
    const { room, error } = updateSettings(code, socket.id, settings);
    if (error) return socket.emit("room:error", error);
    broadcastRoom(io, room);
  });

  socket.on("game:start", ({ category } = {}) => {
    const code = socketRoom.get(socket.id);
    if (!code) return;
    const { room, error } = startGame(code, socket.id, category);
    if (error) return socket.emit("room:error", error);
    broadcastRoom(io, room);
  });

  socket.on("game:submitClue", ({ clue } = {}) => {
    const code = socketRoom.get(socket.id);
    if (!code) return;
    const { room, error } = submitClue(code, socket.id, clue);
    if (error) return socket.emit("room:error", error);
    broadcastRoom(io, room);
  });

  socket.on("game:submitVote", ({ votedId } = {}) => {
    const code = socketRoom.get(socket.id);
    if (!code) return;
    const { room, error } = submitVote(code, socket.id, votedId);
    if (error) return socket.emit("room:error", error);
    broadcastRoom(io, room);
  });

  socket.on("game:mrWhiteGuess", ({ guess } = {}) => {
    const code = socketRoom.get(socket.id);
    if (!code) return;
    const { room, error } = submitMrWhiteGuess(code, socket.id, guess);
    if (error) return socket.emit("room:error", error);
    broadcastRoom(io, room);
  });

  socket.on("game:continue", () => {
    const code = socketRoom.get(socket.id);
    if (!code) return;
    const { room, error } = continueToNextRound(code, socket.id);
    if (error) return socket.emit("room:error", error);
    broadcastRoom(io, room);
  });

  socket.on("game:playAgain", () => {
    const code = socketRoom.get(socket.id);
    if (!code) return;
    const { room, error } = resetToLobby(code, socket.id);
    if (error) return socket.emit("room:error", error);
    broadcastRoom(io, room);
  });

  socket.on("room:leave", () => {
    const code = socketRoom.get(socket.id);
    if (!code) return;
    socket.leave(code);
    socketRoom.delete(socket.id);
    const room = removePlayer(code, socket.id);
    if (room) broadcastRoom(io, room);
  });

  socket.on("disconnect", () => {
    const code = socketRoom.get(socket.id);
    if (!code) return;
    socketRoom.delete(socket.id);
    // Give reconnecting players a moment before removing them entirely.
    setConnected(code, socket.id, false);
    const room = getRoom(code);
    if (room) broadcastRoom(io, room);
    setTimeout(() => {
      const stillThere = getRoom(code)?.players.get(socket.id);
      if (stillThere && !stillThere.connected) {
        const r = removePlayer(code, socket.id);
        if (r) broadcastRoom(io, r);
      }
    }, 15000);
  });
});

server.listen(PORT, () => {
  console.log(`Undercover server listening on http://localhost:${PORT}`);
});
