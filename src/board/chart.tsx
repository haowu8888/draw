import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";

export type ChartType = "bar" | "line" | "area" | "scatter" | "pie" | "donut" | "radar" | "quadrant";

export interface ChartConfig {
  type: ChartType;
  title?: string;
  subtitle?: string;
  labels: string[];
  series: { name: string; data: number[] }[];
  palette: string;
  legend: "top" | "bottom" | "right" | "none";
  stacked?: boolean;
  horizontal?: boolean;
  dataLabels?: boolean;
  smooth?: boolean;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  abbreviate?: boolean;
  showTotal?: boolean;
  /** quadrant chart: axis names + quadrant titles */
  quadrant?: { x: string; y: string; names: [string, string, string, string] };
}

export const CHART_TYPES: { value: ChartType; label: string }[] = [
  { value: "bar", label: "柱状图" },
  { value: "line", label: "折线图" },
  { value: "area", label: "面积图" },
  { value: "scatter", label: "散点图" },
  { value: "pie", label: "饼图" },
  { value: "donut", label: "环形图" },
  { value: "radar", label: "雷达图" },
  { value: "quadrant", label: "象限图" },
];

export const CHART_ICONS: Record<ChartType, string> = {
  bar: "M4 20V10M10 20V4M16 20v-7M2 20h20",
  line: "M3 17l6-6 4 4 8-8M2 21h20",
  area: "M3 17l6-6 4 4 8-8v12H3z",
  scatter: "M5 18h.01M9 12h.01M14 15h.01M17 8h.01M20 5h.01M3 21h18",
  pie: "M12 3v9h9a9 9 0 11-9-9z",
  donut: "M12 3a9 9 0 109 9h-5a4 4 0 11-4-4z",
  radar: "M12 3l9 6.5-3.5 10.5h-11L3 9.5zM12 8l4 3-1.5 5h-5L8 11z",
  quadrant: "M12 3v18M3 12h18M7 7h.01M17 7h.01M7 17h.01M17 17h.01",
};

export const PALETTES: Record<string, { label: string; colors: string[] }> = {
  default: { label: "默认", colors: ["#4f7cff", "#22c3a6", "#ffb020", "#ff6b6b", "#8b5cf6", "#14b8a6", "#f472b6", "#64748b"] },
  blue: { label: "单色蓝", colors: ["#1e40af", "#2563eb", "#3b82f6", "#60a5fa", "#93c5fd", "#bfdbfe"] },
  cool: { label: "冷色", colors: ["#0ea5e9", "#06b6d4", "#14b8a6", "#6366f1", "#8b5cf6", "#3b82f6"] },
  warm: { label: "暖色", colors: ["#ef4444", "#f97316", "#f59e0b", "#eab308", "#ec4899", "#e11d48"] },
  business: { label: "商务", colors: ["#1f2937", "#2563eb", "#9ca3af", "#0f766e", "#b45309", "#7c3aed"] },
  fresh: { label: "清新", colors: ["#34d399", "#60a5fa", "#fbbf24", "#f472b6", "#a78bfa", "#2dd4bf"] },
  gray: { label: "灰度", colors: ["#111827", "#374151", "#6b7280", "#9ca3af", "#d1d5db", "#e5e7eb"] },
};

export function defaultChart(type: ChartType): ChartConfig {
  if (type === "pie" || type === "donut")
    return { type, title: "流量来源", labels: ["搜索", "直接访问", "社交媒体", "广告"], series: [{ name: "占比", data: [42, 26, 18, 14] }], palette: "default", legend: "right", suffix: "%", showTotal: type === "donut" };
  if (type === "radar")
    return { type, title: "方案对比", labels: ["性能", "易用", "生态", "成本", "上手"], series: [{ name: "方案 A", data: [80, 65, 90, 60, 70] }, { name: "方案 B", data: [70, 85, 60, 80, 90] }], palette: "default", legend: "bottom" };
  if (type === "scatter")
    return { type, title: "价格与销量", labels: ["10", "20", "30", "40", "50", "60"], series: [{ name: "产品 A", data: [120, 200, 150, 80, 70, 110] }, { name: "产品 B", data: [60, 100, 180, 140, 90, 160] }], palette: "default", legend: "top" };
  if (type === "quadrant")
    return {
      type,
      title: "需求优先级",
      labels: ["方案 A", "方案 B", "方案 C", "方案 D", "方案 E"],
      series: [
        { name: "价值", data: [80, 30, 65, 20, 50] },
        { name: "投入", data: [30, 25, 75, 70, 50] },
      ],
      palette: "default",
      legend: "none",
      quadrant: { x: "投入", y: "价值", names: ["高价值 低投入", "高价值 高投入", "低价值 低投入", "低价值 高投入"] },
    };
  return {
    type,
    title: "收入与支出",
    labels: ["1月", "2月", "3月", "4月", "5月", "6月"],
    series: [
      { name: "收入", data: [120, 132, 101, 134, 190, 230] },
      { name: "支出", data: [80, 92, 91, 104, 120, 140] },
    ],
    palette: "default",
    legend: "top",
    smooth: true,
  };
}

