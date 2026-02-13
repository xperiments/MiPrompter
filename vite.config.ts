import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { WebSocketServer } from "ws";
import type { ViteDevServer } from "vite";

function createSignalingServer(server: ViteDevServer) {
  // roomId -> Set(ws)
  const rooms = new Map<string, Set<any>>();
  // cached room state (from standalone mock behavior)
  const roomStates = new Map<string, any>();

  function safeJsonParse(str: string) {
    try {
      return JSON.parse(str);
    } catch {
      return null;
    }
  }

  function mergeRoomState(roomId: string | undefined, data: any) {
    if (!roomId) return;
    const prev = roomStates.get(roomId) || {
      payload: {},
      playing: false,
      mic: false,
      wordIndex: 0,
    };
    const next = { ...prev } as any;

    if (data.type === "presenter-load-doc" && data.doc) {
      next.payload = { ...(next.payload || {}), doc: data.doc };
      next.payload.docId = data.doc?.id || next.payload.docId;
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

  function joinRoom(ws: any, room: string) {
    ws._room = room;
    if (!rooms.has(room)) rooms.set(room, new Set());
    rooms.get(room)!.add(ws);
    // eslint-disable-next-line no-console
    console.log(`[ws] join room="${room}" clients=${rooms.get(room)!.size}`);
  }

  function leaveRoom(ws: any) {
    const room = ws._room;
    if (!room) return;
    const set = rooms.get(room);
    if (set) {
      set.delete(ws);
      if (set.size === 0)
        rooms.delete(room); // eslint-disable-next-line no-console
      else console.log(`[ws] leave room="${room}" clients=${set.size}`);
    }
    ws._room = null;
  }

  function broadcastToRoom(room: string, senderWs: any, msgObj: any) {
    const set = rooms.get(room);
    if (!set) return;
    const recipients = Array.from(set).filter(
      (c) => c !== senderWs && c.readyState === 1,
    ).length;
    // eslint-disable-next-line no-console
    console.log(
      `[ws] relay type=${msgObj.type} room="${room}" -> ${recipients} recipients`,
    );
    const data = JSON.stringify(msgObj);
    for (const client of set) {
      if (client !== senderWs && client.readyState === 1) {
        client.send(data);
      }
    }
  }

  // add simple status endpoint to vite's dev server
  server.middlewares.use((req, res, next) => {
    if (req.url === "/__status") {
      const roomsSummary: Record<string, number> = {};
      for (const [k, set] of rooms.entries()) roomsSummary[k] = set.size;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ pid: process.pid, rooms: roomsSummary }));
      return;
    }
    next();
  });

  // attach WebSocketServer to the underlying HTTP server
  const wss = new WebSocketServer({ noServer: true });
  server.httpServer?.on("upgrade", (req, socket, head) => {
    if (req.url === "/ws" || req.url === "/socket") {
      wss.handleUpgrade(req, socket as any, head, (ws) =>
        wss.emit("connection", ws, req),
      );
    }
  });

  wss.on("connection", (ws) => {
    // eslint-disable-next-line no-console
    console.log("[ws] connection");

    ws.on("message", (buf: Buffer) => {
      const raw = buf.toString("utf8");
      const msg = safeJsonParse(raw);
      if (!msg || !msg.type) {
        // eslint-disable-next-line no-console
        console.log("[ws] invalid-msg", raw.slice(0, 200));
        return;
      }

      // eslint-disable-next-line no-console
      console.log("[ws] rx", msg.type, msg.room || ws._room || "—");

      // ---- join handling (send cached state to late joiners) ----
      if (msg.type === "join") {
        if (typeof msg.room !== "string") return;
        leaveRoom(ws);
        joinRoom(ws, msg.room);

        // inform others someone joined
        broadcastToRoom(msg.room, ws, { type: "peer-joined" });

        // if we have cached state for the room, send it to the joining client
        const cached = roomStates.get(msg.room);
        if (cached)
          ws.send(
            JSON.stringify({ type: "state", room: msg.room, data: cached }),
          );
        return;
      }

      // pairing messages (pair.html / pairing POC)
      if (
        msg.type === "pair-request" ||
        msg.type === "pair-ack" ||
        msg.type === "presenter-open" ||
        msg.type === "presenter-share-invite"
      ) {
        // Broadcast pairing-related messages to all connected clients so pair.html and the app can exchange info.
        // pair-request: phone -> app
        // pair-ack: app -> phone
        // presenter-open: app -> phone (contains url + optional `to` id)
        // presenter-share-invite: app -> phone (contains room id for screen-share)
        // eslint-disable-next-line no-console
        console.log(
          "[ws] pairing relay",
          msg.type,
          msg.id || msg.to || msg.room || "—",
        );
        const payload = JSON.stringify(msg);
        for (const client of wss.clients) {
          if (client !== ws && client.readyState === 1) client.send(payload);
        }
        return;
      }

      // ---- support for cached room state + signaling messages (standalone mock parity) ----
      if (msg.type === "get-state" && typeof msg.room === "string") {
        const cached = roomStates.get(msg.room) || null;

        ws.send(
          JSON.stringify({ type: "state", room: msg.room, data: cached }),
        );

        return;
      }

      if (msg.type === "signal" && typeof msg.room === "string") {
        if (ws._room !== msg.room) {
          ws.send(JSON.stringify({ type: "error", error: "Join room first" }));
          return;
        }
        // merge into cached room state and broadcast as `signal` (payload in `data`)

        mergeRoomState(msg.room, msg.data);

        broadcastToRoom(msg.room, ws, { type: "signal", data: msg.data });
        return;
      }

      const room = ws._room;
      if (!room) return;

      if (
        msg.type === "offer" ||
        msg.type === "answer" ||
        msg.type === "ice" ||
        msg.type === "target"
      ) {
        broadcastToRoom(room, ws, msg);
        return;
      }

      // eslint-disable-next-line no-console
      console.log("[ws] unhandled msg type:", msg.type);
    });

    ws.on("close", () => {
      const room = ws._room;
      leaveRoom(ws);
      // eslint-disable-next-line no-console
      console.log("[ws] close");
      if (room) broadcastToRoom(room, ws, { type: "peer-left" });
    });
  });
}

// only enable the in-process dev signaling server when a standalone mock WS server
// is NOT being used (MOCK_WS_PORT). This avoids upgrade conflicts on `/ws`.
const devSignalingPlugin = !process.env.MOCK_WS_PORT
  ? {
      name: "dev-signaling-server",
      configureServer(server: ViteDevServer) {
        createSignalingServer(server);
      },
    }
  : undefined;

export default defineConfig({
  plugins: [react(), ...(devSignalingPlugin ? [devSignalingPlugin] : [])],
  server: {
    // accept external hosts (CodeSandbox, ngrok, etc.) and prefer PORT from env
    host: true,
    port: Number(process.env.PORT) || 5173,
    allowedHosts: true,
    // when the standalone mock WS server is started on a separate port, proxy `/ws` to it
    proxy: process.env.MOCK_WS_PORT
      ? {
          "/ws": {
            target: `http://localhost:${process.env.MOCK_WS_PORT}`,
            ws: true,
            changeOrigin: true,
          },
        }
      : undefined,
  },
});
