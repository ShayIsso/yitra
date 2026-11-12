import { cn } from "@/lib/utils";
import { sparklinePath, sparklinePoints } from "./trends-view";

const W = 100;
const H = 32;
const PAD = 4;

/**
 * A twelve-month trend line, oldest month at the right edge (RTL time axis),
 * with a dot on the month the home screen shows. Decorative: every figure it
 * draws is also on screen as text or in the chart's labels.
 */
export function Sparkline({
  values,
  highlight,
  className,
}: {
  values: readonly (number | null)[];
  highlight: number;
  className?: string;
}) {
  const point = sparklinePoints(values, W, H, PAD)[highlight] ?? null;
  return (
    <span aria-hidden className={cn("text-muted-foreground relative block", className)}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="size-full overflow-visible"
      >
        <path
          d={sparklinePath(values, W, H, PAD)}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      {point && (
        // A positioned dot, not an SVG circle: the stretched viewBox would draw an ellipse.
        <span
          className="bg-foreground ring-card absolute size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2"
          style={{ left: `${point.x}%`, top: `${(point.y / H) * 100}%` }}
        />
      )}
    </span>
  );
}
