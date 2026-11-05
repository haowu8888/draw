import crypto from "node:crypto";
import { z } from "zod";
import { auth } from "../auth";
import { config } from "../config";
import { cleanupUserData, emitBoard, getBoard, recordActivity, resolveRole } from "../boards";
import { db, getSetting, json, newId, now, setSetting } from "../db";
import { adminProcedure, fail, protectedProcedure, publicProcedure, router } from "../trpc";

// ---------------- folders ----------------

type FolderRow = { id: string; userId: string; parentId: string | null; name: string; sort: number; createdAt: string; updatedAt: string };

export const folderRouter = router({
  list: protectedProcedure.query(({ ctx }) => {
    const rows = db.prepare("SELECT * FROM folder WHERE userId = ? ORDER BY sort, createdAt").all(ctx.user.id) as FolderRow[];
    const counts = db
      .prepare("SELECT folderId, count(*) c FROM board WHERE creatorId = ? AND deletedAt IS NULL AND folderId IS NOT NULL GROUP BY folderId")
      .all(ctx.user.id) as { folderId: string; c: number }[];
    return rows.map((f) => ({ ...f, boardCount: counts.find((c) => c.folderId === f.id)?.c ?? 0 }));
  }),
  create: protectedProcedure.input(z.object({ name: z.string().min(1).max(128), parentId: z.string().nullish() })).mutation(({ ctx, input }) => {
    const id = newId();
    const t = now();
    const { m } = db.prepare("SELECT COALESCE(max(sort), 0) m FROM folder WHERE userId = ?").get(ctx.user.id) as { m: number };
    db.prepare("INSERT INTO folder(id, userId, parentId, name, sort, createdAt, updatedAt) VALUES(?,?,?,?,?,?,?)").run(
      id,
      ctx.user.id,
      input.parentId ?? null,
      input.name,
      m + 1,
      t,
      t,
    );
    return { id };
  }),
  update: protectedProcedure
    .input(z.object({ id: z.string(), name: z.string().min(1).max(128).optional(), parentId: z.string().nullish() }))
    .mutation(({ ctx, input }) => {
      const f = db.prepare("SELECT * FROM folder WHERE id = ? AND userId = ?").get(input.id, ctx.user.id) as FolderRow | undefined;
      if (!f) throw fail("NOT_FOUND", "文件夹不存在");
      if (input.parentId !== undefined) {
        // Refuse to move a folder into its own subtree.
        let p = input.parentId;
        while (p) {
          if (p === input.id) throw fail("BAD_REQUEST", "不能移动到自身的子文件夹");
          p = (db.prepare("SELECT parentId FROM folder WHERE id = ?").get(p) as { parentId: string | null } | undefined)?.parentId ?? null;
        }
      }
      db.prepare("UPDATE folder SET name = COALESCE(?, name), parentId = ?, updatedAt = ? WHERE id = ?").run(
        input.name ?? null,
        input.parentId === undefined ? f.parentId : input.parentId,
        now(),
        input.id,
      );
      return true;
    }),
  remove: protectedProcedure.input(z.object({ id: z.string() })).mutation(({ ctx, input }) => {
    const all = db.prepare("SELECT id, parentId FROM folder WHERE userId = ?").all(ctx.user.id) as FolderRow[];
    if (!all.some((f) => f.id === input.id)) throw fail("NOT_FOUND", "文件夹不存在");
    const ids = [input.id];
    for (let i = 0; i < ids.length; i++) all.filter((f) => f.parentId === ids[i]).forEach((f) => ids.push(f.id));
    const q = ids.map(() => "?").join(",");
    db.transaction(() => {
      db.prepare(`UPDATE board SET folderId = NULL WHERE creatorId = ? AND folderId IN (${q})`).run(ctx.user.id, ...ids);
      db.prepare(`DELETE FROM folder WHERE id IN (${q})`).run(...ids);
    })();
    return true;
  }),
  reorder: protectedProcedure.input(z.object({ ids: z.array(z.string()), parentId: z.string().nullish() })).mutation(({ ctx, input }) => {
    const stmt = db.prepare("UPDATE folder SET sort = ?, parentId = ? WHERE id = ? AND userId = ?");
    db.transaction(() => input.ids.forEach((id, i) => stmt.run(i, input.parentId ?? null, id, ctx.user.id)))();
    return true;
  }),
});

// ---------------- comments ----------------

