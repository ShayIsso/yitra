"use client";

import * as React from "react";
import Link from "next/link";
import { DotsThreeOutlineIcon, MoonIcon, SunIcon } from "@/components/icons";
import { useTheme } from "@/components/theme";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  MORE_DESTINATIONS,
  RECONCILIATION_HREF,
  TAB_DESTINATIONS,
  badgeText,
  isActive,
} from "./nav";
import { FOCUS_RING, NavIcon, NavPill, PendingLabel, navLabelClass } from "./parts";

const TAB = cn(
  "group flex min-h-11 flex-1 flex-col items-center justify-center gap-1 rounded-lg",
  FOCUS_RING,
);

const SHEET_ROW = cn(
  "hover:bg-muted flex min-h-12 w-full items-center gap-3 rounded-lg px-2 text-start text-lead transition-colors",
  FOCUS_RING,
);

const SHEET_TILE = "grid size-9 shrink-0 place-items-center rounded-lg [&_svg]:size-5";

/**
 * Phone (< md) navigation: four tabs plus "more", which opens a bottom sheet
 * holding the remaining destinations and the theme toggle. While the sheet is
 * open, "more" is the one active tab.
 */
export function TabBar({
  pathname,
  pendingReconCount,
}: {
  pathname: string;
  pendingReconCount: number;
}) {
  const [moreOpen, setMoreOpen] = React.useState(false);
  const [lastPathname, setLastPathname] = React.useState(pathname);
  if (lastPathname !== pathname) {
    // Back/forward can change the route under an open sheet; close it with the route.
    setLastPathname(pathname);
    setMoreOpen(false);
  }

  const badge = badgeText(pendingReconCount);
  const moreActive = moreOpen || MORE_DESTINATIONS.some((d) => isActive(d.href, pathname));

  return (
    <nav
      aria-label="ניווט ראשי"
      className="bg-card ring-foreground/10 fixed inset-x-3 bottom-3 z-40 rounded-xl shadow-md ring-1 md:hidden"
    >
      <ul className="flex h-16 items-stretch px-1">
        {TAB_DESTINATIONS.map((d) => {
          const active = !moreOpen && isActive(d.href, pathname);
          const itemBadge = d.href === RECONCILIATION_HREF ? badge : null;
          return (
            <li key={d.href} className="flex flex-1">
              <Link href={d.href} aria-current={active ? "page" : undefined} className={TAB}>
                <NavPill active={active} badge={itemBadge}>
                  <NavIcon icon={d.icon} active={active} />
                </NavPill>
                <span className={navLabelClass(active)}>{d.short}</span>
                <PendingLabel badge={itemBadge} />
              </Link>
            </li>
          );
        })}
        <li className="flex flex-1">
          <MoreSheet
            open={moreOpen}
            onOpenChange={setMoreOpen}
            pathname={pathname}
            active={moreActive}
          />
        </li>
      </ul>
    </nav>
  );
}

function MoreSheet({
  open,
  onOpenChange,
  pathname,
  active,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pathname: string;
  active: boolean;
}) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger className={TAB}>
        <NavPill active={active}>
          <NavIcon icon={DotsThreeOutlineIcon} active={active} />
        </NavPill>
        <span className={navLabelClass(active)}>עוד</span>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>עוד</DialogTitle>
        </DialogHeader>
        <ul className="-mx-2 flex flex-col gap-1">
          {MORE_DESTINATIONS.map((d) => {
            const current = isActive(d.href, pathname);
            return (
              <li key={d.href}>
                <Link
                  href={d.href}
                  aria-current={current ? "page" : undefined}
                  onClick={() => onOpenChange(false)}
                  className={cn(SHEET_ROW, current && "font-semibold")}
                >
                  <span
                    className={cn(
                      SHEET_TILE,
                      current ? "bg-primary text-primary-foreground" : "bg-muted text-foreground",
                    )}
                  >
                    <NavIcon icon={d.icon} active={current} />
                  </span>
                  {d.label}
                </Link>
              </li>
            );
          })}
          <li>
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={isDark ? "מעבר למצב בהיר" : "מעבר למצב כהה"}
              className={SHEET_ROW}
            >
              <span className={cn(SHEET_TILE, "bg-muted text-foreground")}>
                {isDark ? <SunIcon /> : <MoonIcon />}
              </span>
              {isDark ? "מצב בהיר" : "מצב כהה"}
            </button>
          </li>
        </ul>
      </DialogContent>
    </Dialog>
  );
}
