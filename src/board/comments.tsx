import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, MoreHorizontal, RotateCcw, Send, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { Avatar, avatarColor, Button, Menu, MenuItem } from "@/components/ui";
import { useSession } from "@/lib/auth-client";
import { useTRPC } from "@/lib/trpc";
import { cn, errorMessage, relativeTime } from "@/lib/utils";
import { useEditor } from "./editor-context";

type Draft = { x: number; y: number; elementId?: string };

export function CommentLayer({ focus }: { focus: { elementId?: string; x?: number; y?: number; seq: number } | null }) {
  const { api, ui, boardId, token, pageId, commentMode, setCommentMode, role } = useEditor();
  const trpc = useTRPC();
  const { data: session } = useSession();
  const { data: comments } = useQuery(trpc.comment.list.queryOptions({ boardId, token }));
  const [draft, setDraft] = useState<Draft | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    if (focus && focus.x != null && focus.y != null) {
      setOpenId(null);
      setDraft({ x: focus.x, y: focus.y, elementId: focus.elementId });
    }
  }, [focus]);

  const toView = (x: number, y: number) => ({ left: (x + ui.scrollX) * ui.zoom, top: (y + ui.scrollY) * ui.zoom });
  const elements = api.getSceneElements();
  const anchor = (c: { x: number | null; y: number | null; elementId: string | null }) => {
    const el = c.elementId ? elements.find((e) => e.id === c.elementId) : null;
    return el ? { x: el.x + el.width, y: el.y } : { x: c.x ?? 0, y: c.y ?? 0 };
  };

  const threads = useMemo(() => (comments ?? []).filter((c) => !c.parentId && (c.pageId === pageId || !c.pageId)), [comments, pageId]);
  const visible = threads.filter((t) => !t.resolved || t.id === openId);

  return (
    <>
      {commentMode && (
        <div
          className="absolute inset-0 z-[5] cursor-crosshair"
          onPointerDown={(e) => {
            // keep the browser from moving focus away from the composer that opens below
            e.preventDefault();
            const r = e.currentTarget.getBoundingClientRect();
            const x = (e.clientX - r.left) / ui.zoom - ui.scrollX;
            const y = (e.clientY - r.top) / ui.zoom - ui.scrollY;
            setOpenId(null);
            setDraft({ x, y });
          }}
          onWheel={(e) => {
            // keep canvas scrolling while in comment mode
            const s = api.getAppState();
            api.updateScene({ appState: { scrollX: s.scrollX - e.deltaX / s.zoom.value, scrollY: s.scrollY - e.deltaY / s.zoom.value } as never });
          }}
        />
      )}
      <div className="pointer-events-none absolute inset-0 z-[6] overflow-hidden">
        {visible.map((t) => {
          const p = toView(anchor(t).x, anchor(t).y);
          const replies = (comments ?? []).filter((c) => c.parentId === t.id);
          return (
            <div key={t.id} className="pointer-events-auto absolute" style={{ left: p.left, top: p.top, transform: "translate(-4px, -100%)" }}>
              <button
                aria-label="评论"
                className={cn(
                  "flex size-7 items-center justify-center rounded-full rounded-bl-none border-2 border-white text-[10px] font-semibold shadow-md transition-transform hover:scale-110",
                  t.resolved && "opacity-60",
                )}
                style={{ background: avatarColor(t.userId) }}
                onClick={() => {
                  setDraft(null);
                  setOpenId(openId === t.id ? null : t.id);
                }}
              >
                {(t.userName ?? "?").slice(0, 1).toUpperCase()}
                {replies.length > 0 && <span className="absolute -top-1.5 -right-1.5 rounded-full bg-neutral-800 px-1 text-[9px] text-white">{replies.length + 1}</span>}
              </button>
              {openId === t.id && (
                <Thread
                  thread={t}
                  replies={replies}
                  canModerate={role === "owner"}
                  onClose={() => setOpenId(null)}
                />
              )}
            </div>
          );
        })}
        {draft && (
          <div className="pointer-events-auto absolute" style={{ ...toView(draft.x, draft.y), transform: "translate(-4px, -100%)" }}>
            <span className="flex size-7 items-center justify-center rounded-full rounded-bl-none border-2 border-white bg-neutral-800 shadow-md" />
            <div className="absolute top-0 left-9 w-72 rounded-xl border bg-popover p-3 shadow-lg">
              {session ? (
                <Composer
                  autoFocus
                  placeholder="添加评论，Enter 发送"
                  onCancel={() => setDraft(null)}
                  onSubmit={async (body, create) => {
                    await create({ boardId, token, pageId, body, x: draft.x, y: draft.y, elementId: draft.elementId });
                    setDraft(null);
                    setCommentMode(false);
                  }}
                />
              ) : (
                <div className="text-sm">
                  <Link to={`/login?redirect=${encodeURIComponent(location.pathname)}`} className="font-medium underline">
                    登录后评论
                  </Link>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

type CommentRow = { id: string; userId: string; userName: string | null; userImage: string | null; body: string; createdAt: string; resolved: number };

function Thread({ thread, replies, canModerate, onClose }: { thread: CommentRow; replies: CommentRow[]; canModerate: boolean; onClose: () => void }) {
  const { boardId, token, pageId } = useEditor();
  const trpc = useTRPC();
  const qc = useQueryClient();
  const { data: session } = useSession();
  const refresh = () => qc.invalidateQueries({ queryKey: trpc.comment.list.queryKey() });
  const update = useMutation(trpc.comment.update.mutationOptions({ onSuccess: refresh, onError: (e) => toast.error(errorMessage(e)) }));
  const remove = useMutation(trpc.comment.remove.mutationOptions({ onSuccess: refresh, onError: (e) => toast.error(errorMessage(e)) }));
  const all = [thread, ...replies];
  return (
    <div className="absolute top-0 left-9 flex max-h-[60vh] w-80 flex-col rounded-xl border bg-popover shadow-lg" onPointerDown={(e) => e.stopPropagation()}>
      <div className="flex items-center gap-1 border-b px-3 py-2">
        <span className="text-sm font-medium">评论</span>
        {thread.resolved ? <span className="text-xs text-success-foreground">· 已解决</span> : null}
        <div className="ml-auto flex items-center">
          {session && (
            <button
              className="tool-btn size-7"
              aria-label={thread.resolved ? "重新打开" : "标记为已解决"}
              title={thread.resolved ? "重新打开" : "标记为已解决"}
              onClick={() => update.mutate({ id: thread.id, token, resolved: !thread.resolved })}
            >
              {thread.resolved ? <RotateCcw /> : <Check />}
            </button>
          )}
          <button className="tool-btn size-7" aria-label="关闭" onClick={onClose}>
            <X />
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        {all.map((c) => (
          <div key={c.id} className="group flex gap-2 py-2">
            <Avatar name={c.userName} src={c.userImage} className="size-6 text-[10px]" color={avatarColor(c.userId)} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 text-xs">
                <span className="font-medium">{c.userName ?? "已注销用户"}</span>
                <span className="text-muted-foreground">{relativeTime(c.createdAt)}</span>
                {(c.userId === session?.user.id || canModerate) && (
                  <Menu
                    align="end"
                    trigger={
                      <button className="ml-auto hidden rounded p-0.5 group-hover:block hover:bg-accent" aria-label="更多">
                        <MoreHorizontal className="size-3.5" />
                      </button>
                    }
                  >
                    <MenuItem destructive onClick={() => remove.mutate({ id: c.id, token })}>
                      <Trash2 />
                      删除
                    </MenuItem>
                  </Menu>
                )}
              </div>
              <div className="mt-0.5 text-sm break-words whitespace-pre-wrap">{c.body}</div>
            </div>
          </div>
        ))}
      </div>
      <div className="border-t p-2">
        {session ? (
          <Composer placeholder="回复…" onSubmit={(body, create) => create({ boardId, token, pageId, body, parentId: thread.id })} />
        ) : (
          <Link to={`/login?redirect=${encodeURIComponent(location.pathname)}`} className="text-sm underline">
            登录后评论
          </Link>
        )}
      </div>
    </div>
  );
}

type CreateInput = { boardId: string; token: string | null; pageId: string; body: string; parentId?: string; x?: number; y?: number; elementId?: string };

function Composer({ placeholder, autoFocus, onSubmit, onCancel }: { placeholder: string; autoFocus?: boolean; onSubmit: (body: string, create: (i: CreateInput) => Promise<unknown>) => Promise<unknown>; onCancel?: () => void }) {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const create = useMutation(trpc.comment.create.mutationOptions({ onSuccess: () => qc.invalidateQueries({ queryKey: trpc.comment.list.queryKey() }) }));
  const [body, setBody] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (autoFocus) requestAnimationFrame(() => ref.current?.focus());
  }, [autoFocus]);
  const send = async () => {
    const b = body.trim();
    if (!b) return;
    try {
      await onSubmit(b, (i) => create.mutateAsync(i));
      setBody("");
    } catch (e) {
      toast.error(errorMessage(e, "评论失败"));
    }
  };
  return (
    <div className="flex items-end gap-1.5">
      <textarea
        ref={ref}
        rows={2}
        value={body}
        placeholder={placeholder}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            send();
          }
          if (e.key === "Escape") onCancel?.();
          e.stopPropagation();
        }}
        className="min-h-9 flex-1 resize-none rounded-lg border border-input bg-card px-2.5 py-1.5 text-sm outline-none focus:border-ring"
      />
      <Button size="icon-sm" aria-label="发送 · Shift+Enter 换行" loading={create.isPending} disabled={!body.trim()} onClick={send}>
        {!create.isPending && <Send />}
      </Button>
    </div>
  );
}
