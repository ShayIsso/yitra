"use client";

import * as React from "react";
import Link from "next/link";
import { DotsThreeOutlineIcon } from "@/components/icons";
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
import { FOCUS_RING, NavIcon, NavPill, PendingLabel, navLabelClass, useThemeToggle } from "./parts";

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
 * open, "more" is the one highlighted tab; aria-current stays where the page is
 * (a tab, or "more" itself for pages behind it).
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
  const currentBehindMore = MORE_DESTINATIONS.find((d) => isActive(d.href, pathname)) ?? null;
  const moreActive = moreOpen || currentBehindMore !== null;

  return (
    <nav
      aria-label="ניווט ראשי"
      className="bg-card ring-foreground/10 fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-40 rounded-xl shadow-[var(--card-shadow)] ring-1 md:hidden"
    >
      <ul className="flex h-16 items-stretch px-1">
        {TAB_DESTINATIONS.map((d) => {
          const current = isActive(d.href, pathname);
          const active = current && !moreOpen;
          const itemBadge = d.href === RECONCILIATION_HREF ? badge : null;
          return (
            <li key={d.href} className="flex flex-1">
              <Link href={d.href} aria-current={current ? "page" : undefined} className={TAB}>
                <NavPill active={active} badge={itemBadge}>
                  <NavIcon icon={d.icon} active={active} />
                </NavPill>
                <span className={navLabelClass(active)}>{d.label}</span>
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
            currentPage={currentBehindMore?.label ?? null}
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
  currentPage,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pathname: string;
  active: boolean;
  /** The current page's label when it lives behind "more", so the trigger can announce it. */
  currentPage: string | null;
}) {
  const theme = useThemeToggle();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger className={TAB} aria-current={currentPage ? "page" : undefined}>
        <NavPill active={active}>
          <NavIcon icon={DotsThreeOutlineIcon} active={active} />
        </NavPill>
        <span className={navLabelClass(active)}>עוד</span>
        {currentPage && <span className="sr-only">{`, ${currentPage}`}</span>}
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
              onClick={theme.toggleTheme}
              aria-label={theme.ariaLabel}
              className={SHEET_ROW}
            >
              <span className={cn(SHEET_TILE, "bg-muted text-foreground")}>{theme.icon}</span>
              {theme.label}
            </button>
          </li>
        </ul>
      </DialogContent>
    </Dialog>
  );
}
