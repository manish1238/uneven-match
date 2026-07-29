import { io } from "socket.io-client";

// In dev, Vite serves the client on :5173 and the API/socket server runs
// separately on :4000 (see server/.env.example) — cross-origin, so we need
// an explicit URL there. In production this app is deployed as a single
// service: server/src/index.js serves the built client AND runs Socket.IO
// from the same origin, so by default (no VITE_SERVER_URL set) we just
// connect to whatever origin served this page.
export const SERVER_URL =
  import.meta.env.VITE_SERVER_URL || (import.meta.env.DEV ? "http://localhost:4000" : "");

// autoConnect: false — App.jsx connects once the player enters a name so we
// don't hold sockets open for people who never join a room.
export const socket = io(SERVER_URL || undefined, { autoConnect: false });