function commentAccess(boardId: string, userId: string | undefined, token?: string | null) {
  const b = getBoard(boardId);
  const role = b ? resolveRole(b, userId, token) : null;
  if (!b || !role) throw fail("NOT_FOUND", "画布不存在");
  return { board: b, role };
}

export const commentRouter = router({
  list: publicProcedure.input(z.object({ boardId: z.string(), token: z.string().nullish() })).query(({ ctx, input }) => {
    commentAccess(input.boardId, ctx.user?.id, input.token);
    return db
      .prepare(
        `SELECT c.*, u.name userName, u.image userImage FROM comment c LEFT JOIN user u ON u.id = c.userId
         WHERE c.boardId = ? ORDER BY c.createdAt`,
      )
      .all(input.boardId) as {
      id: string;
      boardId: string;
      pageId: string | null;
      parentId: string | null;
      userId: string;
      body: string;
      x: number | null;
      y: number | null;
      elementId: string | null;
      resolved: number;
      createdAt: string;
      updatedAt: string;
      userName: string | null;
      userImage: string | null;
    }[];
  }),
  create: protectedProcedure
    .input(
      z.object({
        boardId: z.string(),
        token: z.string().nullish(),
        pageId: z.string().nullish(),
        parentId: z.string().nullish(),
        body: z.string().min(1).max(4000),
        x: z.number().nullish(),
        y: z.number().nullish(),
        elementId: z.string().nullish(),
      }),
    )
    .mutation(({ ctx, input }) => {
      commentAccess(input.boardId, ctx.user.id, input.token);
      const id = newId();
      const t = now();
      db.prepare(
        "INSERT INTO comment(id, boardId, pageId, parentId, userId, body, x, y, elementId, createdAt, updatedAt) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
      ).run(id, input.boardId, input.pageId ?? null, input.parentId ?? null, ctx.user.id, input.body, input.x ?? null, input.y ?? null, input.elementId ?? null, t, t);
      recordActivity(input.boardId, ctx.user.id, "comment");
      emitBoard(input.boardId, { type: "comments" });
      return { id };
    }),
  update: protectedProcedure
    .input(z.object({ id: z.string(), token: z.string().nullish(), body: z.string().min(1).max(4000).optional(), resolved: z.boolean().optional(), x: z.number().optional(), y: z.number().optional() }))
    .mutation(({ ctx, input }) => {
      const c = db.prepare("SELECT * FROM comment WHERE id = ?").get(input.id) as { boardId: string; userId: string } | undefined;
      if (!c) throw fail("NOT_FOUND", "评论不存在");
      const { role } = commentAccess(c.boardId, ctx.user.id, input.token);
      if (input.body !== undefined && c.userId !== ctx.user.id) throw fail("FORBIDDEN", "只能编辑自己的评论");
      if (role === "view" && c.userId !== ctx.user.id) throw fail("FORBIDDEN", "没有权限");
      db.prepare("UPDATE comment SET body = COALESCE(?, body), resolved = COALESCE(?, resolved), x = COALESCE(?, x), y = COALESCE(?, y), updatedAt = ? WHERE id = ?").run(
        input.body ?? null,
        input.resolved === undefined ? null : input.resolved ? 1 : 0,
        input.x ?? null,
        input.y ?? null,
        now(),
        input.id,
      );
      emitBoard(c.boardId, { type: "comments" });
      return true;
    }),
  remove: protectedProcedure.input(z.object({ id: z.string(), token: z.string().nullish() })).mutation(({ ctx, input }) => {
    const c = db.prepare("SELECT * FROM comment WHERE id = ?").get(input.id) as { boardId: string; userId: string } | undefined;
    if (!c) throw fail("NOT_FOUND", "评论不存在");
    const { role } = commentAccess(c.boardId, ctx.user.id, input.token);
    if (c.userId !== ctx.user.id && role !== "owner") throw fail("FORBIDDEN", "没有权限");
    db.prepare("DELETE FROM comment WHERE id = ? OR parentId = ?").run(input.id, input.id);
    emitBoard(c.boardId, { type: "comments" });
    return true;
  }),
});

// ---------------- API keys ----------------

export const hashKey = (key: string) => crypto.createHash("sha256").update(key).digest("hex");

