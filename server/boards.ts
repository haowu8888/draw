import { EventEmitter } from "node:events";
import fs from "node:fs";
import path from "node:path";
import { nanoid } from "nanoid";
import { db, json, newId, now, UPLOAD_DIR } from "./db";

export type Role = "owner" | "edit" | "view";
export type SceneElement = { id: string; version: number; versionNonce: number; isDeleted?: boolean; [k: string]: unknown };

export interface BoardRow {
  id: string;
  creatorId: string;
  folderId: string | null;
  title: string;
  thumbnailVersion: number;
  visibility: "private" | "link";
  shareToken: string | null;
  shareRole: "view" | "edit";
  version: number;
  currentVersionId: string | null;
  lastEditedBy: string | null;
  lastEditedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PageRow {
  id: string;
  boardId: string;
  name: string;
  sort: number;
  elements: string;
  appState: string;
  updatedAt: string;
}

/** Board-level events consumed by the realtime hub. */
export const boardEvents = new EventEmitter();
boardEvents.setMaxListeners(0);

export function emitBoard(boardId: string, msg: Record<string, unknown>, origin?: unknown) {
  boardEvents.emit("message", boardId, msg, origin);
}

export const getBoard = (id: string) => db.prepare("SELECT * FROM board WHERE id = ?").get(id) as BoardRow | undefined;

/** Resolves the caller's role on a board: owner, link-share role, or none. */
export function resolveRole(board: BoardRow, userId: string | null | undefined, token?: string | null): Role | null {
  if (userId && board.creatorId === userId) return "owner";
  if (board.deletedAt) return null;
  if (board.visibility === "link" && board.shareToken && token && token === board.shareToken) {
    if (board.shareRole === "edit" && userId) return "edit";
    return "view";
  }
  return null;
}

export const canEdit = (role: Role | null) => role === "owner" || role === "edit";

export function listPages(boardId: string) {
  return db.prepare("SELECT * FROM board_page WHERE boardId = ? ORDER BY sort, rowid").all(boardId) as PageRow[];
}

export function createBoard(userId: string, title = "未命名画布", folderId: string | null = null) {
  const id = newId();
  const t = now();
  db.prepare(
    "INSERT INTO board(id, creatorId, folderId, title, createdAt, updatedAt, lastEditedBy, lastEditedAt) VALUES(?,?,?,?,?,?,?,?)",
  ).run(id, userId, folderId, title, t, t, userId, t);
  db.prepare("INSERT INTO board_page(id, boardId, name, sort, updatedAt) VALUES(?,?,?,?,?)").run(newId(), id, "页面 1", 0, t);
  return getBoard(id)!;
}

// ---------- scene cache & merge ----------

interface CachedPage {
  boardId: string;
  elements: Map<string, SceneElement>;
  appState: Record<string, unknown>;
  dirty: boolean;
}

const pageCache = new Map<string, CachedPage>();
const dirtyBoards = new Map<string, string>(); // boardId -> editor userId

function loadPage(pageId: string): CachedPage | null {
  let cached = pageCache.get(pageId);
  if (cached) return cached;
  const row = db.prepare("SELECT * FROM board_page WHERE id = ?").get(pageId) as PageRow | undefined;
  if (!row) return null;
  const list = json<SceneElement[]>(row.elements, []);
  cached = { boardId: row.boardId, elements: new Map(list.map((e) => [e.id, e])), appState: json(row.appState, {}), dirty: false };
  pageCache.set(pageId, cached);
  return cached;
}

export function pageElements(pageId: string) {
  const p = loadPage(pageId);
  return p ? [...p.elements.values()] : [];
}

/** Merges incoming elements by version (same rule as Excalidraw's reconciliation). Returns accepted elements. */
export function mergeElements(pageId: string, incoming: SceneElement[], userId: string | null) {
  const page = loadPage(pageId);
  if (!page) return [];
  const accepted: SceneElement[] = [];
  for (const el of incoming) {
    if (!el || typeof el.id !== "string") continue;
    const cur = page.elements.get(el.id);
    if (!cur || el.version > cur.version || (el.version === cur.version && el.versionNonce < cur.versionNonce)) {
      page.elements.set(el.id, el);
      accepted.push(el);
    }
  }
  if (accepted.length) {
    page.dirty = true;
    dirtyBoards.set(page.boardId, userId ?? dirtyBoards.get(page.boardId) ?? "");
    scheduleFlush();
  }
  return accepted;
}

/** Replaces a page's whole scene (used by restore / API clear). */
export function replacePage(pageId: string, elements: SceneElement[], userId: string | null) {
  const page = loadPage(pageId);
  if (!page) return;
  page.elements = new Map(elements.map((e) => [e.id, e]));
  page.dirty = true;
  dirtyBoards.set(page.boardId, userId ?? "");
  scheduleFlush();
}

export function setPageAppState(pageId: string, appState: Record<string, unknown>) {
  const page = loadPage(pageId);
  if (!page) return;
  page.appState = { ...page.appState, ...appState };
  page.dirty = true;
  scheduleFlush();
}

let flushTimer: NodeJS.Timeout | null = null;
function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flushAll();
  }, 800);
}

