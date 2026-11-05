import { CaptureUpdateAction, Excalidraw, exportToBlob, newElementWith, reconcileElements, restoreElements, viewportCoordsToSceneCoords } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import type { ExcalidrawElement, OrderedExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { AppState, BinaryFileData, BinaryFiles, Collaborator, SocketId } from "@excalidraw/excalidraw/types";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { useTRPC, useTRPCClient } from "@/lib/trpc";
import { CollabClient, type CollabStatus, type Peer, type ServerMessage, type SyncElement } from "./collab";
import { CommentLayer } from "./comments";
import { elementAt } from "./context-menu";
import { constrainSandboxes } from "./node-bars";
import { NodeOverlays, withNodeSnapshots } from "./node-overlays";
import { CanvasContextMenu, type CanvasMenuHandle } from "./context-menu";
import { diagramOf } from "./diagram";
import { DiagramBadge, DiagramPanel } from "./diagram-panel";
import { loadCanvasFonts } from "./fonts";
import { LockedHint } from "./locked-hint";
import { createAutomation } from "./automation";
import type { Stack } from "./sandbox";
import { postWithProgress, UploadProgress, type UploadTask } from "./upload-progress";
import { CodeBlockEditor } from "./codeblock";
import { FrameOutlines, FrameStatusPills, focusFrameFromHash } from "./frames";
import { installActionBridge } from "./ops";
import { QuickConnect } from "./quick-connect";
import { EditorDialogs } from "./dialogs";
import { EditorContext, type DialogState, type EditorContextValue, type PanelState, type UiState } from "./editor-context";
import { LeftToolbar } from "./left-toolbar";
import { ChartDataCard } from "./chart-panel";
import { MarkdownPanel, SandboxPanel } from "./node-panels";
import { NodeEnvContext, renderNode } from "./nodes";
import type { API } from "./scene";
import { isOverlayNode, migrateNode, nodeKind, NODE_LINK_PREFIX } from "./scene";
import { SelectionBar } from "./selection-bar";
import { TopBar, ZoomMenu } from "./topbar";
import "./editor.css";

export interface BoardData {
  board: { id: string; title: string; visibility: string; shareRole: string; shareToken: string | null; creatorId: string };
  role: "owner" | "edit" | "view";
  pages: { id: string; name: string; sort: number; elements: SyncElement[]; appState: Record<string, unknown> }[];
  files: { id: string; mimeType: string; dataURL: string; createdAt: string }[];
}

export type SaveState = "saved" | "saving" | "unsaved" | "offline";

const toBinary = (f: BoardData["files"][number]) =>
  ({ id: f.id, mimeType: f.mimeType, dataURL: f.dataURL, created: Date.parse(f.createdAt) || Date.now() }) as BinaryFileData;

const restore = (els: unknown[]) => restoreElements((els as ExcalidrawElement[]).map(migrateNode), null, { refreshDimensions: false, repairBindings: true });

function mergeByVersion(base: SyncElement[], incoming: SyncElement[]) {
  const map = new Map(base.map((e) => [e.id, e]));
  for (const e of incoming) {
    const cur = map.get(e.id);
    if (!cur || e.version > cur.version || (e.version === cur.version && e.versionNonce < cur.versionNonce)) map.set(e.id, e);
  }
  return [...map.values()];
}

const qs = (token: string | null) => (token ? `?token=${encodeURIComponent(token)}` : "");

export function BoardEditor({ data, token, embed }: { data: BoardData; token: string | null; embed?: boolean }) {
  const boardId = data.board.id;
  const trpc = useTRPC();
  const client = useTRPCClient();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [api, setApi] = useState<API | null>(null);
  const [role, setRole] = useState(data.role);
  const canEdit = !embed && role !== "view";
  const [title, setTitle] = useState(data.board.title);
  const [pages, setPages] = useState(() => data.pages.map(({ id, name, sort }) => ({ id, name, sort })));
  const [pageId, setPageId] = useState(data.pages[0]?.id ?? "");
  const pageIdRef = useRef(pageId);
  pageIdRef.current = pageId;
  const [status, setStatus] = useState<CollabStatus>("connecting");
  const [save, setSave] = useState<SaveState>("saved");
  const [peers, setPeers] = useState<Peer[]>([]);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [panel, setPanel] = useState<PanelState>(null);
  const [uploads, setUploads] = useState<Record<string, UploadTask>>({});
  const [lockedIds, setLockedIds] = useState<string[] | null>(null);
  const closeLocked = useCallback(() => setLockedIds(null), []);
  const closePanel = useCallback(() => setPanel(null), []);
  const [fontsReady, setFontsReady] = useState(false);
  const menu = useRef<CanvasMenuHandle>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [commentMode, setCommentMode] = useState(false);
  const [commentFocus, setCommentFocus] = useState<{ elementId?: string; x?: number; y?: number; seq: number } | null>(null);
  const [ui, setUi] = useState<UiState>({ selectedIds: [], zoom: 1, tool: "selection", editingText: false, busy: false, selKey: "", scrollX: 0, scrollY: 0, width: 0, height: 0, offsetLeft: 0, offsetTop: 0 });

  const { data: codeEnv } = useQuery(trpc.codeStack.list.queryOptions());

  // Per-page element caches for pages that are not on screen, plus the versions already sent / received.
  const pageCache = useRef(new Map(data.pages.map((p) => [p.id, p.elements])));
  const synced = useRef(new Map<string, number>());
  const uploadedFiles = useRef(new Set(data.files.map((f) => f.id)));
  const collab = useRef<CollabClient | null>(null);
  const collaborators = useRef(new Map<SocketId, Collaborator>());
  const dirty = useRef(false);
  const namedFrames = useRef(new Set<string>());
  const coverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const initialData = useMemo(() => {
    const first = data.pages[0];
    first?.elements.forEach((e) => synced.current.set(e.id, e.version));
    return {
      elements: restore(first?.elements ?? []),
      appState: {
        viewBackgroundColor: "#ffffff",
        currentItemFontFamily: 2,
        currentItemFontSize: 24,
        currentItemBackgroundColor: "#ffffff",
        currentItemFillStyle: "solid",
        currentItemStrokeColor: "#242424",
        currentItemRoundness: "sharp",
        ...(first?.appState ?? {}),
        frameRendering: { enabled: true, name: true, outline: false, clip: true },
        collaborators: new Map(),
      } as Partial<AppState>,
      files: Object.fromEntries(data.files.map((f) => [f.id, toBinary(f)])) as BinaryFiles,
      scrollToContent: true,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------------- outgoing sync ----------------

  const flush = useCallback(() => {
    syncTimer.current = null;
    const a = api;
    const c = collab.current;
    if (!a || !c || !canEdit) return;
    const changed = a.getSceneElementsIncludingDeleted().filter((e) => synced.current.get(e.id) !== e.version);
    if (!changed.length) return;
    if (c.sendElements(pageIdRef.current, changed as unknown as SyncElement[])) {
      changed.forEach((e) => synced.current.set(e.id, e.version));
      setSave("saving");
    } else setSave("unsaved");
  }, [api, canEdit]);

  const scheduleCover = useCallback(() => {
    if (coverTimer.current) clearTimeout(coverTimer.current);
    coverTimer.current = setTimeout(async () => {
      if (!api || !canEdit) return;
      const firstId = pages[0]?.id;
      const els = firstId === pageIdRef.current ? api.getSceneElements() : restore(pageCache.current.get(firstId) ?? []).filter((e) => !e.isDeleted);
      try {
        const snap = await withNodeSnapshots(els as OrderedExcalidrawElement[], api.getFiles(), 1);
        const blob = await exportToBlob({
          elements: snap.elements as OrderedExcalidrawElement[],
          appState: { exportBackground: true, viewBackgroundColor: "#ffffff", exportWithDarkMode: false },
          files: snap.files,
          mimeType: "image/webp",
          quality: 0.82,
          exportPadding: 24,
          getDimensions: (w: number, h: number) => {
            const scale = Math.min(2, 640 / w, 360 / h) || 1;
            return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)), scale };
          },
        });
        await fetch(`/api/boards/${boardId}/cover${qs(token)}`, { method: "POST", body: blob });
        qc.invalidateQueries({ queryKey: trpc.board.pathKey() });
      } catch {
        /* cover is best effort */
      }
    }, 6000);
  }, [api, canEdit, pages, boardId, token, qc, trpc]);

  const uploadFiles = useCallback(
    async (files: BinaryFiles) => {
      const fresh = Object.values(files).filter((f) => !uploadedFiles.current.has(f.id));
      if (!fresh.length || !canEdit) return;
      fresh.forEach((f) => uploadedFiles.current.add(f.id));
      // one request per file so each image can show its own progress
      await Promise.all(
        fresh.map(async (f) => {
          const body = JSON.stringify([{ id: f.id, mimeType: f.mimeType, dataURL: f.dataURL }]);
          setUploads((u) => ({ ...u, [f.id]: { progress: 0, size: Math.round((f.dataURL.length * 3) / 4) } }));
          try {
            await postWithProgress(`/api/boards/${boardId}/files${qs(token)}`, body, (p) => setUploads((u) => (u[f.id] ? { ...u, [f.id]: { ...u[f.id], progress: p } } : u)));
            collab.current?.send({ type: "files", ids: [f.id] });
          } catch (e) {
            uploadedFiles.current.delete(f.id);
            toast.error(`上传失败（${(e as Error).message}）`);
          } finally {
            setUploads(({ [f.id]: _done, ...rest }) => rest);
          }
        }),
      );
    },
    [boardId, token, canEdit],
  );

  const fetchMissingFiles = useCallback(
    async (els: readonly { type: string; fileId?: string | null }[]) => {
      if (!api) return;
      const have = api.getFiles();
      const missing = [...new Set(els.filter((e) => e.type === "image" && e.fileId && !have[e.fileId]).map((e) => e.fileId!))];
      if (!missing.length) return;
      const params = new URLSearchParams({ ids: missing.join(",") });
      if (token) params.set("token", token);
      const res = await fetch(`/api/boards/${boardId}/files?${params}`);
      if (!res.ok) return;
      const files = (await res.json()) as BoardData["files"];
      files.forEach((f) => uploadedFiles.current.add(f.id));
      api.addFiles(files.map(toBinary));
    },
    [api, boardId, token],
  );

  const lastUi = useRef("");
  const onChange = useCallback(
    (sceneEls: readonly OrderedExcalidrawElement[], appState: AppState, files: BinaryFiles) => {
      const selectedIds = Object.keys(appState.selectedElementIds).filter((k) => appState.selectedElementIds[k]);
      const sel = new Set(selectedIds);
      const busy = !!(appState.newElement || appState.resizingElement || appState.selectedElementsAreBeingDragged || appState.editingTextElement);
      const next: UiState = {
        selectedIds,
        zoom: appState.zoom.value,
        tool: appState.activeTool.type,
        editingText: !!appState.editingTextElement,
        busy,
        selKey: sceneEls
          .filter((e) => sel.has(e.id) || ("containerId" in e && e.containerId && sel.has(e.containerId)))
          .map((e) => `${e.id}:${e.version}`)
          .join(","),
        scrollX: appState.scrollX,
        scrollY: appState.scrollY,
        width: appState.width,
        height: appState.height,
        offsetLeft: appState.offsetLeft,
        offsetTop: appState.offsetTop,
      };
      const key = JSON.stringify(next);
      if (key !== lastUi.current) {
        lastUi.current = key;
        setUi(next);
      }
      if (!api || !canEdit) return;
      if (!busy) queueMicrotask(() => constrainSandboxes(api));
      // name new frames "画框 N"
      if (!busy) {
        const unnamed = sceneEls.filter((e) => e.type === "frame" && !e.isDeleted && e.name === null && !namedFrames.current.has(e.id));
        if (unnamed.length) {
          unnamed.forEach((e) => namedFrames.current.add(e.id));
          let n = sceneEls.filter((e) => e.type === "frame" && !e.isDeleted && e.name !== null).length;
          const names = new Map(unnamed.map((e) => [e.id, `画框 ${++n}`]));
          queueMicrotask(() =>
            api.updateScene({
              elements: api.getSceneElementsIncludingDeleted().map((e) => (names.has(e.id) ? newElementWith(e, { name: names.get(e.id)! } as never) : e)),
              captureUpdate: CaptureUpdateAction.NEVER,
            }),
          );
        }
      }
      const els = api.getSceneElementsIncludingDeleted();
      if (els.some((e) => synced.current.get(e.id) !== e.version)) {
        dirty.current = true;
        if (!syncTimer.current) syncTimer.current = setTimeout(flush, 120);
        scheduleCover();
      }
      uploadFiles(files);
    },
    [api, canEdit, flush, scheduleCover, uploadFiles],
  );

  // ---------------- incoming ----------------

  const applyRemote = useCallback(
    (pid: string, incoming: SyncElement[]) => {
      incoming.forEach((e) => synced.current.set(e.id, Math.max(synced.current.get(e.id) ?? 0, e.version)));
      if (!api || pid !== pageIdRef.current) {
        pageCache.current.set(pid, mergeByVersion(pageCache.current.get(pid) ?? [], incoming));
        return;
      }
      const local = api.getSceneElementsIncludingDeleted();
      const merged = reconcileElements(local, restore(incoming) as never, api.getAppState());
      api.updateScene({ elements: merged, captureUpdate: CaptureUpdateAction.NEVER });
      // keep remote versions as the synced baseline so they are not echoed back
      merged.forEach((e) => {
        const r = incoming.find((x) => x.id === e.id);
        if (r && e.version === r.version) synced.current.set(e.id, e.version);
      });
      fetchMissingFiles(incoming as never);
    },
    [api, fetchMissingFiles],
  );

  /** Re-reads the whole board from the server (after restore / reconnect / page changes). */
  const reloadFromServer = useCallback(
    async (replace = false) => {
      if (!api) return;
      const fresh = (await client.board.get.query({ id: boardId, token })) as unknown as BoardData;
      setPages(fresh.pages.map(({ id, name, sort }) => ({ id, name, sort })));
      setTitle(fresh.board.title);
      api.addFiles(fresh.files.filter((f) => !api.getFiles()[f.id]).map(toBinary));
      fresh.files.forEach((f) => uploadedFiles.current.add(f.id));
      for (const p of fresh.pages) {
        if (p.id === pageIdRef.current) {
          if (replace) {
            api.updateScene({ elements: restore(p.elements), captureUpdate: CaptureUpdateAction.NEVER });
            p.elements.forEach((e) => synced.current.set(e.id, e.version));
          } else applyRemote(p.id, p.elements);
        } else pageCache.current.set(p.id, replace ? p.elements : mergeByVersion(pageCache.current.get(p.id) ?? [], p.elements));
      }
      if (!fresh.pages.some((p) => p.id === pageIdRef.current) && fresh.pages[0]) switchPageRef.current?.(fresh.pages[0].id);
    },
    [api, client, boardId, token, applyRemote],
  );

  const updateCollaborators = useCallback(() => {
    api?.updateScene({ collaborators: new Map(collaborators.current) });
  }, [api]);

  const onMessage = useCallback(
    (msg: ServerMessage) => {
      switch (msg.type) {
        case "update":
          applyRemote(msg.pageId, msg.elements);
          break;
        case "ack":
          break;
        case "presence": {
          setPeers(msg.peers);
          for (const id of collaborators.current.keys()) if (!msg.peers.some((p) => p.clientId === id)) collaborators.current.delete(id);
          updateCollaborators();
          break;
        }
        case "pointer": {
          if (msg.pageId !== pageIdRef.current) {
            if (collaborators.current.delete(msg.clientId as SocketId)) updateCollaborators();
            break;
          }
          collaborators.current.set(msg.clientId as SocketId, {
            pointer: msg.pointer,
            button: msg.button,
            selectedElementIds: msg.selectedElementIds,
            username: msg.name,
            color: { background: msg.color, stroke: msg.color },
            id: msg.clientId,
          } as Collaborator);
          updateCollaborators();
          break;
        }
        case "leave":
          collaborators.current.delete(msg.clientId as SocketId);
          updateCollaborators();
          break;
        case "files":
          fetchMissingFiles(api?.getSceneElements() ?? []);
          break;
        case "reload":
          reloadFromServer(true);
          break;
        case "pages":
          reloadFromServer();
          break;
        case "comments":
          qc.invalidateQueries({ queryKey: trpc.comment.list.queryKey() });
          break;
        case "versions":
          qc.invalidateQueries({ queryKey: trpc.boardVersion.pathKey() });
          break;
        case "meta":
          setTitle(msg.title);
          break;
        case "role":
          setRole(msg.role as BoardData["role"]);
          toast.info(msg.role === "view" ? "分享权限已改为可查看" : "分享权限已改为可编辑");
          break;
        case "share":
          if (role === "owner") qc.invalidateQueries({ queryKey: trpc.board.get.queryKey() });
          break;
        case "revoked":
          toast.error("分享已关闭，链接已失效");
          navigate("/", { replace: true });
          break;
        case "deleted":
          toast.error("画布已被删除");
          navigate("/user/boards", { replace: true });
          break;
        case "error":
          toast.error(msg.message);
          break;
      }
    },
    [applyRemote, updateCollaborators, fetchMissingFiles, reloadFromServer, api, qc, trpc, navigate, role],
  );
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  // Embeds show the whole drawing.
  useEffect(() => {
    if (api && embed) requestAnimationFrame(() => api.scrollToContent(undefined, { fitToViewport: true, viewportZoomFactor: 0.9 }));
  }, [api, embed]);

  useEffect(() => {
    if (!api || embed) return;
    const c = new CollabClient(boardId, token, {
      onMessage: (m) => onMessageRef.current(m),
      onStatus: (s) => {
        setStatus(s);
        if (s === "offline") setSave((v) => (dirty.current ? "offline" : v));
      },
      onPending: (pending) => {
        if (!pending) dirty.current = false;
        setSave(pending ? "saving" : "saved");
      },
      onReconnect: () => {
        // Resend everything not yet acknowledged by resetting the baseline, then pull missed changes.
        synced.current.clear();
        reloadFromServer().then(() => flushRef.current());
      },
    });
    collab.current = c;
    c.send({ type: "page", pageId: pageIdRef.current });
    return () => {
      c.close();
      collab.current = null;
    };
  }, [api, boardId, token, embed, reloadFromServer]);
  const flushRef = useRef(flush);
  flushRef.current = flush;

  useEffect(() => {
    if (status === "online") collab.current?.send({ type: "page", pageId });
  }, [status, pageId]);

  // Warn before leaving with unsynced edits.
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => {
      if (save === "unsaved" || save === "offline" || save === "saving") e.preventDefault();
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [save]);

  // ---------------- pages ----------------

  const switchPage = useCallback(
    (id: string) => {
      if (!api || id === pageIdRef.current) return;
      flush();
      pageCache.current.set(pageIdRef.current, api.getSceneElementsIncludingDeleted() as unknown as SyncElement[]);
      const els = pageCache.current.get(id) ?? [];
      els.forEach((e) => synced.current.set(e.id, Math.max(synced.current.get(e.id) ?? 0, e.version)));
      pageIdRef.current = id;
      setPageId(id);
      collaborators.current.clear();
      api.updateScene({ elements: restore(els), collaborators: new Map(), appState: { selectedElementIds: {} } as never, captureUpdate: CaptureUpdateAction.NEVER });
      api.history.clear();
      fetchMissingFiles(els as never);
      requestAnimationFrame(() => api.scrollToContent(undefined, { fitToViewport: false }));
      collab.current?.send({ type: "page", pageId: id });
    },
    [api, flush, fetchMissingFiles],
  );
  const switchPageRef = useRef(switchPage);
  switchPageRef.current = switchPage;

  const pointerThrottle = useRef(0);
  const onPointerUpdate = useCallback(
    (p: { pointer: { x: number; y: number; tool: "pointer" | "laser" }; button: "down" | "up" }) => {
      const now = Date.now();
      if (now - pointerThrottle.current < 50 || !collab.current?.online) return;
      pointerThrottle.current = now;
      collab.current.send({ type: "pointer", pageId: pageIdRef.current, pointer: p.pointer, button: p.button, selectedElementIds: api?.getAppState().selectedElementIds });
    },
    [api],
  );

  useEffect(() => {
    let alive = true;
    loadCanvasFonts().then(() => alive && setFontsReady(true));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const root = canvasRef.current?.querySelector<HTMLElement>(".excalidraw");
    if (api && root) installActionBridge(api, root);
    if (api) setTimeout(() => focusFrameFromHash(api), 300);
  }, [api]);

  // window.draw automation API (for scripts / AI agents driving the canvas)
  const stacksRef = useRef<Stack[]>([]);
  stacksRef.current = (codeEnv?.stacks ?? []) as Stack[];
  useEffect(() => {
    if (!api || embed) return;
    const w = window as unknown as { draw?: unknown };
    w.draw = createAutomation(api, { readOnly: !canEdit, stacks: () => stacksRef.current });
    return () => {
      delete w.draw;
    };
  }, [api, embed, canEdit]);

  // ---------------- keyboard ----------------

  useEffect(() => {
    if (embed) return;
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, [contenteditable=true], .cm-editor") || ui.editingText || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "c" && !e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        setCommentMode((m) => !m);
      }
      if (e.key === "Escape" && commentMode) setCommentMode(false);
    };
    window.addEventListener("keydown", h, true);
    return () => window.removeEventListener("keydown", h, true);
  }, [embed, ui.editingText, commentMode]);

  // Double-click on a diagram opens its code panel (instead of entering the group).
  /** Opens the editor of an overlay node (markdown / chart / code block / link card). */
  const openOverlayNode = useCallback(
    (el: { id: string; customData?: Record<string, unknown> }) => {
      const kind = nodeKind(el as never);
      if (kind === "link") window.open(String(el.customData?.url ?? ""), "_blank", "noopener,noreferrer");
      else if (!canEdit) return;
      else if (kind === "markdown") setPanel({ kind: "markdown", id: el.id });
      else if (kind === "chart") setPanel({ kind: "chart", id: el.id });
      else if (kind === "codeblock") setPanel({ kind: "codeblock", id: el.id });
    },
    [canEdit],
  );

  const onDoubleClickCapture = useCallback(
    (e: React.MouseEvent) => {
      if (!api || !(e.target instanceof HTMLCanvasElement)) return;
      // overlay nodes are rectangles: stop Excalidraw from adding a text label inside them
      const p = viewportCoordsToSceneCoords(e, api.getAppState());
      const hit = elementAt(api, p.x, p.y);
      if (hit && isOverlayNode(hit) && !hit.locked) {
        e.preventDefault();
        e.stopPropagation();
        openOverlayNode(hit);
        return;
      }
      if (!canEdit) return;
      const sel = api.getSceneElements().filter((x) => api.getAppState().selectedElementIds[x.id]);
      const d = sel[0] && diagramOf(sel[0]);
      if (d && sel.every((x) => diagramOf(x)?.id === d.id) && !api.getAppState().editingGroupId) {
        e.preventDefault();
        e.stopPropagation();
        setPanel({ kind: "diagram", id: d.id });
      }
    },
    [api, canEdit, openOverlayNode],
  );

  // Enter on a selected overlay node opens its editor (instead of editing a text label).
  // A click on a link inside an already selected markdown node opens it.
  useEffect(() => {
    if (!api || embed) return;
    const root = canvasRef.current;
    const single = () => {
      const s = api.getAppState().selectedElementIds;
      const sel = api.getSceneElements().filter((e) => s[e.id]);
      return sel.length === 1 && isOverlayNode(sel[0]) ? sel[0] : null;
    };
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || (e.target as HTMLElement).closest("input, textarea, [contenteditable=true], .cm-editor")) return;
      const el = single();
      if (!el) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      openOverlayNode(el);
    };
    const click = (e: MouseEvent) => {
      if (!(e.target instanceof HTMLCanvasElement)) return;
      const el = single();
      if (!el || nodeKind(el) !== "markdown") return;
      const links = root?.querySelectorAll<HTMLAnchorElement>(`[data-node-overlay="${CSS.escape(el.id)}"] a[href]`) ?? [];
      for (const a of links) {
        const r = a.getBoundingClientRect();
        if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
          const href = a.getAttribute("href") ?? "";
          if (!href.startsWith("#")) window.open(href, "_blank", "noopener,noreferrer");
          return;
        }
      }
    };
    window.addEventListener("keydown", key, true);
    root?.addEventListener("click", click, true);
    return () => {
      window.removeEventListener("keydown", key, true);
      root?.removeEventListener("click", click, true);
    };
  }, [api, embed, openOverlayNode]);

  // Clicking a locked element (outside the current selection) shows the unlock hint.
  const onPointerDownCapture = useCallback(
    (e: React.PointerEvent) => {
      if (!api || !canEdit || e.button !== 0 || e.shiftKey || !(e.target instanceof HTMLCanvasElement) || api.getAppState().activeTool.type !== "selection") return;
      const p = viewportCoordsToSceneCoords(e, api.getAppState());
      const hit = elementAt(api, p.x, p.y);
      if (!hit?.locked) return setLockedIds(null);
      const g = hit.groupIds.at(-1);
      setLockedIds(g ? api.getSceneElements().filter((x) => x.groupIds.includes(g)).map((x) => x.id) : [hit.id]);
    },
    [api, canEdit],
  );

  // Our own context menu replaces Excalidraw's.
  const onContextMenuCapture = useCallback(
    (e: React.MouseEvent) => {
      if (!api || embed || !(e.target instanceof HTMLCanvasElement)) return;
      e.preventDefault();
      e.stopPropagation();
      menu.current?.open(e);
    },
    [api, embed],
  );

  // Double-click on a custom node opens its editor.
  const onDoubleClick = useCallback(() => {
    if (!api || !canEdit) return;
    const sel = api.getSceneElements().filter((e) => api.getAppState().selectedElementIds[e.id]);
    if (sel.length !== 1) return;
    const el = sel[0];
    const kind = nodeKind(el as never);
    if (kind === "markdown") setPanel({ kind: "markdown", id: el.id });
    else if (kind === "code") setPanel({ kind: "sandbox", id: el.id });
    else if (kind === "chart") setPanel({ kind: "chart", id: el.id });
    else if (kind === "codeblock") setPanel({ kind: "codeblock", id: el.id });
    else if (diagramOf(el)) setPanel({ kind: "diagram", id: diagramOf(el)!.id });
    else if ((el.customData as { mermaid?: string } | undefined)?.mermaid) {
      const group = el.groupIds[0];
      const ids = api.getSceneElements().filter((e) => group && e.groupIds.includes(group)).map((e) => e.id);
      setDialog({ kind: "mermaid", elementIds: ids.length ? ids : [el.id], code: (el.customData as { mermaid: string }).mermaid });
    }
  }, [api, canEdit]);

  const ctx: EditorContextValue | null = api
    ? {
        api,
        boardId,
        token,
        pageId,
        canEdit,
        role,
        ui,
        openDialog: setDialog,
        panel,
        setPanel,
        commentMode,
        setCommentMode,
        focusComment: (o) => setCommentFocus({ ...o, seq: Date.now() }),
      }
    : null;

  const fit = useCallback(
    (id: string, height: number) => {
      const el = api?.getSceneElements().find((e) => e.id === id);
      if (!api || !el || Math.abs(el.height - height) < 1) return;
      api.updateScene({ elements: api.getSceneElementsIncludingDeleted().map((e) => (e.id === id ? newElementWith(e, { height }) : e)), captureUpdate: CaptureUpdateAction.NEVER });
    },
    [api],
  );
  const nodeEnv = useMemo(
    () => ({ stacks: (codeEnv?.stacks ?? []) as never, fonts: (codeEnv?.fonts ?? []) as never, boardId, token, fit: canEdit ? fit : undefined }),
    [codeEnv, boardId, token, canEdit, fit],
  );

  return (
    <NodeEnvContext.Provider value={nodeEnv}>
      <div
        className={`board-editor ${embed ? "is-embed" : ""} ${commentMode ? "is-commenting" : ""}`}
        data-tool={commentMode ? "comment" : ui.tool}
        data-frame-selection={ui.selectedIds.length > 0 && api && ui.selectedIds.every((id) => api.getSceneElements().find((e) => e.id === id)?.type === "frame") ? "" : undefined}
        onDoubleClick={onDoubleClick}
      >
        {!embed && ctx && (
          <EditorContext.Provider value={ctx}>
            <TopBar
              title={title}
              onTitle={setTitle}
              board={data.board}
              pages={pages}
              pageId={pageId}
              onSwitchPage={switchPage}
              onPagesChanged={() => reloadFromServer()}
              status={status}
              save={save}
              peers={peers}
            />
          </EditorContext.Provider>
        )}
        <div className="board-canvas" ref={canvasRef} onDoubleClickCapture={onDoubleClickCapture} onContextMenuCapture={onContextMenuCapture} onPointerDownCapture={onPointerDownCapture}>
          <NodeOverlays api={api} root={canvasRef.current} />
          {fontsReady && (
          <Excalidraw
            excalidrawAPI={setApi}
            initialData={initialData}
            onChange={onChange}
            onPointerUpdate={onPointerUpdate}
            isCollaborating={!embed}
            viewModeEnabled={!canEdit}
            langCode="zh-CN"
            name={title}
            aiEnabled={false}
            handleKeyboardGlobally
            UIOptions={{
              canvasActions: { changeViewBackgroundColor: false, clearCanvas: false, export: false, loadScene: false, saveToActiveFile: false, saveAsImage: false, toggleTheme: false },
              tools: { image: true },
            }}
            validateEmbeddable={(link) => (link.startsWith(NODE_LINK_PREFIX) || /^https?:\/\//.test(link) ? true : undefined)}
            renderEmbeddable={(el) => renderNode(el)}
            onLinkOpen={(el, e) => {
              // custom nodes carry an internal marker link — never navigate to it
              if (nodeKind(el as never)) e.preventDefault();
            }}
          />
          )}
          {ctx && !embed && (
            <EditorContext.Provider value={ctx}>
              <FrameOutlines />
              <UploadProgress uploads={uploads} />
              {canEdit && <LockedHint ids={lockedIds} onClose={closeLocked} />}
              <FrameStatusPills />
              {canEdit && <QuickConnect />}
              {canEdit && <DiagramBadge />}
              <LeftToolbar />
              <ZoomMenu />
              {canEdit && <SelectionBar />}
              <CommentLayer focus={commentFocus} />
              {panel?.kind === "diagram" && canEdit && <DiagramPanel key={panel.id} id={panel.id} onClose={() => setPanel(null)} onSwitch={(id) => setPanel({ kind: "diagram", id })} />}
              {panel?.kind === "codeblock" && canEdit && <CodeBlockEditor key={panel.id} id={panel.id} onClose={closePanel} />}
              {panel?.kind === "chart" && canEdit && ui.selectedIds.includes(panel.id) && <ChartDataCard id={panel.id} onClose={() => setPanel(null)} />}
              {panel?.kind === "markdown" && canEdit && <MarkdownPanel key={panel.id} id={panel.id} onClose={() => setPanel(null)} onSwitch={(id) => setPanel({ kind: "markdown", id })} />}
              {panel?.kind === "sandbox" && canEdit && <SandboxPanel key={panel.id} id={panel.id} onClose={() => setPanel(null)} onSwitch={(id) => setPanel({ kind: "sandbox", id })} />}
              <EditorDialogs dialog={dialog} onClose={() => setDialog(null)} />
              <CanvasContextMenu
                ref={menu}
                api={api!}
                readOnly={!canEdit}
                actions={{
                  addComment: (p) => setCommentFocus({ x: p.x, y: p.y, seq: Date.now() }),
                  insertMedia: () => api?.setActiveTool({ type: "image", insertOnCanvasDirectly: true } as never),
                  openExport: (scope) => setDialog({ kind: "export", scope }),
                }}
              />
            </EditorContext.Provider>
          )}
        </div>
      </div>
    </NodeEnvContext.Provider>
  );
}
