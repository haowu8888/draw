import { Lock } from "lucide-react";
import { useEffect } from "react";
import { Tooltip } from "@/components/ui";
import { useEditor } from "./editor-context";
import { setLocked } from "./ops";

/** Dashed outline + unlock button for a clicked locked element (locked elements can't be selected). */
export function LockedHint({ ids, onClose }: { ids: string[] | null; onClose: () => void }) {
  const { api, ui } = useEditor();
  const hasSelection = ui.selectedIds.length > 0;
  useEffect(() => {
    if (ids && hasSelection) onClose();
  }, [ids, hasSelection, onClose]);
  if (!ids) return null;
  const els = api.getSceneElements().filter((e) => ids.includes(e.id) && e.locked);
  if (!els.length) return null;
  const x1 = Math.min(...els.map((e) => e.x));
  const y1 = Math.min(...els.map((e) => e.y));
  const x2 = Math.max(...els.map((e) => e.x + e.width));
  const y2 = Math.max(...els.map((e) => e.y + e.height));
  const left = (x1 + ui.scrollX) * ui.zoom - 5;
  const top = (y1 + ui.scrollY) * ui.zoom - 5;
  return (
    <>
      <div className="pointer-events-none absolute z-[4] rounded-[3px] border border-dashed border-muted-foreground/60" style={{ left, top, width: (x2 - x1) * ui.zoom + 10, height: (y2 - y1) * ui.zoom + 10 }} />
      <Tooltip content="解锁">
        <button
          type="button"
          aria-label="解锁"
          className="pointer-events-auto absolute z-[4] flex size-6 items-center justify-center rounded-md border bg-popover text-foreground shadow-xs hover:bg-accent"
          style={{ left, top: top - 30 }}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => {
            api.updateScene({ appState: { selectedElementIds: Object.fromEntries(els.map((e) => [e.id, true])) } as never, captureUpdate: "NEVER" });
            setLocked(api, false);
            onClose();
          }}
        >
          <Lock className="size-3.5" />
        </button>
      </Tooltip>
    </>
  );
}
