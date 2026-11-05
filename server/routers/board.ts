import { z } from "zod";
import { db, json, newId, now } from "../db";
import {
  applySnapshot,
  boardThumbnail,
  canEdit,
  createBoard,
  createVersion,
  destroyBoard,
  duplicateBoard,
  emitBoard,
  flushAll,
  getBoard,
  getFiles,
  listPages,
  newShareToken,
  pageElements,
  recordActivity,
  resolveRole,
  type BoardRow,
  type Snapshot,
} from "../boards";
import { adminProcedure, fail, protectedProcedure, publicProcedure, router } from "../trpc";

type UserLite = { id: string; name: string; image: string | null };

function userMap(ids: (string | null | undefined)[]) {
  const uniq = [...new Set(ids.filter(Boolean))] as string[];
  if (!uniq.length) return new Map<string, UserLite>();
  const rows = db.prepare(`SELECT id, name, image FROM user WHERE id IN (${uniq.map(() => "?").join(",")})`).all(...uniq) as UserLite[];
  return new Map(rows.map((u) => [u.id, u]));
}

export function presentBoards(rows: BoardRow[]) {
  const users = userMap(rows.flatMap((r) => [r.lastEditedBy, r.creatorId]));
  return rows.map((b) => ({
    ...b,
    thumbnail: boardThumbnail(b),
    lastEditor: b.lastEditedBy ? users.get(b.lastEditedBy) ?? null : null,
    creator: users.get(b.creatorId) ?? null,
  }));
}

function ownBoard(id: string, userId: string) {
  const b = getBoard(id);
  if (!b || b.creatorId !== userId) throw fail("NOT_FOUND", "画布不存在");
  return b;
}

/** Boards the user can edit (owner, or edit-shared). Used for page operations. */
function editableBoard(id: string, userId: string, token?: string | null) {
  const b = getBoard(id);
  if (!b) throw fail("NOT_FOUND", "画布不存在");
  const role = resolveRole(b, userId, token);
  if (!canEdit(role)) throw fail("FORBIDDEN", "当前画布为只读，不能修改");
  return b;
}

const DAY = 86400000;

