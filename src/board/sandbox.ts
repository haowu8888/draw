import { transform } from "sucrase";

export interface StackLibrary {
  id: string;
  name: string;
  globalName: string | null;
  modules: string | null;
  files: { url: string; type: "js" | "css" }[];
  builtin: boolean;
}

export interface Stack {
  id: string;
  key: string;
  name: string;
  description: string | null;
  runtime: "html" | "react" | "vue";
  starter: string | null;
  prompt: string | null;
  enabled: boolean;
  libraries: StackLibrary[];
}

export interface FontInfo {
  family: string;
  category: string;
  css: string | null;
  url: string | null;
}

const abs = (u: string) => (u.startsWith("/") ? location.origin + u : u);

function moduleMap(stack: Stack) {
  const map: Record<string, string> = {};
  for (const lib of stack.libraries) {
    if (!lib.globalName || !lib.modules) continue;
    for (const m of lib.modules.split(",").map((s) => s.trim()).filter(Boolean)) map[m] = lib.globalName;
  }
  return map;
}

export const importableModules = (stack: Stack) => Object.keys(moduleMap(stack));

/** Extracts the blocks of a Vue single-file component. */
function parseSfc(code: string) {
  const tpl = code.match(/<template[^>]*>([\s\S]*)<\/template>/);
  const script = code.match(/<script[^>]*>([\s\S]*?)<\/script>/);
  const styles = [...code.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]);
  return { template: tpl?.[1] ?? "", script: script?.[1] ?? "export default {}", styles };
}

const compile = (src: string) => transform(src, { transforms: ["typescript", "jsx", "imports"], production: true, jsxRuntime: "classic" }).code;

