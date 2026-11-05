import { useEditor } from "./editor-context";

export type UploadTask = { progress: number | null; size: number };

const R = 15;
const CIRC = 2 * Math.PI * R;
const formatSize = (n: number) => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1048576).toFixed(1)} MB`);

/** POSTs JSON reporting upload progress (0–1); rejects with the server's error text. */
export function postWithProgress(url: string, body: string, onProgress: (p: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.setRequestHeader("content-type", "application/json");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve();
      let msg = String(xhr.status);
      try {
        msg = JSON.parse(xhr.responseText).error ?? msg;
      } catch {
        /* not json */
      }
      reject(new Error(msg));
    };
    xhr.onerror = () => reject(new Error("网络错误"));
    xhr.send(body);
  });
}

/** Dimmed overlay with a progress ring on images whose file is still uploading. */
export function UploadProgress({ uploads }: { uploads: Record<string, UploadTask> }) {
  const { api, ui } = useEditor();
  const ids = Object.keys(uploads);
  if (!ids.length) return null;
  const images = api.getSceneElements().filter((e) => e.type === "image" && e.fileId && uploads[e.fileId]);
  return (
    <>
      {images.map((el) => {
        const task = uploads[(el as { fileId: string }).fileId];
        const pct = task.progress === null ? null : Math.round(task.progress * 100);
        const w = el.width * ui.zoom;
        const h = el.height * ui.zoom;
        return (
          <div key={el.id} className="pointer-events-none absolute z-[3] flex flex-col items-center justify-center gap-1.5 overflow-hidden bg-black/45 text-white" style={{ left: (el.x + ui.scrollX) * ui.zoom, top: (el.y + ui.scrollY) * ui.zoom, width: w, height: h }}>
            {w > 60 && h > 60 && (
              <>
                <svg viewBox="0 0 36 36" className={pct === null ? "size-8 animate-spin" : "size-8"}>
                  <circle cx="18" cy="18" r={R} fill="none" stroke="currentColor" strokeOpacity="0.3" strokeWidth="3" />
                  <circle
                    cx="18"
                    cy="18"
                    r={R}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeDasharray={CIRC}
                    strokeDashoffset={CIRC * (1 - (pct === null || pct >= 100 ? 25 : pct) / 100)}
                    transform="rotate(-90 18 18)"
                    className="transition-[stroke-dashoffset] duration-200"
                  />
                </svg>
                <span className="text-xs tabular-nums">
                  {pct === null ? "上传中" : pct >= 100 ? "处理中" : `上传中 ${pct}%`}
                  {h > 110 && ` · ${formatSize(task.size)}`}
                </span>
              </>
            )}
          </div>
        );
      })}
    </>
  );
}
