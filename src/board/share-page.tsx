import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router";
import { FullSpinner } from "@/components/common";
import { useTRPC } from "@/lib/trpc";
import StatusPage from "@/pages/status";
import { BoardLoader } from "./board-page";

export function useShareToken(token: string) {
  const trpc = useTRPC();
  return useQuery({ ...trpc.board.byToken.queryOptions({ token }), retry: false });
}

export default function SharePage() {
  const { token } = useParams();
  const { data, isPending, error } = useShareToken(token!);
  if (isPending) return <FullSpinner />;
  if (error || !data) return <StatusPage code={404} />;
  // Inside an iframe a share link behaves like an embed.
  return <BoardLoader id={data.id} token={token!} embed={window.self !== window.top} />;
}
