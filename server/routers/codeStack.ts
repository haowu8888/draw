import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { db, json, newId, now, UPLOAD_DIR } from "../db";
import { adminProcedure, fail, publicProcedure, router } from "../trpc";

export type LibFile = { url: string; type: "js" | "css"; source?: string };
export type LibraryRow = {
  id: string;
  name: string;
  category: string;
  packageName: string | null;
  version: string | null;
  globalName: string | null;
  modules: string | null;
  files: string;
  builtin: number;
  enabled: number;
  mirrored: number;
  createdAt: string;
  updatedAt: string;
};
type StackRow = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  runtime: "html" | "react" | "vue";
  libraryIds: string;
  starter: string | null;
  prompt: string | null;
  enabled: number;
  sort: number;
};
type FontRow = {
  id: string;
  family: string;
  displayName: string | null;
  category: string;
  source: "url" | "upload";
  url: string | null;
  css: string | null;
  files: string;
  enabled: number;
  mirrored: number;
  createdAt: string;
  updatedAt: string;
};

const CDN = "https://cdn.jsdelivr.net/npm";
const presentLib = (l: LibraryRow) => ({ ...l, files: json<LibFile[]>(l.files, []), builtin: !!l.builtin, enabled: !!l.enabled, mirrored: !!l.mirrored });
const presentStack = (s: StackRow) => ({ ...s, libraryIds: json<string[]>(s.libraryIds, []), enabled: !!s.enabled });
const presentFont = (f: FontRow) => ({ ...f, files: json<{ url: string; weight: string; style: string; source?: string }[]>(f.files, []), enabled: !!f.enabled, mirrored: !!f.mirrored });

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { "user-agent": "draw-server" } });
  if (!res.ok) throw fail("BAD_REQUEST", `请求失败（${res.status}）`);
  return (await res.json()) as T;
}

const libDir = path.join(UPLOAD_DIR, "lib");
const fontDir = path.join(UPLOAD_DIR, "fonts");

async function download(url: string, dest: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} ${res.status}`);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
}

const PRESET_LIBS: Omit<LibraryRow, "id" | "createdAt" | "updatedAt" | "mirrored" | "enabled">[] = [
  { name: "Tailwind CSS", category: "css", packageName: "@tailwindcss/browser", version: "4.1.13", globalName: null, modules: null, builtin: 1, files: JSON.stringify([{ url: `${CDN}/@tailwindcss/browser@4.1.13/dist/index.global.js`, type: "js" }]) },
  { name: "Vue", category: "framework", packageName: "vue", version: "3.5.21", globalName: "Vue", modules: "vue", builtin: 0, files: JSON.stringify([{ url: `${CDN}/vue@3.5.21/dist/vue.global.prod.js`, type: "js" }]) },
  {
    name: "Element Plus",
    category: "ui",
    packageName: "element-plus",
    version: "2.11.2",
    globalName: "ElementPlus",
    modules: "element-plus",
    builtin: 0,
    files: JSON.stringify([
      { url: `${CDN}/element-plus@2.11.2/dist/index.css`, type: "css" },
      { url: `${CDN}/element-plus@2.11.2/dist/index.full.min.js`, type: "js" },
    ]),
  },
  { name: "Element Plus Icons", category: "icon", packageName: "@element-plus/icons-vue", version: "2.3.2", globalName: "ElementPlusIconsVue", modules: "@element-plus/icons-vue", builtin: 0, files: JSON.stringify([{ url: `${CDN}/@element-plus/icons-vue@2.3.2/dist/index.iife.min.js`, type: "js" }]) },
  { name: "React", category: "framework", packageName: "react", version: "18.3.1", globalName: "React", modules: "react", builtin: 0, files: JSON.stringify([{ url: `${CDN}/react@18.3.1/umd/react.production.min.js`, type: "js" }]) },
  { name: "ReactDOM", category: "framework", packageName: "react-dom", version: "18.3.1", globalName: "ReactDOM", modules: "react-dom, react-dom/client", builtin: 0, files: JSON.stringify([{ url: `${CDN}/react-dom@18.3.1/umd/react-dom.production.min.js`, type: "js" }]) },
  { name: "Day.js", category: "util", packageName: "dayjs", version: "1.11.18", globalName: "dayjs", modules: "dayjs", builtin: 0, files: JSON.stringify([{ url: `${CDN}/dayjs@1.11.18/dayjs.min.js`, type: "js" }]) },
  {
    name: "Ant Design",
    category: "ui",
    packageName: "antd",
    version: "5.27.3",
    globalName: "antd",
    modules: "antd",
    builtin: 0,
    files: JSON.stringify([
      { url: `${CDN}/antd@5.27.3/dist/reset.css`, type: "css" },
      { url: `${CDN}/antd@5.27.3/dist/antd.min.js`, type: "js" },
    ]),
  },
];

const PRESET_STACKS = [
  {
    key: "html",
    name: "HTML",
    description: "原生 HTML + Tailwind CSS",
    runtime: "html" as const,
    libs: [] as string[],
    starter: `<div class="min-h-full flex items-center justify-center bg-slate-50 p-6">
  <div class="w-72 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
    <p class="text-sm text-slate-500">本月营收</p>
    <p class="mt-1 text-3xl font-bold text-slate-900">¥ 128,430</p>
    <p class="mt-1 text-sm text-emerald-600">较上月 +12.5%</p>
    <button id="btn" class="mt-4 w-full rounded-lg bg-slate-900 py-2 text-sm text-white">刷新数据</button>
  </div>
