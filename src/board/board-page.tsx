import { useQuery } from "@tanstack/react-query";
import { TRPCClientError } from "@trpc/client";
import { Navigate, useParams } from "react-router";
import { FullSpinner } from "@/components/common";
import { useTRPC } from "@/lib/trpc";
import StatusPage from "@/pages/status";
import { BoardEditor, type BoardData } from "./editor";

/** Loads a board (by id, or by share token) and mounts the editor. */
export function BoardLoader({ id, token, embed }: { id: string; token: string | null; embed?: boolean }) {
  const trpc = useTRPC();
  const { data, error, isPending } = useQuery({ ...trpc.board.get.queryOptions({ id, token }), staleTime: Infinity, gcTime: 0, refetchOnMount: "always" });
  if (isPending) return <FullSpinner />;
  if (error) {
    const status = error instanceof TRPCClientError ? error.data?.httpStatus : 500;
    if (status === 401 && !embed) return <Navigate to={`/login?redirect=${encodeURIComponent(location.pathname)}`} replace />;
    return <StatusPage code={status === 403 ? 403 : status === 404 || status === 401 ? 404 : 500} />;
  }
  return <BoardEditor key={id} data={data as unknown as BoardData} token={token} embed={embed} />;
}

export default function BoardPage() {
  const { id } = useParams();
  return <BoardLoader id={id!} token={null} />;
}
