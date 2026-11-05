// Postinstall: Excalidraw draws a link icon on every element that has a `link`, including
// embeddables. Our canvas nodes are embeddables whose link is only an internal marker, so skip
// the icon for iframe-like elements (the same change the original site ships). Idempotent.
import fs from "node:fs";
import path from "node:path";

const dist = path.join(process.cwd(), "node_modules", "@excalidraw", "excalidraw", "dist");
const patches = [
  {
    dir: "prod",
    from: "if(e.link&&!n.selectedElementIds[e.id]){",
    to: 'if(e.link&&e.type!=="iframe"&&e.type!=="embeddable"&&!n.selectedElementIds[e.id]){',
  },
  {
    dir: "dev",
    from: "  if (element.link && !appState.selectedElementIds[element.id]) {",
    to: "  if (element.link && !isIframeLikeElement(element) && !appState.selectedElementIds[element.id]) {",
  },
];

if (!fs.existsSync(dist)) {
  console.warn("[patch-excalidraw] @excalidraw/excalidraw not installed, skipped");
  process.exit(0);
}
for (const p of patches) {
  const dir = path.join(dist, p.dir);
  let done = false;
  for (const name of fs.readdirSync(dir).filter((f) => f.endsWith(".js"))) {
    const file = path.join(dir, name);
    const src = fs.readFileSync(file, "utf8");
    if (src.includes(p.to)) {
      done = true;
      continue;
    }
    if (src.includes(p.from)) {
      fs.writeFileSync(file, src.replace(p.from, p.to));
      done = true;
    }
  }
  console.log(`[patch-excalidraw] ${p.dir}: ${done ? "ok" : "pattern not found (Excalidraw version changed?)"}`);
}
