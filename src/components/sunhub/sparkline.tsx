import { cn } from "@/lib/cn";

type Props = {
  data: number[];
  stroke?: string;
  fill?: string;
  height?: number;
  width?: number;
  className?: string;
  showArea?: boolean;
};

/** Mini sparkline SVG sin dependencias; pensado para los KPIs del dashboard. */
export function Sparkline({
  data,
  stroke = "#16a34a",
  fill = "#16a34a",
  height = 32,
  width = 96,
  className,
  showArea = true,
}: Props) {
  if (data.length === 0) return <svg width={width} height={height} className={className} aria-hidden />;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const span = max - min || 1;
  const stepX = width / Math.max(1, data.length - 1);
  const points = data.map((v, i) => {
    const x = i * stepX;
    const y = height - ((v - min) / span) * height;
    return [x, y] as const;
  });
  const linePath = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L${(points[points.length - 1]?.[0] ?? 0).toFixed(1)},${height} L0,${height} Z`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={cn("overflow-visible", className)}
      aria-hidden
    >
      {showArea ? <path d={areaPath} fill={fill} fillOpacity={0.12} /> : null}
      <path d={linePath} fill="none" stroke={stroke} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