</div>
<script>
  let n = 0;
  document.getElementById("btn").addEventListener("click", (e) => (e.target.textContent = "点击了 " + ++n + " 次"));
</script>`,
  },
  {
    key: "vue-element",
    name: "Vue 3 + Element Plus",
    description: "Vue 3 单文件组件，已全局安装 Element Plus",
    runtime: "vue" as const,
    libs: ["vue", "element-plus", "@element-plus/icons-vue"],
    starter: `<template>
  <div class="p-6">
    <el-card style="max-width: 320px">
      <p class="text-sm text-slate-500">本月营收</p>
      <p class="text-3xl font-bold">¥ {{ amount.toLocaleString() }}</p>
      <el-button type="primary" class="mt-4 w-full" @click="refresh">刷新数据</el-button>
    </el-card>
  </div>
</template>

<script>
import { ref } from "vue";
export default {
  setup() {
    const amount = ref(128430);
    const refresh = () => (amount.value += Math.round(Math.random() * 1000));
    return { amount, refresh };
  },
};
</script>`,
  },
  {
    key: "react-antd",
    name: "React 18 + Ant Design",
    description: "React 函数组件（JSX / TypeScript），可 import antd",
    runtime: "react" as const,
    libs: ["react", "react-dom", "dayjs", "antd"],
    starter: `import { useState } from "react";
import { Button, Card, Statistic } from "antd";

