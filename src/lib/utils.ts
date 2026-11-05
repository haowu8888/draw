import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import dayjs from "dayjs";

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

/** "刚刚 / 5 分钟前 / 3 小时前 / 2 天前 / MM-DD" style relative time used by board cards. */
export function relativeTime(iso: string | null | undefined) {
  if (!iso) return "";
  const t = dayjs(iso);
  const diff = Date.now() - t.valueOf();
  if (diff < 60_000) return "刚刚";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)} 天前`;
  return t.year() === dayjs().year() ? t.format("MM-DD") : t.format("YYYY-MM-DD");
}

export const formatTime = (iso: string | null | undefined, fmt = "YYYY-MM-DD HH:mm") => (iso ? dayjs(iso).format(fmt) : "-");

export function errorMessage(e: unknown, fallback = "操作失败") {
  if (e && typeof e === "object" && "message" in e && typeof (e as { message: unknown }).message === "string") return (e as { message: string }).message || fallback;
  return fallback;
}

/**
 * RFC 4122 v4 id. `crypto.randomUUID` only exists in secure contexts (HTTPS / localhost),
 * so plain-HTTP deployments fall back to `getRandomValues`, which is always available.
 */
export function uuid(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Whether the async Clipboard API can write images (secure contexts only). */
export const canWriteClipboardImage = () => typeof ClipboardItem !== "undefined" && !!navigator.clipboard?.write;

export async function copyText(text: string) {
  try {
    if (!navigator.clipboard) throw new Error("clipboard unavailable");
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  }
}
