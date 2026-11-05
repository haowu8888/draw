import dns from "node:dns/promises";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { Hono } from "hono";
import { auth } from "./auth";
import { canEdit, coverPath, flushAll, getBoard, getFiles, recordActivity, resolveRole, saveCover, saveFile } from "./boards";
import { handleUpgrade } from "./collab";
import { db, DATA_DIR, newId, UPLOAD_DIR } from "./db";
import { openApi } from "./openapi";
import { appRouter } from "./router";
import { seedCodeDefaults } from "./routers/codeStack";
import { createContext } from "./trpc";

if (!(db.prepare("SELECT count(*) c FROM code_stack").get() as { c: number }).c) seedCodeDefaults();

const app = new Hono();

app.get("/api/health", (c) => c.json({ ok: true }));
app.on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw));

app.all("/api/trpc/*", (c) =>
  fetchRequestHandler({
    endpoint: "/api/trpc",
    req: c.req.raw,
    router: appRouter,
    createContext,
    onError: ({ error, path }) => {
      if (error.code === "INTERNAL_SERVER_ERROR") console.error(`[trpc] ${path}`, error);
    },
  }),
);

app.route("/api/v1", openApi);

async function boardAccess(req: Request, boardId: string, token?: string | null) {
  const session = await auth.api.getSession({ headers: req.headers });
  const board = getBoard(boardId);
  const role = board ? resolveRole(board, session?.user.id, token) : null;
  return { board, role, userId: session?.user.id ?? null };
}

/** Binary files (images) used by a board's scene. */
app.get("/api/boards/:id/files", async (c) => {
  const { role } = await boardAccess(c.req.raw, c.req.param("id"), c.req.query("token"));
  if (!role) return c.json({ error: "画布不存在" }, 404);
  const ids = c.req.query("ids")?.split(",").filter(Boolean);
  return c.json(getFiles(c.req.param("id"), ids));
});

app.post("/api/boards/:id/files", async (c) => {
  const { role, userId } = await boardAccess(c.req.raw, c.req.param("id"), c.req.query("token"));
  if (!canEdit(role)) return c.json({ error: "当前画布为只读，不能修改" }, 403);
  const files = (await c.req.json()) as { id: string; mimeType: string; dataURL: string }[];
  for (const f of files) {
    if (f.dataURL.length > 25 * 1024 * 1024) return c.json({ error: "文件超过大小限制（20MB）" }, 413);
    saveFile(c.req.param("id"), f);
  }
  if (userId) recordActivity(c.req.param("id"), userId, "upload");
  return c.json({ ok: true });
});

app.get("/api/boards/:id/cover.webp", async (c) => {
  const p = coverPath(c.req.param("id"));
  if (!fs.existsSync(p)) return c.notFound();
  return c.body(fs.readFileSync(p), 200, { "content-type": "image/webp", "cache-control": "public, max-age=31536000, immutable" });
});

app.post("/api/boards/:id/cover", async (c) => {
  const { role } = await boardAccess(c.req.raw, c.req.param("id"), c.req.query("token"));
  if (!canEdit(role)) return c.json({ error: "forbidden" }, 403);
  const buf = Buffer.from(await c.req.arrayBuffer());
  if (buf.length > 5 * 1024 * 1024) return c.json({ error: "too large" }, 413);
  saveCover(c.req.param("id"), buf);
  return c.json({ ok: true });
});

/** Serves an uploaded file's bytes (used by video nodes). */
app.get("/api/boards/:id/files/:fileId/raw", async (c) => {
  const { role } = await boardAccess(c.req.raw, c.req.param("id"), c.req.query("token"));
  if (!role) return c.notFound();
  const [f] = getFiles(c.req.param("id"), [c.req.param("fileId")]);
  if (!f) return c.notFound();
  const m = /^data:([^;]+);base64,(.*)$/s.exec(f.dataURL);
  if (!m) return c.notFound();
  return c.body(Buffer.from(m[2], "base64"), 200, { "content-type": m[1], "cache-control": "private, max-age=31536000, immutable" });
});

function isPrivateAddress(ip: string) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  const v = ip.toLowerCase();
  return v === "::1" || v === "::" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80") || v.startsWith("::ffff:");
}

/** Open Graph metadata for link cards. Only public http(s) hosts are fetched. */
app.get("/api/link-preview", async (c) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: "请先登录" }, 401);
  let url: URL;
  try {
    url = new URL(c.req.query("url") || "");
    if (!/^https?:$/.test(url.protocol)) throw new Error();
    const addrs = await dns.lookup(url.hostname, { all: true });
    if (!addrs.length || addrs.some((a) => isPrivateAddress(a.address))) throw new Error();
  } catch {
    return c.json({ error: "无效的网址" }, 400);
  }
  try {
    const res = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(6000), headers: { "user-agent": "Mozilla/5.0 (compatible; DrawBot/1.0)" } });
    const html = (await res.text()).slice(0, 300_000);
    const meta = (name: string) =>
      html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]+content=["']([^"']*)["']`, "i"))?.[1] ??
      html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${name}["']`, "i"))?.[1];
    const image = meta("og:image");
    return c.json({
      title: meta("og:title") ?? html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim(),
      description: meta("og:description") ?? meta("description"),
      image: image ? new URL(image, url).toString() : undefined,
      siteName: meta("og:site_name") ?? url.host,
    });
  } catch {
    return c.json({ siteName: url.host });
  }
});

/** Admin uploads (font files). */
app.post("/api/upload", async (c) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (session?.user.role !== "admin") return c.json({ error: "没有权限" }, 403);
  const form = await c.req.formData();
  const out: { name: string; url: string }[] = [];
  for (const f of form.getAll("file")) {
    if (!(f instanceof File)) continue;
    if (!/\.(ttf|otf|woff2?)$/i.test(f.name)) return c.json({ error: `不支持的文件类型：${f.name}` }, 400);
    if (f.size > 20 * 1024 * 1024) return c.json({ error: `文件超过大小限制（20MB）：${f.name}` }, 413);
    const name = `${newId()}${path.extname(f.name).toLowerCase()}`;
    fs.mkdirSync(path.join(UPLOAD_DIR, "font-files"), { recursive: true });
    fs.writeFileSync(path.join(UPLOAD_DIR, "font-files", name), Buffer.from(await f.arrayBuffer()));
    out.push({ name: f.name, url: `/uploads/font-files/${name}` });
  }
  return c.json(out);
});

app.use(
  "/uploads/*",
  serveStatic({ root: path.relative(process.cwd(), DATA_DIR), onFound: (_p, c) => c.header("access-control-allow-origin", "*") }),
);

// Production: serve the built SPA.
const dist = path.resolve("dist");
if (fs.existsSync(dist)) {
  app.use("/*", serveStatic({ root: "dist" }));
  app.get("*", (c) => (c.req.path.startsWith("/api/") ? c.notFound() : c.html(fs.readFileSync(path.join(dist, "index.html"), "utf8"))));
}

const port = Number(process.env.PORT || 3000);
const server = serve({ fetch: app.fetch, port }, () => console.log(`[draw] server listening on http://localhost:${port}`));
server.on("upgrade", (req, socket, head) => {
  if (req.url?.startsWith("/api/collab")) handleUpgrade(req, socket, head);
  else socket.destroy();
});

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    flushAll();
    process.exit(0);
  });
}
