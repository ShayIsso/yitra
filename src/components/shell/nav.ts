import type { ComponentType } from "react";
import {
  ArrowsClockwiseIcon,
  ArrowsLeftRightIcon,
  ChartPieSliceIcon,
  GearSixIcon,
  HouseIcon,
  RepeatIcon,
  TrayIcon,
  type GlyphProps,
} from "@/components/icons";

/** Nav glyphs carry both weights: regular when inactive, fill when active (ADR-0015 "Icons"). */
export type NavGlyph = ComponentType<GlyphProps<"regular" | "fill">>;

export type Destination = {
  href: string;
  label: string;
  icon: NavGlyph;
  /** Other names the command palette finds the page by, English ones included for a Latin keyboard. */
  keywords: readonly string[];
};

export const RECONCILIATION_HREF = "/reconciliation";

/** The page region the skip link and the command palette move focus to. */
export const MAIN_CONTENT_ID = "main-content";

/** The phone tab bar's own tabs; a fifth "more" tab opens MORE_DESTINATIONS. */
export const TAB_DESTINATIONS: readonly Destination[] = [
  { href: "/", label: "בית", icon: HouseIcon, keywords: ["home", "dashboard", "ראשי", "דשבורד"] },
  {
    href: "/transactions",
    label: "תנועות",
    icon: ArrowsLeftRightIcon,
    keywords: ["transactions", "הוצאות", "הכנסות"],
  },
  {
    href: "/reports",
    label: "דוחות",
    icon: ChartPieSliceIcon,
    keywords: ["reports", "דו״חות", "מגמות"],
  },
  {
    href: RECONCILIATION_HREF,
    label: "התאמות",
    icon: TrayIcon,
    keywords: ["reconciliation", "התאמה"],
  },
];

export const MORE_DESTINATIONS: readonly Destination[] = [
  {
    href: "/subscriptions",
    label: "מנויים",
    icon: RepeatIcon,
    keywords: ["subscriptions", "חיובים קבועים", "הוראות קבע"],
  },
  {
    href: "/sync",
    label: "סנכרון",
    icon: ArrowsClockwiseIcon,
    keywords: ["sync", "בנקים", "עדכון"],
  },
  {
    href: "/settings",
    label: "הגדרות",
    icon: GearSixIcon,
    keywords: ["settings", "קטגוריות", "חוקים", "יעדים", "תקציבים"],
  },
];

/** The desktop rail lists every destination. */
export const ALL_DESTINATIONS: readonly Destination[] = [...TAB_DESTINATIONS, ...MORE_DESTINATIONS];

export function isActive(href: string, pathname: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Text for the pending-reconciliation badge, or null when there is nothing to show. */
export function badgeText(count: number): string | null {
  if (count <= 0) return null;
  return count > 99 ? "99+" : String(count);
}
