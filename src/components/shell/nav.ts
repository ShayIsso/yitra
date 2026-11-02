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
  /** Rail and "more" sheet label. */
  label: string;
  /** Phone tab-bar label, where width is tight. */
  short: string;
  icon: NavGlyph;
};

export const RECONCILIATION_HREF = "/reconciliation";

/** The phone tab bar's own tabs; a fifth "more" tab opens MORE_DESTINATIONS. */
export const TAB_DESTINATIONS: readonly Destination[] = [
  { href: "/", label: "לוח בקרה", short: "בית", icon: HouseIcon },
  { href: "/transactions", label: "תנועות", short: "תנועות", icon: ArrowsLeftRightIcon },
  { href: "/reports", label: "דוחות", short: "דוחות", icon: ChartPieSliceIcon },
  { href: RECONCILIATION_HREF, label: "התאמות", short: "התאמות", icon: TrayIcon },
];

export const MORE_DESTINATIONS: readonly Destination[] = [
  { href: "/subscriptions", label: "מנויים", short: "מנויים", icon: RepeatIcon },
  { href: "/sync", label: "סנכרון", short: "סנכרון", icon: ArrowsClockwiseIcon },
  { href: "/settings", label: "הגדרות", short: "הגדרות", icon: GearSixIcon },
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