export const apiKeyRouter = router({
  list: protectedProcedure.query(({ ctx }) =>
    (
      db.prepare("SELECT id, name, start, enabled, expiresAt, lastUsedAt, createdAt FROM api_key WHERE userId = ? ORDER BY createdAt DESC").all(ctx.user.id) as {
        id: string;
        name: string;
        start: string;
        enabled: number;
        expiresAt: string | null;
        lastUsedAt: string | null;
        createdAt: string;
      }[]
    ).map((k) => ({ ...k, enabled: !!k.enabled })),
  ),
  create: protectedProcedure.input(z.object({ name: z.string().min(1).max(100), expiresInDays: z.number().int().positive().nullable() })).mutation(({ ctx, input }) => {
    const key = `dk_${crypto.randomBytes(24).toString("base64url")}`;
    const id = newId();
    const expiresAt = input.expiresInDays ? new Date(Date.now() + input.expiresInDays * 86400000).toISOString() : null;
    db.prepare("INSERT INTO api_key(id, userId, name, start, keyHash, expiresAt, createdAt) VALUES(?,?,?,?,?,?,?)").run(
      id,
      ctx.user.id,
      input.name,
      key.slice(0, 8),
      hashKey(key),
      expiresAt,
      now(),
    );
    return { id, key };
  }),
  update: protectedProcedure.input(z.object({ id: z.string(), name: z.string().min(1).max(100).optional(), enabled: z.boolean().optional() })).mutation(({ ctx, input }) => {
    const r = db.prepare("UPDATE api_key SET name = COALESCE(?, name), enabled = COALESCE(?, enabled) WHERE id = ? AND userId = ?").run(
      input.name ?? null,
      input.enabled === undefined ? null : input.enabled ? 1 : 0,
      input.id,
      ctx.user.id,
    );
    if (!r.changes) throw fail("NOT_FOUND", "API Key 不存在");
    return true;
  }),
  remove: protectedProcedure.input(z.object({ id: z.string() })).mutation(({ ctx, input }) => {
    db.prepare("DELETE FROM api_key WHERE id = ? AND userId = ?").run(input.id, ctx.user.id);
    return true;
  }),
});

// ---------------- site settings ----------------

export const settingRouter = router({
  get: publicProcedure.query(() => ({
    announcement: getSetting("announcement", ""),
    auth: {
      forgotPassword: { enabled: true },
      emailOtpLogin: { enabled: true },
      captcha: { provider: null as string | null, loginEnabled: false, registerEnabled: false },
    },
  })),
  update: adminProcedure.input(z.object({ announcement: z.string().max(2000) })).mutation(({ input }) => {
    setSetting("announcement", input.announcement.trim());
    return true;
  }),
  tasks: adminProcedure.query(() => ({ enabled: !!config.redisUrl })),
});

// ---------------- users (admin) ----------------

type UserRow = {
  id: string;
  name: string;
  email: string;
  emailVerified: number;
  image: string | null;
  role: string | null;
  banned: number | null;
  banReason: string | null;
  banExpires: string | number | null;
  gender: string | null;
  bio: string | null;
  createdAt: string;
  updatedAt: string;
};

