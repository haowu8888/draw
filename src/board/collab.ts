/** Realtime connection to /api/collab: element sync, presence and board events. */

export type CollabStatus = "connecting" | "online" | "offline";

export type Peer = { clientId: string; userId: string | null; name: string; color: string; pageId: string | null; role: string };

export type ServerMessage =
  | { type: "hello"; clientId: string; role: string; color: string }
  | { type: "update"; pageId: string; elements: SyncElement[]; from: string }
  | { type: "appState"; pageId: string; appState: Record<string, unknown> }
  | { type: "presence"; peers: Peer[] }
  | { type: "pointer"; clientId: string; name: string; color: string; pageId: string; pointer: { x: number; y: number; tool: "pointer" | "laser" }; button: "up" | "down"; selectedElementIds?: Record<string, true> }
  | { type: "leave"; clientId: string }
  | { type: "files"; ids: string[] }
  | { type: "ack"; seq: number }
  | { type: "pong" }
  | { type: "reload" | "pages" | "comments" | "versions" | "deleted" | "revoked" }
  | { type: "share"; visibility: string; shareRole: string; tokenChanged: boolean }
  | { type: "role"; role: string }
  | { type: "meta"; title: string }
  | { type: "error"; message: string };

export type SyncElement = { id: string; version: number; versionNonce: number; isDeleted?: boolean; [k: string]: unknown };

const PING_INTERVAL = 15_000;
const STALE_AFTER = 40_000;

export class CollabClient {
  ws: WebSocket | null = null;
  status: CollabStatus = "connecting";
  clientId: string | null = null;
  private seq = 0;
  private pendingAcks = new Set<number>();
  private lastMessageAt = Date.now();
  private retry = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private closed = false;

  constructor(
    private boardId: string,
    private token: string | null,
    private handlers: {
      onMessage: (msg: ServerMessage) => void;
      onStatus: (s: CollabStatus) => void;
      onPending: (pending: boolean) => void;
      onReconnect: () => void;
    },
  ) {
    this.connect();
    this.timer = setInterval(() => this.heartbeat(), PING_INTERVAL);
    document.addEventListener("visibilitychange", this.onVisibility);
  }

  private onVisibility = () => {
    if (document.visibilityState === "visible") this.heartbeat();
  };

  private setStatus(s: CollabStatus) {
    this.status = s;
    this.handlers.onStatus(s);
  }

  private connect() {
    this.reconnectTimer = null;
    if (this.closed) return;
    const params = new URLSearchParams({ boardId: this.boardId });
    if (this.token) params.set("token", this.token);
    const ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/collab?${params}`);
    this.ws = ws;
    this.setStatus("connecting");
    ws.onopen = () => {
      const reconnect = this.retry > 0;
      this.retry = 0;
      this.lastMessageAt = Date.now();
      this.setStatus("online");
      if (reconnect) this.handlers.onReconnect();
    };
    ws.onmessage = (e) => {
      this.lastMessageAt = Date.now();
      const msg = JSON.parse(e.data) as ServerMessage;
      if (msg.type === "hello") this.clientId = msg.clientId;
      if (msg.type === "ack") {
        this.pendingAcks.delete(msg.seq);
        if (!this.pendingAcks.size) this.handlers.onPending(false);
      }
      this.handlers.onMessage(msg);
    };
    ws.onclose = (e) => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.pendingAcks.clear();
      this.setStatus("offline");
      if (this.closed || e.code === 4403) return;
      const delay = Math.min(30_000, 1000 * 2 ** this.retry++);
      this.reconnectTimer = setTimeout(() => this.connect(), delay);
    };
  }

  private heartbeat() {
    const ws = this.ws;
    if (ws?.readyState === WebSocket.OPEN) {
      if (Date.now() - this.lastMessageAt > STALE_AFTER) ws.close();
      else ws.send(JSON.stringify({ type: "ping" }));
    } else if (!ws && !this.closed && !this.reconnectTimer) {
      this.connect();
    }
  }

  get online() {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  send(msg: Record<string, unknown>) {
    if (this.ws?.readyState !== WebSocket.OPEN) return false;
    this.ws.send(JSON.stringify(msg));
    return true;
  }

  sendElements(pageId: string, elements: SyncElement[]) {
    if (!elements.length) return true;
    const seq = ++this.seq;
    if (!this.send({ type: "update", pageId, elements, seq })) return false;
    this.pendingAcks.add(seq);
    this.handlers.onPending(true);
    return true;
  }

  close() {
    this.closed = true;
    if (this.timer) clearInterval(this.timer);
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    document.removeEventListener("visibilitychange", this.onVisibility);
    this.ws?.close();
  }
}
