import { ArrowDownIcon, ArrowUpIcon } from "@/components/icons";
import { cn } from "@/lib/utils";
import type { CategoryChangeView } from "./trends-view";

/**
 * A month-over-month change. Direction is carried by an arrow and a sign, its
 * verdict by colour on top and, for screen readers, in words (ADR-0015: never
 * colour alone). `comparedTo` names the comparison for screen readers.
 */
export function ChangeChip({
  view,
  comparedTo,
  className,
}: {
  view: CategoryChangeView;
  comparedTo: string;
  className?: string;
}) {
  const Arrow =
    view.direction === "up" ? ArrowUpIcon : view.direction === "down" ? ArrowDownIcon : null;
  return (
    <span
      className={cn(
        "text-caption inline-flex items-center gap-0.5 font-semibold whitespace-nowrap tabular-nums",
        view.verdict === "good"
          ? "text-pos"
          : view.verdict === "bad"
            ? "text-neg"
            : "text-muted-foreground",
        className,
      )}
    >
      {Arrow && <Arrow className="size-3.5 shrink-0" />}
      <span>{view.label}</span>
      <span className="sr-only">
        {" "}
        {comparedTo}
        {view.verdict === "good" ? ", לטובה" : view.verdict === "bad" ? ", לרעה" : ""}
      </span>
    </span>
  );
}
