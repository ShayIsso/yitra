import type { IconWeight } from "@phosphor-icons/react/dist/lib/types";

/**
 * The Phosphor icons the app may draw, each with ONLY the weights it is drawn
 * in (ADR-0015 "Icons"): regular for inactive/UI, fill for active navigation
 * and status, duotone for insight and category marks. Edit this list, then run
 *
 *   npx tsx scripts/icons/generate-phosphor.ts
 *
 * and re-check the set against the icon budget (docs/perf-baseline.md).
 */
export const PHOSPHOR_MANIFEST: Record<string, readonly IconWeight[]> = {
  // Navigation (regular inactive, fill active)
  House: ["regular", "fill", "duotone"],
  ArrowsLeftRight: ["regular", "fill", "duotone"],
  ChartPieSlice: ["regular", "fill"],
  Tray: ["regular", "fill"],
  Repeat: ["regular", "fill", "duotone"],
  ArrowsClockwise: ["regular", "fill"],
  GearSix: ["regular", "fill"],
  DotsThreeOutline: ["regular", "fill"],

  // Interface
  MagnifyingGlass: ["regular"],
  Moon: ["regular"],
  Sun: ["regular"],
  X: ["regular"],
  Command: ["regular"],
  CalendarBlank: ["regular"],
  ArrowElbowDownLeft: ["regular"],
  Info: ["regular"],
  Plus: ["regular"],
  CaretLeft: ["regular"],
  CaretRight: ["regular"],
  CaretDown: ["regular"],
  Sparkle: ["regular", "duotone"],
  Check: ["regular"],
  Trash: ["regular"],
  ShieldCheck: ["regular"],
  Key: ["regular"],
  Flask: ["regular"],

  // Categorization provider choices (off, local, external)
  Prohibit: ["regular"],
  HardDrives: ["regular"],
  Cloud: ["regular"],

  // Status
  WarningCircle: ["fill"],
  CheckCircle: ["fill"],
  Clock: ["fill"],
  Play: ["fill"],
  Pause: ["fill"],

  // Insights and stat tiles
  CalendarDots: ["duotone"],
  Fire: ["duotone"],
  TrendUp: ["duotone"],
  Gauge: ["duotone"],
  Storefront: ["duotone"],
  ArrowCircleDown: ["duotone"],
  ArrowCircleUp: ["duotone"],
  PiggyBank: ["duotone"],
  Percent: ["duotone"],
  ChartLineUp: ["duotone"],
  Bank: ["duotone"],

  // Category marks (the categories.icon column stores Lucide names; the
  // redesign maps them onto these)
  Money: ["duotone"],
  Bus: ["duotone"],
  PlusCircle: ["duotone"],
  FilmSlate: ["duotone"],
  Coffee: ["duotone"],
  CreditCard: ["duotone"],
  Gift: ["duotone"],
  HandCoins: ["duotone"],
  Heart: ["duotone"],
  Receipt: ["duotone"],
  ShoppingBag: ["duotone"],
  ShoppingCart: ["duotone"],
  ForkKnife: ["duotone"],
  DotsThreeCircle: ["duotone"],
};
