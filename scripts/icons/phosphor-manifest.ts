import type { IconWeight } from "@phosphor-icons/react/dist/lib/types";

/**
 * The Phosphor icons the app may draw, each with ONLY the weights it is drawn
 * in (ADR-0015 "Icons"): regular for inactive/UI, fill for active navigation
 * and status, duotone for insight and category marks. Edit this list, then run
 *
 *   npx tsx scripts/icons/generate-phosphor.ts
 *
 * and re-check the set against the icon budget (docs/perf-baseline.md).
 *
 * An icon's first weight is what it draws when no `weight` is passed, so a
 * weight added for a new use goes last.
 */
export const PHOSPHOR_MANIFEST: Record<string, readonly IconWeight[]> = {
  // Navigation (regular inactive, fill active)
  House: ["regular", "fill", "duotone"],
  ArrowsLeftRight: ["regular", "fill", "duotone"],
  ChartPieSlice: ["regular", "fill"],
  Tray: ["regular", "fill", "duotone"],
  Repeat: ["regular", "fill", "duotone"],
  ArrowsClockwise: ["regular", "fill"],
  GearSix: ["regular", "fill"],
  DotsThreeOutline: ["regular", "fill"],

  // Interface
  MagnifyingGlass: ["regular", "duotone"],
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
  Funnel: ["regular"],
  ListChecks: ["regular"],
  ArrowCounterClockwise: ["regular"],
  LinkSimple: ["regular"],
  Robot: ["regular"],

  // Categorization provider choices (off, local, external)
  Prohibit: ["regular"],
  HardDrives: ["regular"],
  Cloud: ["regular"],

  // Reports and subscriptions: change direction, sort, CSV download
  ArrowUp: ["regular"],
  ArrowDown: ["regular"],
  ArrowsDownUp: ["regular"],
  DownloadSimple: ["regular"],

  // Settings sections and row actions (#325)
  Tag: ["regular"],
  ListChecks: ["regular"],
  Wallet: ["regular"],
  Target: ["regular"],
  CircleHalf: ["regular"],
  Archive: ["regular"],
  LinkBreak: ["regular"],
  ClockCounterClockwise: ["regular"],
  MagicWand: ["regular"],

  // Status
  WarningCircle: ["fill"],
  CheckCircle: ["fill"],
  Clock: ["fill", "regular"],
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
  PiggyBank: ["duotone", "regular"],
  Percent: ["duotone"],
  ChartLineUp: ["duotone"],
  Bank: ["duotone", "regular"],

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