export const boardRouter = router({
  list: protectedProcedure
    .input(z.object({ folderId: z.string().nullish(), trash: z.boolean().optional(), search: z.string().optional(), all: z.boolean().optional() }))
    .query(({ ctx, input }) => {
      const where = ["creatorId = ?"];
      const args: unknown[] = [ctx.user.id];
      if (input.trash) where.push("deletedAt IS NOT NULL");
      else {
        where.push("deletedAt IS NULL");
        if (!input.all && input.folderId !== undefined) {
          if (input.folderId === null) where.push("folderId IS NULL");
          else {
            where.push("folderId = ?");
            args.push(input.folderId);
          }
        }
      }
      if (input.search?.trim()) {
        where.push("title LIKE ?");
        args.push(`%${input.search.trim()}%`);
      }
      const rows = db
        .prepare(`SELECT * FROM board WHERE ${where.join(" AND ")} ORDER BY ${input.trash ? "deletedAt" : "COALESCE(lastEditedAt, updatedAt)"} DESC`)
        .all(...args) as BoardRow[];
      return presentBoards(rows);
    }),

  listShared: protectedProcedure.query(({ ctx }) => {
    const rows = db
      .prepare("SELECT * FROM board WHERE creatorId = ? AND deletedAt IS NULL AND visibility = 'link' ORDER BY updatedAt DESC")
      .all(ctx.user.id) as BoardRow[];
    return presentBoards(rows);
  }),

  overview: protectedProcedure.query(({ ctx }) => {
    const uid = ctx.user.id;
    const count = (sql: string, ...a: unknown[]) => (db.prepare(sql).get(...a) as { c: number }).c;
    const since = new Date(Date.now() - 7 * DAY).toISOString();
    const recent = db
      .prepare("SELECT * FROM board WHERE creatorId = ? AND deletedAt IS NULL ORDER BY COALESCE(lastEditedAt, updatedAt) DESC LIMIT 8")
      .all(uid) as BoardRow[];
    return {
      stats: {
        boards: count("SELECT count(*) c FROM board WHERE creatorId = ? AND deletedAt IS NULL", uid),
        createdByMe: count("SELECT count(*) c FROM board WHERE creatorId = ? AND deletedAt IS NULL", uid),
        editedThisWeek: count("SELECT count(*) c FROM board WHERE creatorId = ? AND deletedAt IS NULL AND lastEditedAt >= ?", uid, since),
        openComments: count(
          "SELECT count(*) c FROM comment c JOIN board b ON b.id = c.boardId WHERE b.creatorId = ? AND b.deletedAt IS NULL AND c.parentId IS NULL AND c.resolved = 0",
          uid,
        ),
      },
      recent: presentBoards(recent),
    };
  }),

  get: publicProcedure.input(z.object({ id: z.string(), token: z.string().nullish() })).query(({ ctx, input }) => {
    const b = getBoard(input.id);
    if (!b) throw fail("NOT_FOUND", "画布不存在");
    const role = resolveRole(b, ctx.user?.id, input.token);
    if (!role) throw fail(ctx.user ? "NOT_FOUND" : "UNAUTHORIZED", "画布不存在或未开启链接分享");
    flushAll();
    const pages = listPages(b.id).map((p) => ({ id: p.id, name: p.name, sort: p.sort, elements: pageElements(p.id), appState: json(p.appState, {}) }));
    return {
      board: { ...presentBoards([b])[0], shareToken: role === "owner" ? b.shareToken : null },
      role,
      pages,
      files: getFiles(b.id),
    };
  }),

  /** Resolves a share token to a board id. */
  byToken: publicProcedure.input(z.object({ token: z.string() })).query(({ input }) => {
    const b = db.prepare("SELECT id, visibility, deletedAt FROM board WHERE shareToken = ?").get(input.token) as
      | Pick<BoardRow, "id" | "visibility" | "deletedAt">
      | undefined;
    if (!b || b.visibility !== "link" || b.deletedAt) throw fail("NOT_FOUND", "画布不存在或未开启链接分享");
    return { id: b.id };
  }),

  create: protectedProcedure.input(z.object({ title: z.string().max(128).optional(), folderId: z.string().nullish() })).mutation(({ ctx, input }) => {
    const b = createBoard(ctx.user.id, input.title || "未命名画布", input.folderId ?? null);
    recordActivity(b.id, ctx.user.id, "create");
    return b;
  }),

  update: protectedProcedure
    .input(z.object({ id: z.string(), title: z.string().min(1).max(128).optional(), folderId: z.string().nullish(), token: z.string().nullish() }))
    .mutation(({ ctx, input }) => {
      if (input.folderId !== undefined) ownBoard(input.id, ctx.user.id);
      else editableBoard(input.id, ctx.user.id, input.token);
      const t = now();
      if (input.title !== undefined) db.prepare("UPDATE board SET title = ?, updatedAt = ? WHERE id = ?").run(input.title, t, input.id);
      if (input.folderId !== undefined) db.prepare("UPDATE board SET folderId = ?, updatedAt = ? WHERE id = ?").run(input.folderId, t, input.id);
      if (input.title !== undefined) emitBoard(input.id, { type: "meta", title: input.title });
      return getBoard(input.id);
    }),

  duplicate: protectedProcedure.input(z.object({ id: z.string() })).mutation(({ ctx, input }) => {
    ownBoard(input.id, ctx.user.id);
    return duplicateBoard(input.id, ctx.user.id);
  }),

  trash: protectedProcedure.input(z.object({ id: z.string() })).mutation(({ ctx, input }) => {
    ownBoard(input.id, ctx.user.id);
    db.prepare("UPDATE board SET deletedAt = ? WHERE id = ?").run(now(), input.id);
    emitBoard(input.id, { type: "deleted" });
    return true;
  }),

  restore: protectedProcedure.input(z.object({ id: z.string() })).mutation(({ ctx, input }) => {
    ownBoard(input.id, ctx.user.id);
    db.prepare("UPDATE board SET deletedAt = NULL WHERE id = ?").run(input.id);
    return true;
  }),

  destroy: protectedProcedure.input(z.object({ id: z.string() })).mutation(({ ctx, input }) => {
    ownBoard(input.id, ctx.user.id);
    destroyBoard(input.id);
    return true;
  }),

  emptyTrash: protectedProcedure.mutation(({ ctx }) => {
    const rows = db.prepare("SELECT id FROM board WHERE creatorId = ? AND deletedAt IS NOT NULL").all(ctx.user.id) as { id: string }[];
    rows.forEach((r) => destroyBoard(r.id));
    return rows.length;
  }),

  share: protectedProcedure
    .input(z.object({ id: z.string(), visibility: z.enum(["private", "link"]).optional(), role: z.enum(["view", "edit"]).optional(), resetToken: z.boolean().optional() }))
    .mutation(({ ctx, input }) => {
      const b = ownBoard(input.id, ctx.user.id);
      let token = b.shareToken;
      if (input.visibility === "link" && !token) token = newShareToken();
      if (input.resetToken) token = newShareToken();
      if (input.visibility === "private") token = null;
      db.prepare("UPDATE board SET visibility = COALESCE(?, visibility), shareRole = COALESCE(?, shareRole), shareToken = ?, updatedAt = ? WHERE id = ?").run(
        input.visibility ?? null,
        input.role ?? null,
        token,
        now(),
        input.id,
      );
      const next = getBoard(input.id)!;
      emitBoard(input.id, { type: "share", visibility: next.visibility, shareRole: next.shareRole, tokenChanged: token !== b.shareToken });
      return next;
    }),

  createPage: protectedProcedure.input(z.object({ boardId: z.string(), name: z.string().max(64).optional(), token: z.string().nullish() })).mutation(({ ctx, input }) => {
    editableBoard(input.boardId, ctx.user.id, input.token);
    const pages = listPages(input.boardId);
    const id = newId();
    const name = input.name || `页面 ${pages.length + 1}`;
    db.prepare("INSERT INTO board_page(id, boardId, name, sort, updatedAt) VALUES(?,?,?,?,?)").run(id, input.boardId, name, (pages.at(-1)?.sort ?? 0) + 1, now());
    emitBoard(input.boardId, { type: "pages" });
    return { id, name };
  }),

  renamePage: protectedProcedure
    .input(z.object({ boardId: z.string(), pageId: z.string(), name: z.string().min(1).max(64), token: z.string().nullish() }))
    .mutation(({ ctx, input }) => {
      editableBoard(input.boardId, ctx.user.id, input.token);
      db.prepare("UPDATE board_page SET name = ? WHERE id = ? AND boardId = ?").run(input.name, input.pageId, input.boardId);
      emitBoard(input.boardId, { type: "pages" });
      return true;
    }),

  deletePage: protectedProcedure.input(z.object({ boardId: z.string(), pageId: z.string(), token: z.string().nullish() })).mutation(({ ctx, input }) => {
    editableBoard(input.boardId, ctx.user.id, input.token);
    if (listPages(input.boardId).length <= 1) throw fail("BAD_REQUEST", "至少保留一个页面");
    flushAll();
    db.prepare("DELETE FROM board_page WHERE id = ? AND boardId = ?").run(input.pageId, input.boardId);
    emitBoard(input.boardId, { type: "pages" });
    return true;
  }),

  pages: publicProcedure.input(z.object({ boardId: z.string(), token: z.string().nullish() })).query(({ ctx, input }) => {
    const b = getBoard(input.boardId);
    if (!b || !resolveRole(b, ctx.user?.id, input.token)) throw fail("NOT_FOUND", "画布不存在");
    return listPages(b.id).map((p) => ({ id: p.id, name: p.name, sort: p.sort }));
  }),

  /** Admin: platform usage for the back-office dashboard. */
  usageReport: adminProcedure.input(z.object({ month: z.string().regex(/^\d{4}-\d{2}$/) })).query(({ input }) => {
    const [y, m] = input.month.split("-").map(Number);
    const start = new Date(Date.UTC(y, m - 1, 1));
    const end = new Date(Date.UTC(y, m, 1));
    const prevStart = new Date(Date.UTC(y, m - 2, 1));
    const range = (a: Date, b: Date) => [a.toISOString(), b.toISOString()];
    const count = (sql: string, a: Date, b: Date) => (db.prepare(sql).get(...range(a, b)) as { c: number }).c;
    const metric = (sql: string) => ({ current: count(sql, start, end), previous: count(sql, prevStart, start) });
    const days = Math.round((end.getTime() - start.getTime()) / DAY);
    const daily = db
      .prepare(
        "SELECT substr(createdAt, 1, 10) d, kind, count(*) c FROM board_activity WHERE createdAt >= ? AND createdAt < ? GROUP BY d, kind",
      )
      .all(...range(start, end)) as { d: string; kind: string; c: number }[];
    const dailyComments = db
      .prepare("SELECT substr(createdAt, 1, 10) d, count(*) c FROM comment WHERE createdAt >= ? AND createdAt < ? GROUP BY d")
      .all(...range(start, end)) as { d: string; c: number }[];
    const trend = Array.from({ length: days }, (_, i) => {
      const d = new Date(start.getTime() + i * DAY).toISOString().slice(0, 10);
      const pick = (k: string) => daily.filter((r) => r.d === d && r.kind === k).reduce((s, r) => s + r.c, 0);
      return { date: d, edit: pick("edit"), create: pick("create"), upload: pick("upload"), comment: dailyComments.find((r) => r.d === d)?.c ?? 0 };
    });
    const ranking = db
      .prepare(
        `SELECT a.userId, u.name, u.email, u.image,
          sum(a.kind = 'edit') edits, sum(a.kind = 'create') creates, sum(a.kind = 'upload') uploads,
          (SELECT count(*) FROM comment c WHERE c.userId = a.userId AND c.createdAt >= ? AND c.createdAt < ?) comments,
          count(*) total
         FROM board_activity a LEFT JOIN user u ON u.id = a.userId
         WHERE a.createdAt >= ? AND a.createdAt < ? GROUP BY a.userId ORDER BY total DESC LIMIT 20`,
      )
      .all(...range(start, end), ...range(start, end));
    return {
      metrics: {
        newUsers: metric("SELECT count(*) c FROM user WHERE createdAt >= ? AND createdAt < ?"),
        activeUsers: metric("SELECT count(DISTINCT userId) c FROM board_activity WHERE createdAt >= ? AND createdAt < ?"),
        creates: metric("SELECT count(*) c FROM board_activity WHERE kind = 'create' AND createdAt >= ? AND createdAt < ?"),
        edits: metric("SELECT count(*) c FROM board_activity WHERE kind = 'edit' AND createdAt >= ? AND createdAt < ?"),
        comments: metric("SELECT count(*) c FROM comment WHERE createdAt >= ? AND createdAt < ?"),
        uploads: metric("SELECT count(*) c FROM board_activity WHERE kind = 'upload' AND createdAt >= ? AND createdAt < ?"),
      },
      totals: {
        users: (db.prepare("SELECT count(*) c FROM user").get() as { c: number }).c,
        boards: (db.prepare("SELECT count(*) c FROM board WHERE deletedAt IS NULL").get() as { c: number }).c,
      },
      trend,
      ranking,
    };
  }),
});

