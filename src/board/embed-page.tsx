import { useParams } from "react-router";
import { FullSpinner } from "@/components/common";
import StatusPage from "@/pages/status";
import { BoardLoader } from "./board-page";
import { useShareToken } from "./share-page";

export default function EmbedPage() {
  const { token } = useParams();
  const { data, isPending, error } = useShareToken(token!);
  if (isPending) return <FullSpinner />;
  if (error || !data) return <StatusPage code={404} />;
  return <BoardLoader id={data.id} token={token!} embed />;
}
