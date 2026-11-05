import { createContext, useContext } from "react";
import type { API } from "./scene";

export type DialogState =
  | { kind: "mermaid"; elementIds?: string[]; code?: string }
  | { kind: "web"; mode?: "card" | "embed" }
  | { kind: "video" }
  | { kind: "export"; scope: "canvas" | "selection" }
  | null;

/** Right-side editing panel. */
export type PanelState = { kind: "diagram" | "markdown" | "sandbox" | "chart" | "codeblock"; id: string } | null;

export interface UiState {
  selectedIds: string[];
  zoom: number;
  tool: string;
  editingText: boolean;
  /** Dragging / resizing / drawing — overlays hide meanwhile. */
  busy: boolean;
  /** Changes whenever a selected element changes (ids + versions). */
  selKey: string;
  scrollX: number;
  scrollY: number;
  width: number;
  height: number;
  offsetLeft: number;
  offsetTop: number;
}

export interface EditorContextValue {
  api: API;
  boardId: string;
  token: string | null;
  pageId: string;
  canEdit: boolean;
  role: string;
  ui: UiState;
  openDialog: (d: DialogState) => void;
  panel: PanelState;
  setPanel: (p: PanelState) => void;
  commentMode: boolean;
  setCommentMode: (on: boolean) => void;
  focusComment: (opts: { elementId?: string; x?: number; y?: number }) => void;
}

export const EditorContext = createContext<EditorContextValue | null>(null);

export function useEditor() {
  const ctx = useContext(EditorContext);
  if (!ctx) throw new Error("useEditor outside EditorContext");
  return ctx;
}