export function formatValue(v: number, c: Pick<ChartConfig, "prefix" | "suffix" | "decimals" | "abbreviate">) {
  let n = v;
  let unit = "";
  if (c.abbreviate) {
    if (Math.abs(n) >= 1e8) [n, unit] = [n / 1e8, "亿"];
    else if (Math.abs(n) >= 1e4) [n, unit] = [n / 1e4, "万"];
  }
  const s = c.decimals != null ? n.toFixed(c.decimals) : String(Math.round(n * 100) / 100);
  return `${c.prefix ?? ""}${s}${unit}${c.suffix ?? ""}`;
}

export function ChartView({ config }: { config: ChartConfig }) {
  const colors = PALETTES[config.palette]?.colors ?? PALETTES.default.colors;
  const fmt = (v: unknown) => formatValue(Number(v), config);
  const rows = config.labels.map((label, i) => Object.fromEntries([["label", label], ...config.series.map((s) => [s.name, s.data[i] ?? 0])]));
  const legend =
    config.legend === "none" ? null : (
      <Legend
        verticalAlign={config.legend === "right" ? "middle" : config.legend}
        align={config.legend === "right" ? "right" : "center"}
        layout={config.legend === "right" ? "vertical" : "horizontal"}
        iconType="circle"
        iconSize={8}
        wrapperStyle={{ fontSize: 12 }}
      />
    );
  const axisProps = { tick: { fontSize: 11, fill: "#6b7280" }, axisLine: { stroke: "#e5e7eb" }, tickLine: false };
  const grid = <CartesianGrid strokeDasharray="3 3" stroke="#eef0f3" vertical={false} />;
  const tooltip = <Tooltip formatter={fmt} contentStyle={{ fontSize: 12, borderRadius: 8 }} />;
  const margin = { top: 8, right: 16, bottom: 4, left: 0 };

  let chart: React.ReactElement;
  switch (config.type) {
    case "pie":
    case "donut": {
      const data = config.labels.map((name, i) => ({ name, value: config.series[0]?.data[i] ?? 0 }));
      const total = data.reduce((s, d) => s + d.value, 0);
      chart = (
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" innerRadius={config.type === "donut" ? "55%" : 0} outerRadius="80%" paddingAngle={config.type === "donut" ? 2 : 0} isAnimationActive={false}
            label={config.dataLabels ? (p: { value: number }) => fmt(p.value) : undefined}>
            {data.map((_, i) => (
              <Cell key={i} fill={colors[i % colors.length]} stroke="#fff" />
            ))}
          </Pie>
          {config.type === "donut" && config.showTotal && (
            <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle" style={{ fontSize: 18, fontWeight: 600, fill: "#111827" }}>
              {fmt(total)}
            </text>
          )}
          {tooltip}
          {legend}
        </PieChart>
      );
      break;
    }
    case "radar":
      chart = (
        <RadarChart data={rows} outerRadius="70%">
          <PolarGrid stroke="#e5e7eb" />
          <PolarAngleAxis dataKey="label" tick={{ fontSize: 11, fill: "#6b7280" }} />
          <PolarRadiusAxis tick={false} axisLine={false} />
          {config.series.map((s, i) => (
            <Radar key={s.name} name={s.name} dataKey={s.name} stroke={colors[i % colors.length]} fill={colors[i % colors.length]} fillOpacity={0.2} isAnimationActive={false} />
          ))}
          {tooltip}
          {legend}
        </RadarChart>
      );
      break;
    case "scatter":
      chart = (
        <ScatterChart margin={margin}>
          {grid}
          <XAxis type="number" dataKey="x" name="x" {...axisProps} />
          <YAxis type="number" dataKey="y" name="y" {...axisProps} tickFormatter={fmt} width={48} />
          <ZAxis range={[60, 60]} />
          {config.series.map((s, i) => (
            <Scatter key={s.name} name={s.name} data={config.labels.map((l, j) => ({ x: Number(l) || j, y: s.data[j] ?? 0 }))} fill={colors[i % colors.length]} isAnimationActive={false} />
          ))}
          {tooltip}
          {legend}
        </ScatterChart>
      );
      break;
    case "quadrant": {
      const q = config.quadrant ?? { x: "x", y: "y", names: ["", "", "", ""] };
      const pts = config.labels.map((name, i) => ({ name, x: config.series[1]?.data[i] ?? 0, y: config.series[0]?.data[i] ?? 0 }));
      chart = (
        <ScatterChart margin={{ top: 16, right: 24, bottom: 16, left: 0 }}>
          <XAxis type="number" dataKey="x" domain={[0, 100]} name={q.x} {...axisProps} label={{ value: q.x, position: "insideBottomRight", offset: -4, fontSize: 11 }} />
          <YAxis type="number" dataKey="y" domain={[0, 100]} name={q.y} {...axisProps} width={36} label={{ value: q.y, angle: -90, position: "insideLeft", fontSize: 11 }} />
          <ReferenceLine x={50} stroke="#cbd5e1" />
          <ReferenceLine y={50} stroke="#cbd5e1" />
          <ReferenceLine x={25} stroke="none" label={{ value: q.names[0], position: "insideTop", fontSize: 11, fill: "#94a3b8" }} />
          <ReferenceLine x={75} stroke="none" label={{ value: q.names[1], position: "insideTop", fontSize: 11, fill: "#94a3b8" }} />
          <ReferenceLine x={25} stroke="none" label={{ value: q.names[2], position: "insideBottom", fontSize: 11, fill: "#94a3b8" }} />
          <ReferenceLine x={75} stroke="none" label={{ value: q.names[3], position: "insideBottom", fontSize: 11, fill: "#94a3b8" }} />
          <Scatter data={pts} fill={colors[0]} isAnimationActive={false}>
            <LabelList dataKey="name" position="right" style={{ fontSize: 11, fill: "#374151" }} />
          </Scatter>
          <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
        </ScatterChart>
      );
      break;
    }
    case "line":
    case "area": {
      const C = config.type === "line" ? LineChart : AreaChart;
      chart = (
        <C data={rows} margin={margin}>
          {grid}
          <XAxis dataKey="label" {...axisProps} />
          <YAxis {...axisProps} tickFormatter={fmt} width={48} />
          {config.series.map((s, i) =>
            config.type === "line" ? (
              <Line key={s.name} dataKey={s.name} type={config.smooth ? "monotone" : "linear"} stroke={colors[i % colors.length]} strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false}>
                {config.dataLabels && <LabelList dataKey={s.name} position="top" formatter={fmt} style={{ fontSize: 10 }} />}
              </Line>
            ) : (
              <Area key={s.name} dataKey={s.name} type={config.smooth ? "monotone" : "linear"} stroke={colors[i % colors.length]} fill={colors[i % colors.length]} fillOpacity={0.2} stackId={config.stacked ? "s" : undefined} isAnimationActive={false}>
                {config.dataLabels && <LabelList dataKey={s.name} position="top" formatter={fmt} style={{ fontSize: 10 }} />}
              </Area>
            ),
          )}
          {tooltip}
          {legend}
        </C>
      );
      break;
    }
    default:
      chart = (
        <BarChart data={rows} margin={margin} layout={config.horizontal ? "vertical" : "horizontal"} barCategoryGap="25%">
          <CartesianGrid strokeDasharray="3 3" stroke="#eef0f3" vertical={!!config.horizontal} horizontal={!config.horizontal} />
          {config.horizontal ? (
            <>
              <XAxis type="number" {...axisProps} tickFormatter={fmt} />
              <YAxis type="category" dataKey="label" {...axisProps} width={56} />
            </>
          ) : (
            <>
              <XAxis dataKey="label" {...axisProps} />
              <YAxis {...axisProps} tickFormatter={fmt} width={48} />
            </>
          )}
          {config.series.map((s, i) => (
            <Bar key={s.name} dataKey={s.name} fill={colors[i % colors.length]} radius={config.stacked ? 0 : [4, 4, 0, 0]} stackId={config.stacked ? "s" : undefined} isAnimationActive={false}>
              {config.dataLabels && <LabelList dataKey={s.name} position={config.horizontal ? "right" : "top"} formatter={fmt} style={{ fontSize: 10 }} />}
            </Bar>
          ))}
          {tooltip}
          {legend}
        </BarChart>
      );
  }

  return (
    <div className="flex size-full flex-col bg-white p-3">
      {(config.title || config.subtitle) && (
        <div className="mb-1 px-1">
          {config.title && <div className="text-sm font-semibold text-neutral-900">{config.title}</div>}
          {config.subtitle && <div className="text-xs text-neutral-500">{config.subtitle}</div>}
        </div>
      )}
      <div className="min-h-0 flex-1">
        <ResponsiveContainer width="100%" height="100%">
          {chart}
        </ResponsiveContainer>
      </div>
    </div>
  );
}
