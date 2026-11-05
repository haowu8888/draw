import { Link } from "react-router";
import { Button } from "@/components/ui";

const TEXT = {
  403: { title: "访问被拒绝", desc: "抱歉，您没有权限访问此页面。" },
  404: { title: "页面走丢了", desc: "链接可能已失效，或者页面已被移动。请检查 URL，或者回到熟悉的地方。" },
  500: { title: "服务器错误", desc: "抱歉，服务器遇到了一些问题，请稍后再试。" },
};

export default function StatusPage({ code }: { code: 403 | 404 | 500 }) {
  const t = TEXT[code];
  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-3 p-6 text-center">
      <div className="text-7xl font-bold tracking-tight text-foreground/10">{code}</div>
      <h1 className="text-2xl font-semibold">{t.title}</h1>
      <p className="max-w-sm text-sm text-muted-foreground">{t.desc}</p>
      <Link to="/" className="mt-3">
        <Button>返回首页</Button>
      </Link>
    </div>
  );
}
