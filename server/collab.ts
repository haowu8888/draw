import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocketServer, WebSocket } from "ws";
import { auth } from "./auth";
import { boardEvents, canEdit, getBoard, mergeElements, resolveRole, setPageAppState, type Role, type SceneElement } from "./boards";

interface Client {
  ws: WebSocket;
  id: string;
  boardId: string;
  userId: string | null;
  name: string;
  token: string | null;
  role: Role;
  pageId: string | null;
  color: string;
}

const COLORS = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899"];
const rooms = new Map<string, Set<Client>>();
const wss = new WebSocketServer({ noServer: true, maxPayload: 32 * 1024 * 1024 });
let seq = 0;

function send(c: Client, msg: unknown) {
  if (c.ws.readyState === WebSocket.OPEN) c.ws.send(JSON.stringify(msg));
}

function broadcast(boardId: string, msg: unknown, except?: Client) {
  for (const c of rooms.get(boardId) ?? []) if (c !== except) send(c, msg);
}

function presence(boardId: string) {
  const peers = [...(rooms.get(boardId) ?? [])].map((c) => ({ clientId: c.id, userId: c.userId, name: c.name, color: c.color, pageId: c.pageId, role: c.role }));
  broadcast(boardId, { type: "presence", peers });
}

boardEvents.on("message", (boardId: string, msg: Record<string, unknown>) => {
  const room = rooms.get(boardId);
  if (!room) return;
  if (msg.type === "share" || msg.type === "deleted") {
    // Re-check every link-share connection after sharing changes.
    const b = getBoard(boardId);
    for (const c of [...room]) {
      const role = b ? resolveRole(b, c.userId, c.token) : null;
      if (!role) {
        send(c, { type: msg.type === "deleted" ? "deleted" : "revoked" });
        c.ws.close(4403, "revoked");
      } else if (role !== c.role) {
        c.role = role;
        send(c, { type: "role", role });
      }
    }
  }
  broadcast(boardId, msg);
});

export function handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer) {
  const url = new URL(req.url || "/", "http://localhost");
  const boardId = url.searchParams.get("boardId") || "";
  const token = url.searchParams.get("token");
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) if (typeof v === "string") headers.set(k, v);
  auth.api
    .getSession({ headers })
    .then((session) => {
      const board = getBoard(boardId);
      const role = board ? resolveRole(board, session?.user.id, token) : null;
      if (!board || !role) {
        socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
        socket.destroy();
        return;
      }
      wss.handleUpgrade(req, socket, head, (ws) => {
        const client: Client = {
          ws,
          id: `c${++seq}`,
          boardId,
          userId: session?.user.id ?? null,
          name: session?.user.name ?? "访客",
          token,
          role,
          pageId: null,
          color: COLORS[seq % COLORS.length],
        };
        let room = rooms.get(boardId);
        if (!room) rooms.set(boardId, (room = new Set()));
        room.add(client);
        send(client, { type: "hello", clientId: client.id, role, color: client.color });
        presence(boardId);
        ws.on("message", (raw) => onMessage(client, raw.toString()));
        ws.on("close", () => {
          room!.delete(client);
          if (!room!.size) rooms.delete(boardId);
          else {
            broadcast(boardId, { type: "leave", clientId: client.id });
            presence(boardId);
          }
        });
      });
    })
    .catch(() => socket.destroy());
}

function onMessage(c: Client, raw: string) {
  let msg: { type: string; [k: string]: unknown };
  try {
    msg = JSON.parse(raw);
  } catch {
    return;
  }
  switch (msg.type) {
    case "ping":
    case "sync":
      send(c, { type: "pong", t: Date.now() });
      break;
    case "page":
      c.pageId = (msg.pageId as string) ?? null;
      presence(c.boardId);
      break;
    case "update": {
      if (!canEdit(c.role)) return send(c, { type: "error", message: "当前画布为只读，不能修改" });
      const accepted = mergeElements(msg.pageId as string, (msg.elements as SceneElement[]) ?? [], c.userId);
      if (accepted.length) broadcast(c.boardId, { type: "update", pageId: msg.pageId, elements: accepted, from: c.id }, c);
      send(c, { type: "ack", seq: msg.seq });
      break;
    }
    case "appState":
      if (!canEdit(c.role)) return;
      setPageAppState(msg.pageId as string, msg.appState as Record<string, unknown>);
      broadcast(c.boardId, { type: "appState", pageId: msg.pageId, appState: msg.appState }, c);
      break;
    case "pointer":
      broadcast(c.boardId, { type: "pointer", clientId: c.id, name: c.name, color: c.color, pageId: msg.pageId, pointer: msg.pointer, button: msg.button, selectedElementIds: msg.selectedElementIds }, c);
      break;
    case "files":
      broadcast(c.boardId, { type: "files", ids: msg.ids }, c);
      break;
  }
}

/** Pushes element changes made outside a websocket (e.g. the open API) to connected editors. */
export function pushElements(boardId: string, pageId: string, elements: SceneElement[]) {
  broadcast(boardId, { type: "update", pageId, elements, from: "api" });
}