export const userRouter = router({
  me: protectedProcedure.query(({ ctx }) => ctx.user),
  updateProfile: protectedProcedure
    .input(z.object({ name: z.string().min(1).max(100), gender: z.enum(["male", "female", "secret"]), bio: z.string().max(500) }))
    .mutation(({ ctx, input }) => {
      db.prepare("UPDATE user SET name = ?, gender = ?, bio = ?, updatedAt = ? WHERE id = ?").run(input.name, input.gender, input.bio, new Date().toISOString(), ctx.user.id);
      return true;
    }),
  list: adminProcedure.input(z.object({ search: z.string().optional(), page: z.number().int().min(1).default(1), pageSize: z.number().int().max(100).default(20) })).query(({ input }) => {
    const where = input.search?.trim() ? "WHERE name LIKE ? OR email LIKE ?" : "";
    const args = input.search?.trim() ? [`%${input.search.trim()}%`, `%${input.search.trim()}%`] : [];
    const total = (db.prepare(`SELECT count(*) c FROM user ${where}`).get(...args) as { c: number }).c;
    const items = db.prepare(`SELECT * FROM user ${where} ORDER BY createdAt DESC LIMIT ? OFFSET ?`).all(...args, input.pageSize, (input.page - 1) * input.pageSize) as UserRow[];
    const balance = new Map(
      (db.prepare("SELECT userId, sum(amount) s FROM orders WHERE status = 'paid' GROUP BY userId").all() as { userId: string; s: number }[]).map((r) => [r.userId, r.s]),
    );
    return { total, items: items.map((u) => ({ ...u, banned: !!u.banned, emailVerified: !!u.emailVerified, paid: balance.get(u.id) ?? 0 })) };
  }),
  create: adminProcedure
    .input(z.object({ name: z.string().min(1).max(100), email: z.string().email(), password: z.string().min(8), role: z.enum(["user", "admin"]) }))
    .mutation(async ({ ctx, input }) => {
      await auth.api.createUser({ headers: ctx.headers, body: { ...input } });
      db.prepare("UPDATE user SET emailVerified = 1 WHERE email = ?").run(input.email.toLowerCase());
      return true;
    }),
  update: adminProcedure
    .input(z.object({ id: z.string(), name: z.string().min(1).max(100), email: z.string().email(), bio: z.string().max(500).optional() }))
    .mutation(({ input }) => {
      db.prepare("UPDATE user SET name = ?, email = ?, bio = COALESCE(?, bio), updatedAt = ? WHERE id = ?").run(input.name, input.email.toLowerCase(), input.bio ?? null, now(), input.id);
      return true;
    }),
  setRole: adminProcedure.input(z.object({ id: z.string(), role: z.enum(["user", "admin"]) })).mutation(({ ctx, input }) => {
    if (input.id === ctx.user.id && input.role !== "admin") throw fail("BAD_REQUEST", "不能取消自己的管理员身份");
    db.prepare("UPDATE user SET role = ? WHERE id = ?").run(input.role, input.id);
    return true;
  }),
  ban: adminProcedure.input(z.object({ id: z.string(), reason: z.string().min(1), expiresInDays: z.number().int().positive().nullable() })).mutation(({ ctx, input }) => {
    if (input.id === ctx.user.id) throw fail("BAD_REQUEST", "不能封禁自己");
    const exp = input.expiresInDays ? Date.now() + input.expiresInDays * 86400000 : null;
    db.prepare("UPDATE user SET banned = 1, banReason = ?, banExpires = ? WHERE id = ?").run(input.reason, exp, input.id);
    db.prepare("DELETE FROM session WHERE userId = ?").run(input.id);
    return true;
  }),
  unban: adminProcedure.input(z.object({ id: z.string() })).mutation(({ input }) => {
    db.prepare("UPDATE user SET banned = 0, banReason = NULL, banExpires = NULL WHERE id = ?").run(input.id);
    return true;
  }),
  resetPassword: adminProcedure.input(z.object({ id: z.string(), password: z.string().min(8) })).mutation(async ({ ctx, input }) => {
    await auth.api.setUserPassword({ headers: ctx.headers, body: { userId: input.id, newPassword: input.password } });
    return true;
  }),
  remove: adminProcedure.input(z.object({ id: z.string() })).mutation(({ ctx, input }) => {
    if (input.id === ctx.user.id) throw fail("BAD_REQUEST", "不能删除自己");
    deleteUserData(input.id);
    return true;
  }),
  sessions: adminProcedure.input(z.object({ id: z.string() })).query(({ input }) =>
    db.prepare("SELECT id, token, ipAddress, userAgent, createdAt, expiresAt, impersonatedBy FROM session WHERE userId = ? ORDER BY createdAt DESC").all(input.id) as {
      id: string;
      token: string;
      ipAddress: string | null;
      userAgent: string | null;
      createdAt: string;
      expiresAt: string;
      impersonatedBy: string | null;
    }[],
  ),
  revokeSession: adminProcedure.input(z.object({ id: z.string() })).mutation(({ input }) => {
    db.prepare("DELETE FROM session WHERE id = ?").run(input.id);
    return true;
  }),
  revokeAllSessions: adminProcedure.input(z.object({ id: z.string() })).mutation(({ input }) => {
    db.prepare("DELETE FROM session WHERE userId = ?").run(input.id);
    return true;
  }),
});

export function deleteUserData(userId: string) {
  cleanupUserData(userId);
  db.transaction(() => {
    db.prepare("DELETE FROM session WHERE userId = ?").run(userId);
    db.prepare("DELETE FROM account WHERE userId = ?").run(userId);
    db.prepare("DELETE FROM user WHERE id = ?").run(userId);
  })();
}

// ---------------- pricing & orders ----------------

export const PLANS = [
  { id: "single", name: "单设备", price: 10, devices: 1, desc: "适合想要提升 Mac 效率的个人用户", features: ["1 台 Mac 许可证", "终身使用", "所有 PRO 功能"], popular: false },
  { id: "double", name: "2 台设备", price: 20, devices: 2, desc: "适合拥有 2 台 Mac 的专业人士或家庭", features: ["2 台 Mac 许可证", "终身使用", "所有 PRO 功能"], popular: true },
];

