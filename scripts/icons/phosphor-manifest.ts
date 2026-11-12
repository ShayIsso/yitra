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
  CalendarBlank: ["regular"],
  ArrowElbowDownLeft: ["regular"],
  Info: ["regular"],
  Plus: ["regular"],
  CaretLeft: ["regular"],
  CaretRight: ["regular"],
  CaretDown: ["regular"],
  CaretUp: ["regular"],
  Sparkle: ["regular", "duotone"],
  Check: ["regular"],
  Trash: ["regular"],
  ShieldCheck: ["regular"],
  ShieldWarning: ["regular"],
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

  // Status
  WarningCircle: ["fill"],
  CheckCircle: ["fill"],
  Clock: ["fill"],
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

  // Category marks. The categories.icon column stores a name: Lucide names
  // from before the redesign (the seeded taxonomy and the old picker) and the
  // picker's Phosphor names since; src/components/category-icon.tsx maps both.
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
  Car: ["duotone"],
  GraduationCap: ["duotone"],
  Shield: ["duotone"],
  Airplane: ["duotone"],
  Bicycle: ["duotone"],
  Train: ["duotone"],
  Barbell: ["duotone"],
  MusicNotes: ["duotone"],
  Monitor: ["duotone"],
  DeviceMobile: ["duotone"],
  Globe: ["duotone"],
  SoccerBall: ["duotone"],
};
