import { Hono } from "hono";
import { pushElements } from "./collab";
import { createBoard, getBoard, listPages, mergeElements, pageElements, type SceneElement } from "./boards";
import { db, newId, now } from "./db";
import { hashKey } from "./routers/misc";
import { presentBoards } from "./routers/board";

type Env = { Variables: { userId: string } };
export const openApi = new Hono<Env>();

export const COLORS: Record<string, string> = {
  black: "#1e1e1e",
  gray: "#868e96",
  red: "#e03131",
  pink: "#c2255c",
  grape: "#9c36b5",
  violet: "#6741d9",
  blue: "#1971c2",
  cyan: "#0c8599",
  teal: "#099268",
  green: "#2f9e44",
  yellow: "#f08c00",
  orange: "#e8590c",
  white: "#ffffff",
  transparent: "transparent",
};
const FILLS: Record<string, string> = { red: "#ffc9c9", pink: "#fcc2d7", grape: "#eebefa", violet: "#d0bfff", blue: "#a5d8ff", cyan: "#99e9f2", teal: "#96f2d7", green: "#b2f2bb", yellow: "#ffec99", orange: "#ffd8a8", gray: "#e9ecef" };
const SHAPES = ["rectangle", "ellipse", "diamond", "text", "arrow", "line", "frame"] as const;

openApi.use("*", async (c, next) => {
  const header = c.req.header("authorization") || "";
  const key = header.startsWith("Bearer ") ? header.slice(7) : c.req.header("x-api-key");
  if (!key) return c.json({ error: "缺少 API Key" }, 401);
  const row = db.prepare("SELECT id, userId, enabled, expiresAt FROM api_key WHERE keyHash = ?").get(hashKey(key)) as
    | { id: string; userId: string; enabled: number; expiresAt: string | null }
    | undefined;
  if (!row || !row.enabled) return c.json({ error: "API Key 无效或已禁用" }, 401);
  if (row.expiresAt && Date.parse(row.expiresAt) < Date.now()) return c.json({ error: "API Key 已过期" }, 401);
  db.prepare("UPDATE api_key SET lastUsedAt = ? WHERE id = ?").run(now(), row.id);
  c.set("userId", row.userId);
  await next();
});

function ownBoard(id: string, userId: string) {
  const b = getBoard(id);
  return b && b.creatorId === userId && !b.deletedAt ? b : null;
}

function resolvePage(boardId: string, pageId?: string | null) {
  const pages = listPages(boardId);
  return (pageId ? pages.find((p) => p.id === pageId) : pages[0]) ?? null;
}

openApi.get("/me", (c) => c.json(db.prepare("SELECT id, name, email FROM user WHERE id = ?").get(c.get("userId"))));

openApi.get("/boards", (c) => {
  const rows = db.prepare("SELECT * FROM board WHERE creatorId = ? AND deletedAt IS NULL ORDER BY updatedAt DESC").all(c.get("userId"));
  return c.json(presentBoards(rows as never).map((b) => ({ id: b.id, title: b.title, updatedAt: b.updatedAt, url: `/board/${b.id}` })));
});

openApi.post("/boards", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const b = createBoard(c.get("userId"), String(body.title || "未命名画布").slice(0, 128));
  return c.json({ id: b.id, title: b.title, url: `/board/${b.id}` });
});

/** Board overview + element summary + usable enums — the "info()" an agent reads before editing. */
openApi.get("/boards/:id", (c) => {
  const b = ownBoard(c.req.param("id"), c.get("userId"));
  if (!b) return c.json({ error: "画布不存在" }, 404);
  const pages = listPages(b.id).map((p) => ({ id: p.id, name: p.name, elements: summarize(pageElements(p.id)) }));
  return c.json({ id: b.id, title: b.title, pages, enums: { shapes: SHAPES, colors: Object.keys(COLORS) } });
});

