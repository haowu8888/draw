import { ArrowRight, Code, Infinity as InfinityIcon, MessageSquare } from "lucide-react";
import { Link } from "react-router";
import { Announcement, Logo, UserAvatarMenu } from "@/components/common";
import { Button } from "@/components/ui";
import { useSession } from "@/lib/auth-client";

const FEATURES = [
  { icon: InfinityIcon, title: "无限画布", desc: "形状、图标随手画" },
  { icon: Code, title: "图表代码", desc: "Mermaid 生成图表" },
  { icon: MessageSquare, title: "评论分享", desc: "链接分享，画布评论" },
];

export default function Landing() {
  const { data } = useSession();
  return (
    <div className="flex min-h-full flex-col">
      <Announcement />
      <header className="mx-auto flex h-14 w-full max-w-[67.5rem] items-center justify-between px-6">
        <Logo />
        {data ? (
          <UserAvatarMenu />
        ) : (
          <div className="flex items-center gap-2">
            <Link to="/login">
              <Button variant="ghost" size="sm">
                登录
              </Button>
            </Link>
            <Link to="/register">
              <Button size="sm">注册</Button>
            </Link>
          </div>
        )}
      </header>
      <main className="mx-auto grid w-full max-w-[67.5rem] flex-1 items-center gap-12 px-6 py-16 md:grid-cols-[1fr_1.1fr]">
        <section>
          <h1 className="text-4xl font-bold tracking-tight md:text-5xl">把想法画清楚。</h1>
          <p className="mt-4 text-base text-muted-foreground">流程图、架构图和白板草稿，都在一张无限画布上完成。</p>
          <Link to={data ? "/user/dashboard" : "/login"} className="mt-7 inline-block">
            <Button size="lg">
              开始画图
              <ArrowRight />
            </Button>
          </Link>
          <div className="mt-12 grid grid-cols-3 gap-6">
            {FEATURES.map((f) => (
              <div key={f.title}>
                <f.icon className="size-4 text-muted-foreground" />
                <div className="mt-2 text-sm font-semibold">{f.title}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">{f.desc}</div>
              </div>
            ))}
          </div>
        </section>
        <HeroMock />
      </main>
    </div>
  );
}

/** Static illustration of the editor (flowchart, sticky note, Mermaid snippet, comment). */
function HeroMock() {
  return (
    <div className="overflow-hidden rounded-xl border bg-card shadow-[0_20px_60px_-20px_rgba(0,0,0,0.25)]">
      <div className="relative flex h-9 items-center border-b px-3">
        <span className="flex gap-1.5">
          <i className="size-2.5 rounded-full bg-[#ff5f57]" />
          <i className="size-2.5 rounded-full bg-[#febc2e]" />
          <i className="size-2.5 rounded-full bg-[#28c840]" />
        </span>
        <span className="absolute left-1/2 -translate-x-1/2 text-xs text-muted-foreground">需求流程</span>
      </div>
      <div className="relative h-[360px] bg-[radial-gradient(circle,#0000001a_1px,transparent_1px)] [background-size:16px_16px]">
        <div className="absolute top-4 left-3 flex flex-col gap-2 rounded-lg border bg-card p-1.5 shadow-sm">
          {["M4 4l7 17 2-7 7-2z", "M4 6h16v12H4z", "M12 4a8 8 0 100 16 8 8 0 000-16z", "M12 3l9 9-9 9-9-9z", "M5 19L19 5M19 5h-7M19 5v7", "M4 12h16"].map((d) => (
            <svg key={d} viewBox="0 0 24 24" className="size-4 text-neutral-500" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d={d} />
            </svg>
          ))}
        </div>
        <svg viewBox="0 0 520 360" className="absolute inset-0 size-full" fill="none" stroke="#1e1e1e" strokeWidth="1.6">
          <rect x="72" y="58" width="96" height="44" rx="22" fill="#fff" />
          <text x="120" y="85" textAnchor="middle" fontSize="13" fill="#1e1e1e" stroke="none">
            收到需求
          </text>
          <path d="M168 80h52" markerEnd="url(#ah)" />
          <path d="M268 40l46 40-46 40-46-40z" fill="#fff" />
          <rect x="216" y="34" width="104" height="92" stroke="#60a5fa" strokeWidth="1" strokeDasharray="0" fill="none" />
          {[
            [216, 34],
            [320, 34],
            [216, 126],
            [320, 126],
          ].map(([x, y]) => (
            <rect key={`${x}${y}`} x={x - 3} y={y - 3} width="6" height="6" fill="#fff" stroke="#60a5fa" strokeWidth="1" />
          ))}
          <text x="268" y="85" textAnchor="middle" fontSize="12" fill="#1e1e1e" stroke="none">
            需要评审?
          </text>
          <path d="M314 80c18 0 18-30 40-30h14" markerEnd="url(#ah)" />
          <path d="M314 80c18 0 18 34 40 34h14" markerEnd="url(#ah)" />
          <text x="334" y="46" fontSize="10" fill="#888" stroke="none">
            是
          </text>
          <text x="334" y="128" fontSize="10" fill="#888" stroke="none">
            否
          </text>
          <rect x="372" y="32" width="104" height="38" rx="4" fill="#fff" />
          <text x="424" y="56" textAnchor="middle" fontSize="12" fill="#1e1e1e" stroke="none">
            排期开发
          </text>
          <rect x="372" y="96" width="104" height="38" rx="4" fill="#fff" />
          <text x="424" y="120" textAnchor="middle" fontSize="12" fill="#1e1e1e" stroke="none">
            直接上线
          </text>
          <defs>
            <marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
              <path d="M0 0l10 5-10 5" fill="none" stroke="#1e1e1e" strokeWidth="1.4" />
            </marker>
          </defs>
        </svg>
        <div className="absolute top-[150px] left-[205px] flex items-start gap-0.5">
          <svg viewBox="0 0 16 16" className="size-4 fill-sky-400">
            <path d="M1 1l5 13 2-5 5-2z" />
          </svg>
          <span className="mt-3 rounded bg-sky-400 px-1.5 py-0.5 text-[10px] text-white">小陶</span>
        </div>
        <div className="absolute top-[200px] left-[78px] w-[124px] -rotate-3 rounded-sm bg-[#fde68a] p-3 text-xs text-[#7c4a03] shadow-md">
          <div className="font-semibold">周三评审</div>
          <ul className="mt-1.5 list-disc space-y-0.5 pl-4">
            <li>确认接口字段</li>
            <li>补充异常流程</li>
            <li>更新原型</li>
          </ul>
        </div>
        <div className="absolute top-[210px] left-[250px] rounded-lg border bg-neutral-50 px-3 py-2 font-mono text-[10px] leading-5 text-neutral-500">
          <div className="text-violet-500">flowchart LR</div>
          <div>&nbsp;&nbsp;A --&gt; B{"{评审}"}</div>
          <div>&nbsp;&nbsp;B --&gt;|是| C</div>
          <div>&nbsp;&nbsp;B --&gt;|否| D</div>
        </div>
        <div className="absolute top-[200px] left-[400px] flex flex-col items-center gap-1.5">
          <span className="flex size-6 items-center justify-center rounded-full bg-pink-400 text-[10px] text-white">林</span>
          <div className="rounded-lg border bg-white px-2.5 py-1.5 text-[11px] leading-4 shadow-sm">
            这里要加
            <br />
            超时重试
          </div>
        </div>
      </div>
    </div>
  );
}
