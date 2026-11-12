"use client";

import { usePathname } from "next/navigation";
import { PaletteLauncher } from "./palette/launcher";
import { BrandLink } from "./parts";
import { Rail } from "./rail";
import { TabBar } from "./tab-bar";

/**
 * The dashboard's frame (#315): a labelled icon rail from `md` up, a bottom tab
 * bar below it. DOM order is the focus order: skip link, rail (desktop) or
 * brand header (phone), page, tab bar.
 *
 * `<main>` clips sideways overflow so a too-wide page can never widen the
 * layout viewport and push the fixed tab bar off-screen. `clip`, not `hidden`
 * or `auto`: it does not make `<main>` a scroll container, so `position:
 * sticky` inside pages keeps sticking to the window.
 */
export function AppShell({
  pendingReconCount,
  children,
}: {
  pendingReconCount: number;
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#main-content"
        className="bg-card text-foreground ring-ring fixed start-3 top-3 z-50 -translate-y-24 rounded-lg px-4 py-3 font-medium ring-2 outline-none focus:translate-y-0"
      >
        דילוג לתוכן
      </a>
      <Rail pathname={pathname} pendingReconCount={pendingReconCount} />
      <header className="flex h-14 items-center px-3 md:hidden">
        <BrandLink />
      </header>
      <main
        id="main-content"
        tabIndex={-1}
        className="min-w-0 flex-1 overflow-x-clip px-4 pt-2 pb-28 outline-none sm:px-6 md:ms-22 md:p-8"
      >
        {/* Keyed by pathname so the entrance replays per page, not per search-param change. */}
        <div key={pathname} className="page-enter">
          {children}
        </div>
      </main>
      <TabBar pathname={pathname} pendingReconCount={pendingReconCount} />
      <PaletteLauncher />
    </div>
  );
}