openApi.get("/boards/:id/scene", (c) => {
  const b = ownBoard(c.req.param("id"), c.get("userId"));
  if (!b) return c.json({ error: "画布不存在" }, 404);
  const page = resolvePage(b.id, c.req.query("pageId"));
  if (!page) return c.json({ error: "页面不存在" }, 404);
  return c.json({ pageId: page.id, elements: pageElements(page.id).filter((e) => !e.isDeleted) });
});

openApi.post("/boards/:id/elements", async (c) => {
  const b = ownBoard(c.req.param("id"), c.get("userId"));
  if (!b) return c.json({ error: "画布不存在" }, 404);
  const body = await c.req.json().catch(() => null);
  const page = resolvePage(b.id, body?.pageId);
  if (!page || !Array.isArray(body?.specs)) return c.json({ error: "需要 specs 数组" }, 400);
  try {
    const els = buildElements(body.specs, pageElements(page.id));
    const accepted = mergeElements(page.id, els, c.get("userId"));
    pushElements(b.id, page.id, accepted);
    return c.json({ pageId: page.id, created: summarize(els.filter((e) => e.type !== "text" || !e.containerId)) });
  } catch (e) {
    return c.json({ error: (e as Error).message }, 400);
  }
});

openApi.patch("/boards/:id/elements", async (c) => {
  const b = ownBoard(c.req.param("id"), c.get("userId"));
  if (!b) return c.json({ error: "画布不存在" }, 404);
  const body = await c.req.json().catch(() => null);
  const page = resolvePage(b.id, body?.pageId);
  if (!page || !Array.isArray(body?.updates)) return c.json({ error: "需要 updates 数组" }, 400);
  const current = new Map(pageElements(page.id).map((e) => [e.id, e]));
  const changed: SceneElement[] = [];
  for (const u of body.updates as Record<string, unknown>[]) {
    const el = current.get(String(u.id));
    if (!el || el.isDeleted) return c.json({ error: `元素「${u.id}」不存在` }, 400);
    const next: SceneElement = { ...el };
    for (const k of ["x", "y", "width", "height", "angle", "opacity", "strokeWidth"] as const) if (typeof u[k] === "number") next[k] = u[k];
    if (u.color) next.strokeColor = COLORS[String(u.color)] ?? String(u.color);
    if (u.fill) next.backgroundColor = FILLS[String(u.fill)] ?? COLORS[String(u.fill)] ?? String(u.fill);
    if (typeof u.text === "string") {
      const textEl = el.type === "text" ? next : current.get(((el.boundElements as { id: string; type: string }[] | null) ?? []).find((x) => x.type === "text")?.id ?? "");
      if (textEl) {
        const t = textEl === next ? next : { ...textEl };
        Object.assign(t, { text: u.text, originalText: u.text }, bump(t));
        if (t !== next) changed.push(t);
      }
    }
    changed.push(Object.assign(next, bump(next)));
  }
  const accepted = mergeElements(page.id, changed, c.get("userId"));
  pushElements(b.id, page.id, accepted);
  return c.json({ updated: accepted.length });
});

openApi.delete("/boards/:id/elements", async (c) => {
  const b = ownBoard(c.req.param("id"), c.get("userId"));
  if (!b) return c.json({ error: "画布不存在" }, 404);
  const body = await c.req.json().catch(() => null);
  const page = resolvePage(b.id, body?.pageId);
  if (!page) return c.json({ error: "页面不存在" }, 404);
  const all = pageElements(page.id);
  const clearAll = body?.all === true;
  if (!clearAll && !Array.isArray(body?.ids)) return c.json({ error: "清空画布需要传入 all: true，删除元素需要 ids" }, 400);
  const ids = new Set<string>(clearAll ? all.map((e) => e.id) : body.ids);
  // Bound labels go with their container.
  for (const e of all) if (e.containerId && ids.has(String(e.containerId))) ids.add(e.id);
  const removed = all.filter((e) => ids.has(e.id) && !e.isDeleted).map((e) => ({ ...e, isDeleted: true, ...bump(e) }));
  const accepted = mergeElements(page.id, removed, c.get("userId"));
  pushElements(b.id, page.id, accepted);
  return c.json({ deleted: accepted.length });
});

