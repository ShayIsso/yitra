import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";
import { MoonIcon, SunIcon } from "@/components/icons";
import { useTheme } from "@/components/theme";
import { cn } from "@/lib/utils";
import type { NavGlyph } from "./nav";

export const FOCUS_RING = "outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

/**
 * The icon "pill" shared by the rail and the tab bar: filled teal when active,
 * plain otherwise. A pending count rides on its corner in coral, the attention
 * colour (ADR-0015).
 */
export function NavPill({
  active,
  badge = null,
  children,
}: {
  active: boolean;
  badge?: string | null;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "relative grid h-8 w-14 shrink-0 place-items-center rounded-full transition-colors [&_svg]:size-5",
        active
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground group-hover:bg-muted group-hover:text-foreground",
      )}
    >
      {children}
      {badge && (
        <span
          aria-hidden="true"
          className="bg-attention text-attention-foreground ring-card text-caption absolute -end-1 -top-1.5 grid h-5 min-w-5 place-items-center rounded-full px-1 leading-none font-semibold tabular-nums ring-2"
        >
          {badge}
        </span>
      )}
    </span>
  );
}

/** Active navigation draws the fill weight, inactive the regular (ADR-0015 "Icons"). */
export function NavIcon({ icon: Icon, active }: { icon: NavGlyph; active: boolean }) {
  return <Icon weight={active ? "fill" : "regular"} />;
}

export function navLabelClass(active: boolean) {
  return cn(
    "text-caption leading-none",
    active ? "text-foreground font-semibold" : "text-muted-foreground group-hover:text-foreground",
  );
}

/** Screen-reader text that carries the badge count, since the badge itself is aria-hidden. */
export function PendingLabel({ badge }: { badge: string | null }) {
  if (!badge) return null;
  return <span className="sr-only">{`, ${badge} ממתינות`}</span>;
}

/** The theme toggle names the theme it switches TO, as the old sidebar toggle did. */
export function useThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";
  return {
    toggleTheme,
    icon: isDark ? <SunIcon /> : <MoonIcon />,
    label: isDark ? "מצב בהיר" : "מצב כהה",
    ariaLabel: isDark ? "מעבר למצב בהיר" : "מעבר למצב כהה",
  };
}

export function BrandLink({ stacked = false }: { stacked?: boolean }) {
  return (
    <Link
      href="/"
      className={cn(
        "flex min-h-11 items-center rounded-lg font-bold tracking-tight",
        stacked ? "text-caption w-18 flex-col justify-center gap-1" : "text-lead gap-2 px-1",
        FOCUS_RING,
      )}
    >
      <BrandMark className={stacked ? "h-6 w-auto" : "h-5 w-auto"} />
      Yitra
    </Link>
  );
}