const AUTO_VERSION_INTERVAL = 10 * 60 * 1000;
const ACTIVITY_WINDOW = 10 * 60 * 1000;

export function flushAll() {
  const t = now();
  const save = db.prepare("UPDATE board_page SET elements = ?, appState = ?, updatedAt = ? WHERE id = ?");
  db.transaction(() => {
    for (const [pageId, page] of pageCache) {
      if (!page.dirty) continue;
      // Drop tombstones older than they need to be: keep deleted elements so peers converge, but cap their number.
      const list = [...page.elements.values()];
      save.run(JSON.stringify(list), JSON.stringify(page.appState), t, pageId);
      page.dirty = false;
    }
    for (const [boardId, userId] of dirtyBoards) {
      db.prepare("UPDATE board SET version = version + 1, lastEditedAt = ?, lastEditedBy = COALESCE(NULLIF(?, ''), lastEditedBy), updatedAt = ? WHERE id = ?").run(
        t,
        userId,
        t,
        boardId,
      );
      if (userId) recordActivity(boardId, userId, "edit");
      maybeAutoVersion(boardId, userId || null);
    }
    dirtyBoards.clear();
  })();
  // Evict cold pages so memory stays bounded.
  if (pageCache.size > 500) for (const [id, p] of pageCache) if (!p.dirty) pageCache.delete(id);
}

export function evictBoard(boardId: string) {
  flushAll();
  for (const [id, p] of pageCache) if (p.boardId === boardId) pageCache.delete(id);
}

export function recordActivity(boardId: string, userId: string, kind: "edit" | "comment" | "upload" | "create") {
  if (kind === "edit") {
    const last = db
      .prepare("SELECT createdAt FROM board_activity WHERE boardId = ? AND userId = ? AND kind = 'edit' ORDER BY createdAt DESC LIMIT 1")
      .get(boardId, userId) as { createdAt: string } | undefined;
    if (last && Date.now() - Date.parse(last.createdAt) < ACTIVITY_WINDOW) return;
  }
  db.prepare("INSERT INTO board_activity(id, boardId, userId, kind, createdAt) VALUES(?,?,?,?,?)").run(newId(), boardId, userId, kind, now());
}

// ---------- versions ----------

export function snapshotBoard(boardId: string) {
  flushAll();
  return listPages(boardId).map((p) => ({
    id: p.id,
    name: p.name,
    sort: p.sort,
    elements: json<SceneElement[]>(p.elements, []).filter((e) => !e.isDeleted),
    appState: json(p.appState, {}),
  }));
}

export type Snapshot = ReturnType<typeof snapshotBoard>;