// ---------------- element builders ----------------

const rand = () => Math.floor(Math.random() * 2 ** 31);
const bump = (e: SceneElement) => ({ version: e.version + 1, versionNonce: rand(), updated: Date.now() });

function base(type: string, spec: Record<string, unknown>, extra: Record<string, unknown> = {}): SceneElement {
  return {
    id: String(spec.id || newId()),
    type,
    x: Number(spec.x ?? 0),
    y: Number(spec.y ?? 0),
    width: Number(spec.width ?? 160),
    height: Number(spec.height ?? 80),
    angle: 0,
    strokeColor: COLORS[String(spec.color)] ?? (spec.color as string) ?? "#1e1e1e",
    backgroundColor: FILLS[String(spec.fill)] ?? COLORS[String(spec.fill)] ?? (spec.fill as string) ?? "transparent",
    fillStyle: "solid",
    strokeWidth: Number(spec.strokeWidth ?? 2),
    strokeStyle: (spec.strokeStyle as string) ?? "solid",
    roughness: Number(spec.roughness ?? 1),
    opacity: 100,
    groupIds: [],
    frameId: null,
    roundness: type === "rectangle" || type === "diamond" ? { type: 3 } : null,
    seed: rand(),
    version: 1,
    versionNonce: rand(),
    isDeleted: false,
    boundElements: [],
    updated: Date.now(),
    link: null,
    locked: false,
    ...extra,
  };
}

function textEl(text: string, spec: Record<string, unknown>, containerId: string | null, box?: { x: number; y: number; width: number; height: number }) {
  const fontSize = Number(spec.fontSize ?? 20);
  const lines = text.split("\n");
  const width = Math.max(...lines.map((l) => [...l].reduce((s, ch) => s + (ch.charCodeAt(0) > 255 ? 1 : 0.55), 0))) * fontSize;
  const height = lines.length * fontSize * 1.25;
  const x = box ? box.x + (box.width - width) / 2 : Number(spec.x ?? 0);
  const y = box ? box.y + (box.height - height) / 2 : Number(spec.y ?? 0);
  return base("text", { ...spec, id: containerId ? undefined : spec.id, x, y, width, height, fill: "transparent" }, {
    text,
    originalText: text,
    fontSize,
    fontFamily: 5,
    textAlign: containerId ? "center" : "left",
    verticalAlign: containerId ? "middle" : "top",
    containerId,
    lineHeight: 1.25,
    autoResize: true,
    roundness: null,
  });
}