/** Builds the srcdoc for a code-display node. Runs in an iframe with sandbox="allow-scripts" (opaque origin). */
export function buildSrcDoc(stack: Stack, code: string, fonts: FontInfo[]) {
  const origin = location.origin;
  const cdn = "https://cdn.jsdelivr.net";
  const csp = [
    "default-src 'none'",
    `script-src 'unsafe-inline' 'unsafe-eval' ${origin} ${cdn}`,
    `style-src 'unsafe-inline' ${origin} ${cdn}`,
    `font-src ${origin} ${cdn} data:`,
    `img-src ${origin} data: blob: https:`,
    "media-src data: blob:",
    "connect-src 'none'",
    "form-action 'none'",
  ].join("; ");
  const css = stack.libraries.flatMap((l) => l.files.filter((f) => f.type === "css")).map((f) => `<link rel="stylesheet" href="${abs(f.url)}">`);
  const js = stack.libraries.flatMap((l) => l.files.filter((f) => f.type === "js")).map((f) => `<script src="${abs(f.url)}"></script>`);
  const fontCss = fonts
    .map((f) => f.css ?? (f.url ? `@import url("${abs(f.url)}");` : ""))
    .join("\n")
    .replace(/url\((['"]?)(\/[^)'"]+)\1\)/g, (_m, q, p) => `url(${q}${origin}${p}${q})`);
  const errorUi = `<script>
  (function(){
    function show(msg){
      var d=document.getElementById("__err");
      if(!d){d=document.createElement("pre");d.id="__err";d.style.cssText="position:fixed;left:0;right:0;bottom:0;margin:0;max-height:40%;overflow:auto;background:#fef2f2;color:#b91c1c;font:12px/1.5 ui-monospace,monospace;padding:8px 10px;border-top:1px solid #fecaca;z-index:2147483647;white-space:pre-wrap";document.documentElement.appendChild(d);}
      d.textContent=String(msg);
    }
    window.__showError=show;
    window.addEventListener("error",function(e){show(e.message||e.error)});
    window.addEventListener("unhandledrejection",function(e){show(e.reason&&e.reason.message||e.reason)});
    ["alert","confirm","prompt"].forEach(function(k){window[k]=function(){console.warn(k+" 在沙箱中不可用，改用页面内的提示或弹层")}});
  })();
  </script>`;
  const head = `<meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><meta name="viewport" content="width=device-width,initial-scale=1">
  <style>html,body{margin:0;height:100%;font-family:system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif}${fontCss}</style>${errorUi}${css.join("")}${js.join("")}`;

  if (stack.runtime === "html") {
    return `<!doctype html><html><head>${head}</head><body>${code}</body></html>`;
  }

  const mods = moduleMap(stack);
  const requireFn = `var __mods=${JSON.stringify(mods)};function require(n){if(n in __mods){var g=window[__mods[n]];if(!g)throw new Error("模块「"+n+"」加载失败");return g.default&&Object.keys(g).length===1?g:g}throw new Error("当前技术方案未提供该模块：「"+n+"」，只能 import："+Object.keys(__mods).join(", "))}`;

  let body: string;
  try {
    if (stack.runtime === "react") {
      const compiled = compile(code);
      body = `<div id="root"></div><script>${requireFn}
      try{var module={exports:{}},exports=module.exports;(function(require,module,exports,React){${compiled}\n})(require,module,exports,window.React);
      var App=module.exports.default||module.exports;
      if(typeof App!=="function")throw new Error("需要 export default 一个组件");
      class B extends React.Component{constructor(p){super(p);this.state={e:null}}static getDerivedStateFromError(e){return{e:e}}componentDidCatch(e){setTimeout(function(){throw e})}render(){return this.state.e?null:this.props.children}}
      ReactDOM.createRoot(document.getElementById("root")).render(React.createElement(B,null,React.createElement(App)));
      }catch(e){window.__showError(e&&e.stack||e)}</script>`;
    } else {
      const sfc = parseSfc(code);
      const compiled = compile(sfc.script);
      const plugins = stack.libraries.filter((l) => l.globalName && l.globalName !== "Vue").map((l) => l.globalName!);
      body = `<style>${sfc.styles.join("\n")}</style><div id="app"></div><script type="text/x-template" id="__tpl">${sfc.template}</script><script>${requireFn}
      try{var module={exports:{}},exports=module.exports;(function(require,module,exports){${compiled}\n})(require,module,exports);
      var C=module.exports.default||module.exports;C.template="#__tpl";
      var app=Vue.createApp(C);
      app.config.errorHandler=function(e){window.__showError(e&&e.stack||e)};
      ${JSON.stringify(plugins)}.forEach(function(g){var p=window[g];if(!p)return;if(typeof p.install==="function")app.use(p);else Object.keys(p).forEach(function(k){if(p[k]&&(p[k].render||p[k].setup))app.component(k,p[k])})});
      app.mount("#app");
      }catch(e){window.__showError(e&&e.stack||e)}</script>`;
    }
  } catch (e) {
    body = `<script>window.__showError(${JSON.stringify(`编译失败：${(e as Error).message}`)})</script>`;
  }
  return `<!doctype html><html><head>${head}</head><body>${body}</body></html>`;
}

/** Prompt users copy into any AI chat to generate code for this stack. */
export function buildPrompt(stack: Stack, fonts: FontInfo[], size: { width: number; height: number }, need: string, current?: string) {
  if (stack.prompt?.trim()) return [stack.prompt.trim(), current ? `\n## 当前代码\n\`\`\`\n${current}\n\`\`\`` : "", `\n## 我的需求\n${need}`].join("\n");
  const kind = { html: "一段 HTML 页面片段", react: "一个 React 组件", vue: "一个 Vue 3 单文件组件" }[stack.runtime];
  const mods = importableModules(stack);
  const libs = stack.libraries.map((l) => `${l.name}${l.globalName ? `（全局变量 ${l.globalName}）` : ""}`);
  return [
    `请写${kind}，它会在一个隔离的沙箱 iframe 中运行（技术方案：${stack.name}）。`,
    ``,
    `## 运行环境`,
    `- 节点尺寸 ${size.width}×${size.height} 像素，按这个尺寸设计布局：宽度不超过 ${size.width}px，不要出现横向滚动；字号、间距按这个宽度取值`,
    `- 已加载的库：${libs.join("、") || "无"}`,
    stack.libraries.some((l) => l.name.includes("Tailwind")) ? `- 已内置 Tailwind CSS v4：样式优先用 Tailwind 工具类，尽量不写 <style>` : "",
    stack.runtime === "html" ? `- 只输出 <body> 内的 HTML 片段；交互写在内联 <script> 中（document.getElementById(...).addEventListener(...)），也可用 onclick 属性` : "",
    stack.runtime === "react" ? `- 写法：export default 一个函数组件（可用 JSX 与 TypeScript）；挂载由运行环境完成，不要调用 ReactDOM.createRoot / render` : "",
    stack.runtime === "vue" ? `- 写法：单文件组件：<template> + <script>（export default { setup() { ... return {...} } }）+ 可选 <style>；模板里用到的变量 / 方法都要从 setup 返回` : "",
    mods.length ? `- 只能 import 这些模块：${mods.join(", ")}，其他任何模块都会报错` : `- 不能 import 任何模块`,
    fonts.length ? `- 可用字体（必须写完整的字体名）：${fonts.map((f) => `\`${f.family}\``).join("、")}` : "",
    ``,
    `## 限制（沙箱会拦截）`,
    `- 不能联网：禁止 fetch / XMLHttpRequest / WebSocket，数据用代码内的模拟数据`,
    `- 不能引入外部脚本、样式或 CDN`,
    `- 不能使用 localStorage / sessionStorage / cookie`,
    `- 不能使用 alert / confirm / prompt / window.open / 表单提交，改用页面内的提示或弹层`,
    ``,
    `## 代码格式`,
    `只输出完整代码（一个代码块），不要解释`,
    current ? `\n## 当前代码\n\`\`\`\n${current}\n\`\`\`` : "",
    `\n## 我的需求\n${need || "（在这里描述你想要的效果）"}`,
  ]
    .filter((l) => l !== "")
    .join("\n");
}