export function createVersion(boardId: string, name: string, userId: string | null, auto = false) {
  const id = newId();
  db.prepare("INSERT INTO board_version(id, boardId, name, auto, snapshot, createdBy, createdAt) VALUES(?,?,?,?,?,?,?)").run(
    id,
    boardId,
    name,
    auto ? 1 : 0,
    JSON.stringify(snapshotBoard(boardId)),
    userId,
    now(),
  );
  db.prepare("UPDATE board SET currentVersionId = ? WHERE id = ?").run(id, boardId);
  return id;
}

function maybeAutoVersion(boardId: string, userId: string | null) {
  const last = db.prepare("SELECT createdAt FROM board_version WHERE boardId = ? AND auto = 1 ORDER BY createdAt DESC LIMIT 1").get(boardId) as
    | { createdAt: string }
    | undefined;
  if (last && Date.now() - Date.parse(last.createdAt) < AUTO_VERSION_INTERVAL) return;
  const { c } = db.prepare("SELECT count(*) c FROM board_version WHERE boardId = ? AND auto = 1").get(boardId) as { c: number };
  const id = newId();
  db.prepare("INSERT INTO board_version(id, boardId, name, auto, snapshot, createdBy, createdAt) VALUES(?,?,?,?,?,?,?)").run(
    id,
    boardId,
    `自动保存 v${c + 1}`,
    1,
    JSON.stringify(
      listPages(boardId).map((p) => ({
        id: p.id,
        name: p.name,
        sort: p.sort,
        elements: json<SceneElement[]>(p.elements, []).filter((e) => !e.isDeleted),
        appState: json(p.appState, {}),
      })),
    ),
    userId,
    now(),
  );
  db.prepare("UPDATE board SET currentVersionId = ? WHERE id = ?").run(id, boardId);
}

/** Replaces all pages of a board with a snapshot, bumping element versions so connected clients accept them. */
export function applySnapshot(boardId: string, snapshot: Snapshot, userId: string | null) {
  flushAll();
  const existing = listPages(boardId);
  const t = now();
  db.transaction(() => {
    const keep = new Set(snapshot.map((p) => p.id));
    for (const p of existing) {
      if (!keep.has(p.id)) db.prepare("DELETE FROM board_page WHERE id = ?").run(p.id);
    }
    for (const p of snapshot) {
      const prev = existing.find((e) => e.id === p.id);
      const prevEls = prev ? json<SceneElement[]>(prev.elements, []) : [];
      const maxVersion = new Map(prevEls.map((e) => [e.id, e.version]));
      const restored = p.elements.map((e) => ({ ...e, version: Math.max(e.version, maxVersion.get(e.id) ?? 0) + 1, versionNonce: Math.floor(Math.random() * 2 ** 31) }));
      const ids = new Set(restored.map((e) => e.id));
      const tombstones = prevEls
        .filter((e) => !ids.has(e.id))
        .map((e) => ({ ...e, isDeleted: true, version: e.version + 1, versionNonce: Math.floor(Math.random() * 2 ** 31) }));
      const all = [...restored, ...tombstones];
      if (prev) {
        db.prepare("UPDATE board_page SET name = ?, sort = ?, elements = ?, appState = ?, updatedAt = ? WHERE id = ?").run(
          p.name,
          p.sort,
          JSON.stringify(all),
          JSON.stringify(p.appState ?? {}),
          t,
          p.id,
        );
      } else {
        db.prepare("INSERT INTO board_page(id, boardId, name, sort, elements, appState, updatedAt) VALUES(?,?,?,?,?,?,?)").run(
          p.id,
          boardId,
          p.name,
          p.sort,
          JSON.stringify(all),
          JSON.stringify(p.appState ?? {}),
          t,
        );
      }
    }
    db.prepare("UPDATE board SET version = version + 1, lastEditedAt = ?, lastEditedBy = COALESCE(?, lastEditedBy), updatedAt = ? WHERE id = ?").run(t, userId, t, boardId);
  })();
  for (const [id, p] of pageCache) if (p.boardId === boardId) pageCache.delete(id);
  emitBoard(boardId, { type: "reload" });
}