type OrderRow = {
  id: string;
  userId: string | null;
  planId: string;
  planName: string;
  amount: number;
  currency: string;
  status: "pending" | "paid" | "cancelled" | "refunded" | "failed";
  channel: string;
  outTradeNo: string;
  channelTradeNo: string | null;
  qrcode: string | null;
  metadata: string | null;
  paidAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
};

function expireOrders() {
  db.prepare("UPDATE orders SET status = 'cancelled', updatedAt = ? WHERE status = 'pending' AND expiresAt < ?").run(now(), now());
}

export const priceRouter = router({
  plans: publicProcedure.query(() => PLANS),
  createOrder: protectedProcedure.input(z.object({ planId: z.string() })).mutation(({ ctx, input }) => {
    const plan = PLANS.find((p) => p.id === input.planId);
    if (!plan) throw fail("BAD_REQUEST", "方案不存在");
    const id = newId();
    const t = now();
    const outTradeNo = `D${Date.now()}${Math.floor(Math.random() * 1000)}`;
    db.prepare(
      "INSERT INTO orders(id, userId, planId, planName, amount, currency, status, channel, outTradeNo, qrcode, metadata, expiresAt, createdAt, updatedAt) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
    ).run(id, ctx.user.id, plan.id, plan.name, plan.price, "CNY", "pending", "mock", outTradeNo, `/pay/mock/${id}`, JSON.stringify({ devices: plan.devices }), new Date(Date.now() + 15 * 60000).toISOString(), t, t);
    return { id, outTradeNo, amount: plan.price, qrcode: `/pay/mock/${id}` };
  }),
  getOrder: protectedProcedure.input(z.object({ id: z.string() })).query(({ ctx, input }) => {
    expireOrders();
    const o = db.prepare("SELECT * FROM orders WHERE id = ?").get(input.id) as OrderRow | undefined;
    if (!o || (o.userId !== ctx.user.id && ctx.user.role !== "admin")) throw fail("NOT_FOUND", "订单不存在");
    return o;
  }),
  /** Mock payment channel: marks an order as paid (stands in for the WeChat / Alipay callback). */
  mockPay: protectedProcedure.input(z.object({ id: z.string() })).mutation(({ ctx, input }) => {
    const o = db.prepare("SELECT * FROM orders WHERE id = ? AND userId = ?").get(input.id, ctx.user.id) as OrderRow | undefined;
    if (!o) throw fail("NOT_FOUND", "订单不存在");
    if (o.status !== "pending") throw fail("BAD_REQUEST", "订单状态不可支付");
    db.prepare("UPDATE orders SET status = 'paid', paidAt = ?, channelTradeNo = ?, updatedAt = ? WHERE id = ?").run(now(), `MOCK${Date.now()}`, now(), o.id);
    return true;
  }),
  mySubscription: protectedProcedure.query(({ ctx }) => {
    const o = db.prepare("SELECT * FROM orders WHERE userId = ? AND status = 'paid' ORDER BY paidAt DESC LIMIT 1").get(ctx.user.id) as OrderRow | undefined;
    return o ? { planName: o.planName, paidAt: o.paidAt, expiresAt: null as string | null, amount: o.amount } : null;
  }),
  orders: adminProcedure
    .input(z.object({ page: z.number().int().min(1).default(1), pageSize: z.number().int().max(100).default(20), status: z.string().optional() }))
    .query(({ input }) => {
      expireOrders();
      const where = input.status ? "WHERE o.status = ?" : "";
      const args = input.status ? [input.status] : [];
      const total = (db.prepare(`SELECT count(*) c FROM orders o ${where}`).get(...args) as { c: number }).c;
      const items = db
        .prepare(`SELECT o.*, u.name userName, u.email userEmail FROM orders o LEFT JOIN user u ON u.id = o.userId ${where} ORDER BY o.createdAt DESC LIMIT ? OFFSET ?`)
        .all(...args, input.pageSize, (input.page - 1) * input.pageSize) as (OrderRow & { userName: string | null; userEmail: string | null })[];
      return { total, items: items.map((o) => ({ ...o, metadata: json(o.metadata, {}) })) };
    }),
  deleteOrder: adminProcedure.input(z.object({ id: z.string() })).mutation(({ input }) => {
    db.prepare("DELETE FROM orders WHERE id = ?").run(input.id);
    return true;
  }),
});
