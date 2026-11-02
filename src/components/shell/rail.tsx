"use client";

import Link from "next/link";
import { MoonIcon, SunIcon } from "@/components/icons";
import { useTheme } from "@/components/theme";
import { cn } from "@/lib/utils";
import { ALL_DESTINATIONS, RECONCILIATION_HREF, badgeText, isActive } from "./nav";
import { BrandLink, FOCUS_RING, NavIcon, NavPill, PendingLabel, navLabelClass } from "./parts";

const RAIL_ITEM = cn(
  "group flex min-h-14 w-18 flex-col items-center justify-center gap-1 rounded-lg py-1",
  FOCUS_RING,
);

/** Desktop (md+) navigation: every destination as icon + visible label, never icon-only. */
export function Rail({
  pathname,
  pendingReconCount,
}: {
  pathname: string;
  pendingReconCount: number;
}) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";
  const badge = badgeText(pendingReconCount);

  return (
    <nav
      aria-label="ניווט ראשי"
      className="bg-card fixed inset-y-0 start-0 z-30 hidden w-22 flex-col items-center gap-4 overflow-y-auto border-e py-4 md:flex"
    >
      <BrandLink stacked />
      <ul className="flex flex-col items-center gap-1">
        {ALL_DESTINATIONS.map((d) => {
          const active = isActive(d.href, pathname);
          const itemBadge = d.href === RECONCILIATION_HREF ? badge : null;
          return (
            <li key={d.href}>
              <Link href={d.href} aria-current={active ? "page" : undefined} className={RAIL_ITEM}>
                <NavPill active={active} badge={itemBadge}>
                  <NavIcon icon={d.icon} active={active} />
                </NavPill>
                <span className={navLabelClass(active)}>{d.label}</span>
                <PendingLabel badge={itemBadge} />
              </Link>
            </li>
          );
        })}
      </ul>
      <button
        type="button"
        onClick={toggleTheme}
        aria-label={isDark ? "מעבר למצב בהיר" : "מעבר למצב כהה"}
        className={cn(RAIL_ITEM, "mt-auto")}
      >
        <NavPill active={false}>{isDark ? <SunIcon /> : <MoonIcon />}</NavPill>
        <span className={navLabelClass(false)}>{isDark ? "מצב בהיר" : "מצב כהה"}</span>
      </button>
    </nav>
  );
}