export default function App() {
  const [value, setValue] = useState(128430);
  return (
    <div className="p-6">
      <Card style={{ maxWidth: 320 }}>
        <Statistic title="本月营收" value={value} prefix="¥" />
        <Button type="primary" block className="mt-4" onClick={() => setValue((v) => v + 1000)}>
          刷新数据
        </Button>
      </Card>
    </div>
  );
}`,
  },
];

export function seedCodeDefaults() {
  const t = now();
  let added = 0;
  db.transaction(() => {
    for (const lib of PRESET_LIBS) {
      const exists = db.prepare("SELECT id FROM code_library WHERE packageName = ? AND version = ?").get(lib.packageName, lib.version);
      if (exists) continue;
      db.prepare(
        "INSERT INTO code_library(id, name, category, packageName, version, globalName, modules, files, builtin, enabled, mirrored, createdAt, updatedAt) VALUES(?,?,?,?,?,?,?,?,?,1,0,?,?)",
      ).run(newId(), lib.name, lib.category, lib.packageName, lib.version, lib.globalName, lib.modules, lib.files, lib.builtin, t, t);
      added++;
    }
    PRESET_STACKS.forEach((s, i) => {
      if (db.prepare("SELECT id FROM code_stack WHERE key = ?").get(s.key)) return;
      const ids = s.libs.map((p) => (db.prepare("SELECT id FROM code_library WHERE packageName = ? ORDER BY createdAt DESC").get(p) as { id: string }).id);
      db.prepare("INSERT INTO code_stack(id, key, name, description, runtime, libraryIds, starter, enabled, sort, createdAt, updatedAt) VALUES(?,?,?,?,?,?,?,1,?,?,?)").run(
        newId(),
        s.key,
        s.name,
        s.description,
        s.runtime,
        JSON.stringify(ids),
        s.starter,
        i,
        t,
        t,
      );
      added++;
    });
  })();
  return added;
}

/** Stacks with resolved resources, as consumed by the editor's code-display nodes. */
export function resolvedStacks() {
  const libs = (db.prepare("SELECT * FROM code_library").all() as LibraryRow[]).map(presentLib);
  const builtin = libs.filter((l) => l.builtin && l.enabled);
  const stacks = (db.prepare("SELECT * FROM code_stack ORDER BY sort, createdAt").all() as StackRow[]).map(presentStack);
  const fonts = (db.prepare("SELECT * FROM code_font WHERE enabled = 1").all() as FontRow[]).map(presentFont);
  return {
    stacks: stacks.map((s) => ({
      ...s,
      libraries: [...builtin, ...s.libraryIds.map((id) => libs.find((l) => l.id === id)).filter((l): l is (typeof libs)[number] => !!l && l.enabled && !l.builtin)],
    })),
    fonts: fonts.map((f) => ({ family: f.family, category: f.category, css: f.css, url: f.url })),
  };
}

export const codeStackRouter = router({
  list: publicProcedure.query(() => resolvedStacks()),
  stacks: adminProcedure.query(() => (db.prepare("SELECT * FROM code_stack ORDER BY sort, createdAt").all() as StackRow[]).map(presentStack)),
  libraries: adminProcedure.query(() => (db.prepare("SELECT * FROM code_library ORDER BY category, name, createdAt").all() as LibraryRow[]).map(presentLib)),
  fonts: adminProcedure.query(() => (db.prepare("SELECT * FROM code_font ORDER BY category, family").all() as FontRow[]).map(presentFont)),
  seedDefaults: adminProcedure.mutation(() => seedCodeDefaults()),

  saveStack: adminProcedure
    .input(
      z.object({
        id: z.string().optional(),
        name: z.string().min(1).max(64),
        description: z.string().max(200).optional(),
        runtime: z.enum(["html", "react", "vue"]),
        libraryIds: z.array(z.string()),
        starter: z.string().max(100000).optional(),
        prompt: z.string().max(20000).optional(),
        enabled: z.boolean(),
        sort: z.number().int().optional(),
      }),
    )
    .mutation(({ input }) => {
      const t = now();
      if (input.id) {
        db.prepare("UPDATE code_stack SET name=?, description=?, runtime=?, libraryIds=?, starter=?, prompt=?, enabled=?, sort=COALESCE(?, sort), updatedAt=? WHERE id=?").run(
          input.name,
          input.description ?? null,
          input.runtime,
          JSON.stringify(input.libraryIds),
          input.starter ?? null,
          input.prompt ?? null,
          input.enabled ? 1 : 0,
          input.sort ?? null,
          t,
          input.id,
        );
        return { id: input.id };
      }
      const id = newId();
      db.prepare("INSERT INTO code_stack(id, key, name, description, runtime, libraryIds, starter, prompt, enabled, sort, createdAt, updatedAt) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)").run(
        id,
        `stack-${id.slice(0, 8)}`,
        input.name,
        input.description ?? null,
        input.runtime,
        JSON.stringify(input.libraryIds),
        input.starter ?? null,
        input.prompt ?? null,
        input.enabled ? 1 : 0,
        input.sort ?? 99,
        t,
        t,
      );
      return { id };
    }),
  deleteStack: adminProcedure.input(z.object({ id: z.string() })).mutation(({ input }) => {
    db.prepare("DELETE FROM code_stack WHERE id = ?").run(input.id);
    return true;
  }),

  saveLibrary: adminProcedure
    .input(
      z.object({
        id: z.string().optional(),
        name: z.string().min(1).max(64),
        category: z.string(),
        packageName: z.string().nullish(),
        version: z.string().nullish(),
        globalName: z.string().nullish(),
        modules: z.string().nullish(),
        files: z.array(z.object({ url: z.string().url(), type: z.enum(["js", "css"]) })).min(1),
        builtin: z.boolean(),
        enabled: z.boolean(),
        mirror: z.boolean().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const t = now();
      const id = input.id ?? newId();
      const values = [input.name, input.category, input.packageName ?? null, input.version ?? null, input.globalName ?? null, input.modules ?? null, JSON.stringify(input.files), input.builtin ? 1 : 0, input.enabled ? 1 : 0];
      if (input.id) {
        db.prepare("UPDATE code_library SET name=?, category=?, packageName=?, version=?, globalName=?, modules=?, files=?, builtin=?, enabled=?, mirrored=0, updatedAt=? WHERE id=?").run(...values, t, id);
      } else {
        db.prepare("INSERT INTO code_library(id, name, category, packageName, version, globalName, modules, files, builtin, enabled, mirrored, createdAt, updatedAt) VALUES(?,?,?,?,?,?,?,?,?,?,0,?,?)").run(
          id,
          ...values,
          t,
          t,
        );
      }
      if (input.mirror) await mirrorLibrary(id);
      return { id };
    }),
  deleteLibrary: adminProcedure.input(z.object({ id: z.string() })).mutation(({ input }) => {
    const used = (db.prepare("SELECT name, libraryIds FROM code_stack").all() as StackRow[]).filter((s) => json<string[]>(s.libraryIds, []).includes(input.id));
    if (used.length) throw fail("BAD_REQUEST", `被技术方案「${used.map((s) => s.name).join("、")}」使用中，不能删除`);
    fs.rmSync(path.join(libDir, input.id), { recursive: true, force: true });
    db.prepare("DELETE FROM code_library WHERE id = ?").run(input.id);
    return true;
  }),
  mirrorLibrary: adminProcedure.input(z.object({ id: z.string() })).mutation(({ input }) => mirrorLibrary(input.id)),

  cdnSearch: adminProcedure.input(z.object({ q: z.string().min(1) })).query(async ({ input }) => {
    const r = await fetchJson<{ objects: { package: { name: string; version: string; description?: string } }[] }>(
      `https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(input.q)}&size=12`,
    );
    return r.objects.map((o) => o.package);
  }),
  cdnVersions: adminProcedure.input(z.object({ name: z.string() })).query(async ({ input }) => {
    const r = await fetchJson<{ tags: Record<string, string>; versions: { version: string }[] }>(`https://data.jsdelivr.com/v1/packages/npm/${input.name}`);
    return { latest: r.tags.latest, versions: r.versions.slice(0, 60).map((v) => v.version) };
  }),
  cdnFiles: adminProcedure.input(z.object({ name: z.string(), version: z.string() })).query(async ({ input }) => {
    const r = await fetchJson<{ files: { name: string; size: number }[] }>(`https://data.jsdelivr.com/v1/packages/npm/${input.name}@${input.version}?structure=flat`);
    return r.files
      .filter((f) => /\.(m?js|css)$/.test(f.name) && !/\.(map|d\.ts)$/.test(f.name))
      .map((f) => ({ path: f.name, size: f.size, url: `${CDN}/${input.name}@${input.version}${f.name}` }));
  }),
  /** Guesses the global variable an UMD / IIFE script assigns. */
  inspectScript: adminProcedure.input(z.object({ url: z.string().url() })).query(async ({ input }) => {
    const res = await fetch(input.url);
    if (!res.ok) throw fail("BAD_REQUEST", `读取失败（${res.status}）`);
    const head = (await res.text()).slice(0, 4000);
    const m = head.match(/(?:global|globalThis|self|window)\.([A-Za-z_$][\w$]*)\s*=/) || head.match(/var\s+([A-Za-z_$][\w$]*)\s*=\s*function/);
    return { globalName: m?.[1] ?? null, isEsm: /^\s*(import|export)\s/m.test(head) };
  }),

  saveFont: adminProcedure
    .input(
      z.object({
        id: z.string().optional(),
        family: z.string().min(1).max(100),
        displayName: z.string().max(100).nullish(),
        category: z.string(),
        source: z.enum(["url", "upload"]),
        url: z.string().nullish(),
        files: z.array(z.object({ url: z.string(), weight: z.string(), style: z.string() })).optional(),
        enabled: z.boolean(),
        mirror: z.boolean().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const t = now();
      const id = input.id ?? newId();
      const files = input.files ?? [];
      const css =
        input.source === "upload"
          ? files.map((f) => `@font-face{font-family:'${input.family}';src:url(${f.url});font-weight:${f.weight};font-style:${f.style};font-display:swap}`).join("\n")
          : null;
      const vals = [input.family, input.displayName ?? null, input.category, input.source, input.url ?? null, css, JSON.stringify(files), input.enabled ? 1 : 0];
      if (input.id) db.prepare("UPDATE code_font SET family=?, displayName=?, category=?, source=?, url=?, css=?, files=?, enabled=?, mirrored=0, updatedAt=? WHERE id=?").run(...vals, t, id);
      else db.prepare("INSERT INTO code_font(id, family, displayName, category, source, url, css, files, enabled, mirrored, createdAt, updatedAt) VALUES(?,?,?,?,?,?,?,?,?,0,?,?)").run(id, ...vals, t, t);
      if (input.mirror && input.source === "url") await mirrorFont(id);
      if (input.source === "upload") db.prepare("UPDATE code_font SET mirrored = 1 WHERE id = ?").run(id);
      return { id };
    }),
  deleteFont: adminProcedure.input(z.object({ id: z.string() })).mutation(({ input }) => {
    fs.rmSync(path.join(fontDir, input.id), { recursive: true, force: true });
    db.prepare("DELETE FROM code_font WHERE id = ?").run(input.id);
    return true;
  }),
  mirrorFont: adminProcedure.input(z.object({ id: z.string() })).mutation(({ input }) => mirrorFont(input.id)),
});