// ---------- files & covers ----------

export function saveFile(boardId: string, file: { id: string; mimeType: string; dataURL: string }) {
  db.prepare("INSERT OR IGNORE INTO board_file(id, boardId, mimeType, dataURL, createdAt) VALUES(?,?,?,?,?)").run(
    file.id,
    boardId,
    file.mimeType,
    file.dataURL,
    now(),
  );
}

export function getFiles(boardId: string, ids?: string[]) {
  const rows = db.prepare("SELECT id, mimeType, dataURL, createdAt FROM board_file WHERE boardId = ?").all(boardId) as {
    id: string;
    mimeType: string;
    dataURL: string;
    createdAt: string;
  }[];
  return ids ? rows.filter((r) => ids.includes(r.id)) : rows;
}

export const coverPath = (boardId: string) => path.join(UPLOAD_DIR, "covers", `${boardId}.webp`);

export function saveCover(boardId: string, data: Buffer) {
  fs.mkdirSync(path.dirname(coverPath(boardId)), { recursive: true });
  fs.writeFileSync(coverPath(boardId), data);
  db.prepare("UPDATE board SET thumbnailVersion = thumbnailVersion + 1 WHERE id = ?").run(boardId);
}

export function boardThumbnail(b: Pick<BoardRow, "id" | "thumbnailVersion">) {
  return b.thumbnailVersion ? `/api/boards/${b.id}/cover.webp?v=${b.thumbnailVersion}` : null;
}

export function duplicateBoard(boardId: string, userId: string) {
  const src = getBoard(boardId)!;
  const copy = createBoard(userId, `${src.title} 副本`, src.folderId);
  const snapshot = snapshotBoard(boardId);
  db.prepare("DELETE FROM board_page WHERE boardId = ?").run(copy.id);
  for (const p of snapshot) {
    db.prepare("INSERT INTO board_page(id, boardId, name, sort, elements, appState, updatedAt) VALUES(?,?,?,?,?,?,?)").run(
      newId(),
      copy.id,
      p.name,
      p.sort,
      JSON.stringify(p.elements),
      JSON.stringify(p.appState),
      now(),
    );
  }
  db.prepare("INSERT INTO board_file(id, boardId, mimeType, dataURL, createdAt) SELECT id, ?, mimeType, dataURL, createdAt FROM board_file WHERE boardId = ?").run(
    copy.id,
    boardId,
  );
  if (fs.existsSync(coverPath(boardId))) saveCover(copy.id, fs.readFileSync(coverPath(boardId)));
  return copy;
}

export function destroyBoard(boardId: string) {
  evictBoard(boardId);
  db.prepare("DELETE FROM board WHERE id = ?").run(boardId);
  db.prepare("DELETE FROM board_activity WHERE boardId = ?").run(boardId);
  fs.rmSync(coverPath(boardId), { force: true });
  emitBoard(boardId, { type: "deleted" });
}

export const newShareToken = () => nanoid(24);

/** Removes everything a user owns (boards, folders, keys, comments); orders are kept but detached. */
export function cleanupUserData(userId: string) {
  const boards = db.prepare("SELECT id FROM board WHERE creatorId = ?").all(userId) as { id: string }[];
  boards.forEach((b) => destroyBoard(b.id));
  db.transaction(() => {
    db.prepare("DELETE FROM folder WHERE userId = ?").run(userId);
    db.prepare("DELETE FROM api_key WHERE userId = ?").run(userId);
    db.prepare("DELETE FROM comment WHERE userId = ?").run(userId);
    db.prepare("UPDATE orders SET userId = NULL WHERE userId = ?").run(userId);
  })();
}
