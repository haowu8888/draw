import { exportToBlob, exportToSvg, serializeAsJSON } from "@excalidraw/excalidraw";
import { useState } from "react";
import { toast } from "sonner";
import { Button, Checkbox, Dialog, Select } from "@/components/ui";
import { useEditor } from "./editor-context";
import { withNodeSnapshots } from "./node-overlays";
import { selectedEls } from "./ops";

type Format = "png" | "svg" | "json";
type Options = { area: "canvas" | "selection"; format: Format; scale: number; background: boolean; darkMode: boolean; embedScene: boolean };
const EXT: Record<Format, string> = { png: "png", svg: "svg", json: "excalidraw" };

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-9 items-center justify-between gap-4">
      <span className="text-sm">{label}</span>
      {children}
    </div>
  );
}

/** Export the canvas or the selection as PNG / SVG / scene JSON. */
export function ExportDialog({ scope, onClose }: { scope: "canvas" | "selection"; onClose: () => void }) {
  const { api, ui } = useEditor();
  const hasSelection = ui.selectedIds.length > 0;
  const [o, setO] = useState<Options>({ area: hasSelection ? scope : "canvas", format: "png", scale: 2, background: true, darkMode: false, embedScene: false });
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof Options>(k: K, v: Options[K]) => setO((p) => ({ ...p, [k]: v }));
  const image = o.format !== "json";

  const run = async () => {
    setBusy(true);
    try {
      const scene = o.area === "selection" ? selectedEls(api) : api.getSceneElements();
      const appState = { ...api.getAppState(), exportBackground: o.background, exportWithDarkMode: o.darkMode, exportEmbedScene: o.embedScene, exportScale: o.scale };
      let blob: Blob;
      // images get node content snapshots; scene data keeps the editable nodes
      const { elements, files } = o.format === "json" ? { elements: scene, files: api.getFiles() } : await withNodeSnapshots(scene, api.getFiles(), o.scale);
      if (o.format === "json") blob = new Blob([serializeAsJSON(elements, appState, files, "local")], { type: "application/json" });
      else if (o.format === "svg") blob = new Blob([(await exportToSvg({ elements, appState, files, exportPadding: 16 })).outerHTML], { type: "image/svg+xml" });
      else blob = await exportToBlob({ elements, appState, files, mimeType: "image/png", exportPadding: 16, getDimensions: (w: number, h: number) => ({ width: w * o.scale, height: h * o.scale, scale: o.scale }) });
      download(blob, `${o.area === "selection" ? "selection" : "canvas"}.${EXT[o.format]}`);
      onClose();
    } catch {
      toast.error("导出失败");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(v) => !v && onClose()}
      title="导出"
      className="max-w-md"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button className="bg-[var(--highlight)] text-white hover:bg-[var(--highlight)]/90" loading={busy} onClick={run}>
            导出
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-1">
        <Row label="导出范围">
          {hasSelection ? (
            <Select size="sm" className="w-auto min-w-24" value={o.area} onValueChange={(v) => set("area", v)} options={[{ value: "canvas", label: "整个画布" }, { value: "selection", label: "选中元素" }]} />
          ) : (
            <span className="px-2 text-sm">整个画布</span>
          )}
        </Row>
        <Row label="文件类型">
          <Select size="sm" className="w-auto min-w-24" value={image ? "image" : "json"} onValueChange={(v) => set("format", v === "json" ? "json" : "png")} options={[{ value: "image", label: "图片" }, { value: "json", label: "场景数据" }]} />
        </Row>
        {image && (
          <>
            <div className="my-2 h-px bg-border" />
            <Row label="图片格式">
              <Select size="sm" className="w-auto min-w-24" value={o.format} onValueChange={(v) => set("format", v as Format)} options={[{ value: "png", label: "PNG" }, { value: "svg", label: "SVG" }]} />
            </Row>
            {o.format === "png" && (
              <Row label="清晰度">
                <Select size="sm" className="w-auto min-w-24" value={String(o.scale)} onValueChange={(v) => set("scale", Number(v))} options={[{ value: "1", label: "1x" }, { value: "2", label: "2x" }, { value: "3", label: "3x" }]} />
              </Row>
            )}
            <Row label="背景">
              <Select size="sm" className="w-auto min-w-24" value={o.background ? "solid" : "transparent"} onValueChange={(v) => set("background", v === "solid")} options={[{ value: "solid", label: "纯色" }, { value: "transparent", label: "透明" }]} />
            </Row>
            <Row label="颜色模式">
              <Select size="sm" className="w-auto min-w-24" value={o.darkMode ? "dark" : "light"} onValueChange={(v) => set("darkMode", v === "dark")} options={[{ value: "light", label: "浅色" }, { value: "dark", label: "深色" }]} />
            </Row>
            <label className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
              <Checkbox checked={o.embedScene} onCheckedChange={(v) => set("embedScene", v)} />
              嵌入场景数据（导入后可继续编辑）
            </label>
          </>
        )}
      </div>
    </Dialog>
  );
}