/** Copies a library's CDN files into local storage so code nodes don't depend on a public CDN. */
async function mirrorLibrary(id: string) {
  const lib = db.prepare("SELECT * FROM code_library WHERE id = ?").get(id) as LibraryRow | undefined;
  if (!lib) throw fail("NOT_FOUND", "资源不存在");
  const files = json<LibFile[]>(lib.files, []);
  const out: LibFile[] = [];
  try {
    for (const [i, f] of files.entries()) {
      const src = f.source ?? f.url;
      if (!/^https?:/.test(src)) {
        out.push(f);
        continue;
      }
      const name = `${i}-${path.basename(new URL(src).pathname)}`;
      await download(src, path.join(libDir, id, name));
      out.push({ url: `/uploads/lib/${id}/${name}`, type: f.type, source: src });
    }
  } catch (e) {
    throw fail("BAD_REQUEST", `转存失败：${(e as Error).message}`);
  }
  db.prepare("UPDATE code_library SET files = ?, mirrored = 1, updatedAt = ? WHERE id = ?").run(JSON.stringify(out), now(), id);
  return true;
}

/** Downloads a remote font stylesheet (e.g. Google Fonts css2) with all referenced font files. */
async function mirrorFont(id: string) {
  const font = db.prepare("SELECT * FROM code_font WHERE id = ?").get(id) as FontRow | undefined;
  if (!font?.url) throw fail("NOT_FOUND", "字体不存在");
  try {
    const res = await fetch(font.url, { headers: { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36" } });
    if (!res.ok) throw new Error(String(res.status));
    let css = await res.text();
    const urls = [...new Set([...css.matchAll(/url\((['"]?)(https?:[^)'"]+)\1\)/g)].map((m) => m[2]))];
    fs.rmSync(path.join(fontDir, id), { recursive: true, force: true });
    for (const [i, u] of urls.entries()) {
      const name = `${i}${path.extname(new URL(u).pathname) || ".woff2"}`;
      await download(u, path.join(fontDir, id, name));
      css = css.split(u).join(`/uploads/fonts/${id}/${name}`);
    }
    db.prepare("UPDATE code_font SET css = ?, mirrored = 1, updatedAt = ? WHERE id = ?").run(css, now(), id);
    return { files: urls.length };
  } catch (e) {
    throw fail("BAD_REQUEST", `转存失败：${(e as Error).message}`);
  }
}