export const boardVersionRouter = router({
  list: protectedProcedure.input(z.object({ boardId: z.string(), all: z.boolean().optional(), token: z.string().nullish() })).query(({ ctx, input }) => {
    const b = getBoard(input.boardId);
    if (!b || !resolveRole(b, ctx.user.id, input.token)) throw fail("NOT_FOUND", "画布不存在");
    const rows = db
      .prepare(
        `SELECT v.id, v.name, v.auto, v.createdAt, v.createdBy, u.name userName FROM board_version v LEFT JOIN user u ON u.id = v.createdBy
         WHERE v.boardId = ? ${input.all ? "" : "AND v.auto = 0"} ORDER BY v.createdAt DESC LIMIT 200`,
      )
      .all(input.boardId) as { id: string; name: string; auto: number; createdAt: string; createdBy: string; userName: string | null }[];
    return { items: rows.map((r) => ({ ...r, auto: !!r.auto, current: r.id === b.currentVersionId })), currentVersionId: b.currentVersionId };
  }),

  get: protectedProcedure.input(z.object({ id: z.string(), token: z.string().nullish() })).query(({ ctx, input }) => {
    const v = db.prepare("SELECT * FROM board_version WHERE id = ?").get(input.id) as { boardId: string; snapshot: string; name: string } | undefined;
    if (!v) throw fail("NOT_FOUND", "版本不存在");
    const b = getBoard(v.boardId);
    if (!b || !resolveRole(b, ctx.user.id, input.token)) throw fail("NOT_FOUND", "画布不存在");
    return { name: v.name, pages: json<Snapshot>(v.snapshot, []), files: getFiles(b.id) };
  }),

  create: protectedProcedure.input(z.object({ boardId: z.string(), name: z.string().min(1).max(64), token: z.string().nullish() })).mutation(({ ctx, input }) => {
    editableBoard(input.boardId, ctx.user.id, input.token);
    const id = createVersion(input.boardId, input.name, ctx.user.id);
    emitBoard(input.boardId, { type: "versions" });
    return { id };
  }),

  rename: protectedProcedure.input(z.object({ id: z.string(), name: z.string().min(1).max(64), token: z.string().nullish() })).mutation(({ ctx, input }) => {
    const v = db.prepare("SELECT boardId FROM board_version WHERE id = ?").get(input.id) as { boardId: string } | undefined;
    if (!v) throw fail("NOT_FOUND", "版本不存在");
    editableBoard(v.boardId, ctx.user.id, input.token);
    db.prepare("UPDATE board_version SET name = ?, auto = 0 WHERE id = ?").run(input.name, input.id);
    emitBoard(v.boardId, { type: "versions" });
    return true;
  }),

  remove: protectedProcedure.input(z.object({ id: z.string(), token: z.string().nullish() })).mutation(({ ctx, input }) => {
    const v = db.prepare("SELECT boardId FROM board_version WHERE id = ?").get(input.id) as { boardId: string } | undefined;
    if (!v) throw fail("NOT_FOUND", "版本不存在");
    const b = editableBoard(v.boardId, ctx.user.id, input.token);
    if (b.currentVersionId === input.id) throw fail("BAD_REQUEST", "当前版本不能删除");
    db.prepare("DELETE FROM board_version WHERE id = ?").run(input.id);
    emitBoard(v.boardId, { type: "versions" });
    return true;
  }),

  restore: protectedProcedure.input(z.object({ id: z.string(), token: z.string().nullish() })).mutation(({ ctx, input }) => {
    const v = db.prepare("SELECT * FROM board_version WHERE id = ?").get(input.id) as { id: string; boardId: string; snapshot: string; name: string } | undefined;
    if (!v) throw fail("NOT_FOUND", "版本不存在");
    editableBoard(v.boardId, ctx.user.id, input.token);
    const { c } = db.prepare("SELECT count(*) c FROM board_version WHERE boardId = ? AND auto = 1").get(v.boardId) as { c: number };
    // Keep a copy of the current content so the restore itself can be undone.
    createVersion(v.boardId, `自动保存 v${c + 1}`, ctx.user.id, true);
    applySnapshot(v.boardId, json<Snapshot>(v.snapshot, []), ctx.user.id);
    db.prepare("UPDATE board SET currentVersionId = ? WHERE id = ?").run(v.id, v.boardId);
    emitBoard(v.boardId, { type: "versions" });
    return { name: v.name };
  }),
});