function buildElements(specs: Record<string, unknown>[], existing: SceneElement[]) {
  const out: SceneElement[] = [];
  const byId = new Map(existing.filter((e) => !e.isDeleted).map((e) => [e.id, e]));
  for (const spec of specs) {
    if (spec.id && byId.has(String(spec.id))) throw new Error(`元素 id「${spec.id}」已存在，请换一个或省略 id`);
    const type = String(spec.type);
    if (!SHAPES.includes(type as never)) throw new Error(`未知元素类型「${type}」`);
    if (type === "text") {
      const t = textEl(String(spec.text ?? ""), spec, null);
      out.push(t);
      byId.set(t.id, t);
      continue;
    }
    if (type === "frame") {
      const f = base("frame", spec, { name: spec.name ?? spec.label ?? null, roundness: null, strokeColor: "#bbb" });
      out.push(f);
      byId.set(f.id, f);
      continue;
    }
    if (type === "arrow" || type === "line") {
      const from = spec.from ? byId.get(String(spec.from)) : null;
      const to = spec.to ? byId.get(String(spec.to)) : null;
      if (spec.from && !from) throw new Error(`元素「${spec.from}」不存在`);
      if (spec.to && !to) throw new Error(`元素「${spec.to}」不存在`);
      const center = (e: SceneElement) => ({ x: (e.x as number) + (e.width as number) / 2, y: (e.y as number) + (e.height as number) / 2 });
      const start = from ? edgePoint(from, to ? center(to) : { x: Number(spec.x2 ?? 0), y: Number(spec.y2 ?? 0) }) : { x: Number(spec.x ?? 0), y: Number(spec.y ?? 0) };
      const end = to ? edgePoint(to, start) : { x: Number(spec.x2 ?? start.x + Number(spec.width ?? 160)), y: Number(spec.y2 ?? start.y + Number(spec.height ?? 0)) };
      const a = base(type, { ...spec, x: start.x, y: start.y, width: Math.abs(end.x - start.x), height: Math.abs(end.y - start.y) }, {
        points: [
          [0, 0],
          [end.x - start.x, end.y - start.y],
        ],
        lastCommittedPoint: null,
        startBinding: from ? { elementId: from.id, focus: 0, gap: 4 } : null,
        endBinding: to ? { elementId: to.id, focus: 0, gap: 4 } : null,
        startArrowhead: null,
        endArrowhead: type === "arrow" ? "arrow" : null,
        roundness: { type: 2 },
        elbowed: false,
      });
      out.push(a);
      for (const t of [from, to]) {
        if (!t) continue;
        const upd = { ...t, boundElements: [...((t.boundElements as unknown[]) ?? []), { type: "arrow", id: a.id }], ...bump(t) };
        byId.set(t.id, upd);
        const idx = out.findIndex((e) => e.id === t.id);
        if (idx >= 0) out[idx] = upd;
        else out.push(upd);
      }
      if (spec.label) {
        const lbl = textEl(String(spec.label), { ...spec, fontSize: spec.fontSize ?? 16 }, a.id, { x: start.x, y: start.y, width: end.x - start.x, height: end.y - start.y });
        (a.boundElements as unknown[]).push({ type: "text", id: lbl.id });
        out.push(lbl);
      }
      continue;
    }
    const shape = base(type, spec);
    out.push(shape);
    byId.set(shape.id, shape);
    const label = spec.text ?? spec.label;
    if (label) {
      const t = textEl(String(label), spec, shape.id, shape as never);
      (shape.boundElements as unknown[]).push({ type: "text", id: t.id });
      out.push(t);
    }
  }
  return out;
}

function edgePoint(e: SceneElement, toward: { x: number; y: number }) {
  const cx = (e.x as number) + (e.width as number) / 2;
  const cy = (e.y as number) + (e.height as number) / 2;
  const dx = toward.x - cx;
  const dy = toward.y - cy;
  if (!dx && !dy) return { x: cx, y: cy };
  const hw = (e.width as number) / 2 + 6;
  const hh = (e.height as number) / 2 + 6;
  const s = Math.min(Math.abs(hw / (dx || 1e-9)), Math.abs(hh / (dy || 1e-9)));
  return { x: cx + dx * s, y: cy + dy * s };
}

function summarize(els: SceneElement[]) {
  const live = els.filter((e) => !e.isDeleted);
  const texts = new Map(live.filter((e) => e.type === "text" && e.containerId).map((e) => [e.containerId as string, e.text as string]));
  return live
    .filter((e) => !(e.type === "text" && e.containerId))
    .map((e) => ({
      id: e.id,
      type: e.type,
      x: Math.round(e.x as number),
      y: Math.round(e.y as number),
      width: Math.round(e.width as number),
      height: Math.round(e.height as number),
      text: (e.type === "text" ? e.text : texts.get(e.id)) ?? undefined,
      color: e.strokeColor,
      fill: e.backgroundColor,
      from: (e.startBinding as { elementId: string } | null)?.elementId,
      to: (e.endBinding as { elementId: string } | null)?.elementId,
      kind: (e.customData as { kind?: string } | undefined)?.kind,
    }));
}
