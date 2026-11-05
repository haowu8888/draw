import interLatinExt from "@fontsource-variable/inter/files/inter-latin-ext-wght-normal.woff2?url";
import interLatin from "@fontsource-variable/inter/files/inter-latin-wght-normal.woff2?url";

// Excalidraw's "Helvetica" (font id 2, the clean font) is a local font; serving Inter under that
// family name makes the canvas render it the same everywhere. CJK falls back to the system sans.
const LATIN = "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD";
const LATIN_EXT = "U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF";

let faces: FontFace[] | null = null;

function register() {
  if (faces || typeof document === "undefined" || !("fonts" in document)) return faces ?? [];
  faces = [
    new FontFace("Helvetica", `url(${interLatin}) format("woff2")`, { weight: "100 900", unicodeRange: LATIN }),
    new FontFace("Helvetica", `url(${interLatinExt}) format("woff2")`, { weight: "100 900", unicodeRange: LATIN_EXT }),
  ];
  for (const f of faces) document.fonts.add(f);
  return faces;
}

/** Registers the canvas fonts and waits (bounded) for the Latin face, so text is measured with it. */
export async function loadCanvasFonts(timeout = 1500) {
  const [latin] = register();
  if (!latin) return;
  await Promise.race([latin.load().catch(() => undefined), new Promise((r) => setTimeout(r, timeout))]);
}
