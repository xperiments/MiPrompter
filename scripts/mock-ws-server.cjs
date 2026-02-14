const http = require("http");
const { WebSocketServer } = require("ws");

const server = http.createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("ok");
    return;
  }
  res.writeHead(200, { "content-type": "text/plain" });
  res.end("WebRTC signaling server running A.\nTry WS at /ws");
});

const wss = new WebSocketServer({ server, path: "/ws" });

// Rooms: roomId -> Set(ws)
const rooms = new Map();
// Cached room state so late joiners can be seeded
const roomStates = new Map();

function mergeRoomState(roomId, data) {
  if (!roomId) return;
  const prev = roomStates.get(roomId) || {
    payload: {},
    playing: false,
    mic: false,
    wordIndex: 0,
  };
  const next = { ...prev };

  if (data.type === "presenter-load-doc" && data.doc) {
    next.payload = { ...(next.payload || {}), doc: data.doc };
    next.payload.docId = data.doc?.id || next.payload.docId;
    next.currentChapterId = data.doc?.chapters?.[0]?.id || null;
    next.wordIndex = 0;
  } else if (data.type === "presenter-goto-chapter") {
    next.currentChapterId = data.chapterId || null;
    // Word index reset to 0 (or peer will send actual word-index update later)
    next.wordIndex = 0;
  } else if (data.type === "set-params") {
    next.payload = { ...(next.payload || {}), ...data };
  } else if (data.type === "presenter-playing") {
    next.playing = Boolean(data.playing);
  } else if (data.type === "presenter-mic") {
    next.mic = Boolean(data.active);
  } else if (data.type === "presenter-word-index") {
    next.wordIndex = Number(data.index || 0);
  } else if (data.type === "appearance-update" || data.appearance) {
    next.payload = {
      ...(next.payload || {}),
      appearance: {
        ...(next.payload?.appearance || {}),
        ...(data.appearance || {}),
      },
    };
  }

  roomStates.set(roomId, next);
}

function joinRoom(ws, roomId) {
  if (!rooms.has(roomId)) rooms.set(roomId, new Set());
  rooms.get(roomId).add(ws);
  ws._roomId = roomId;
}

function leaveRoom(ws) {
  const roomId = ws._roomId;
  if (!roomId) return;
  const set = rooms.get(roomId);
  if (set) {
    set.delete(ws);
    if (set.size === 0) rooms.delete(roomId);
  }
  ws._roomId = null;
}

function broadcastToRoom(ws, msgObj) {
  const roomId = ws._roomId;
  if (!roomId) return;
  const set = rooms.get(roomId);
  if (!set) return;

  const payload = JSON.stringify(msgObj);
  for (const peer of set) {
    if (peer !== ws && peer.readyState === 1) peer.send(payload);
  }
}

wss.on("connection", (ws) => {
  ws.on("message", (buf) => {
    let msg;
    try {
      msg = JSON.parse(buf.toString());
    } catch {
      ws.send(JSON.stringify({ type: "error", error: "Invalid JSON" }));
      return;
    }

    if (msg.type === "join" && typeof msg.room === "string") {
      leaveRoom(ws);
      joinRoom(ws, msg.room);
      ws.send(JSON.stringify({ type: "joined", room: msg.room }));
      // send cached state to joining peer
      const cached = roomStates.get(msg.room);
      if (cached)
        ws.send(
          JSON.stringify({ type: "state", room: msg.room, data: cached }),
        );

      broadcastToRoom(ws, { type: "peer-joined" });
      return;
    }

    if (msg.type === "get-state" && typeof msg.room === "string") {
      const cached = roomStates.get(msg.room) || null;

      ws.send(JSON.stringify({ type: "state", room: msg.room, data: cached }));

      return;
    }

    if (msg.type === "signal" && typeof msg.room === "string") {
      if (ws._roomId !== msg.room) {
        ws.send(JSON.stringify({ type: "error", error: "Join room first" }));
        return;
      }
      // merge into cached room state

      mergeRoomState(msg.room, msg.data);

      broadcastToRoom(ws, { type: "signal", data: msg.data });
      return;
    }

    ws.send(JSON.stringify({ type: "error", error: "Unknown message type" }));
  });

  ws.on("close", () => {
    broadcastToRoom(ws, { type: "peer-left" });
    leaveRoom(ws);
  });
});

// Preferred default ports (allow override via PORT env). Avoid 5173 by default
const preferred = [];
if (process.env.PORT) preferred.push(Number(process.env.PORT));
preferred.push(3000, 5137);

function tryListen(ports) {
  const port = ports.shift();
  if (typeof port !== "number") {
    // fallback to ephemeral port
    server.listen(0);
    return;
  }

  server.once("error", (err) => {
    if (err && err.code === "EADDRINUSE") {
      console.warn(`Port ${port} in use — trying next port`);
      tryListen(ports);
    } else {
      console.error(err);
      process.exit(1);
    }
  });

  server.once("listening", () => {
    const addr = server.address();
    if (!addr) return console.log("Listening");
    if (typeof addr === "string") return console.log("Listening on", addr);
    const p = addr.port;
    console.log(
      `Listening on port ${p} — http://localhost${p}/  ws://localhost${p}/ws`,
    );
  });

  server.listen(port);
}

tryListen(preferred.slice());
