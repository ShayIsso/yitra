import { createElement } from "react";
import {
  AirplaneIcon,
  ArrowsLeftRightIcon,
  BarbellIcon,
  BicycleIcon,
  BusIcon,
  CarIcon,
  CoffeeIcon,
  CreditCardIcon,
  DeviceMobileIcon,
  DotsThreeCircleIcon,
  FilmSlateIcon,
  ForkKnifeIcon,
  GiftIcon,
  GlobeIcon,
  GraduationCapIcon,
  HandCoinsIcon,
  HeartIcon,
  HouseIcon,
  MoneyIcon,
  MonitorIcon,
  MusicNotesIcon,
  PiggyBankIcon,
  PlusCircleIcon,
  ReceiptIcon,
  RepeatIcon,
  ShieldIcon,
  ShoppingBagIcon,
  ShoppingCartIcon,
  SoccerBallIcon,
  TrainIcon,
  TrendUpIcon,
} from "@/components/icons";

type CategoryGlyph = typeof DotsThreeCircleIcon;

/** The name a new category gets until one is picked. */
export const DEFAULT_CATEGORY_ICON = "DotsThreeCircle";

/** What the category picker offers: Phosphor names, stored as-is in `categories.icon`. */
const PICKER: Readonly<Record<string, { glyph: CategoryGlyph; label: string }>> = {
  Money: { glyph: MoneyIcon, label: "שטר כסף" },
  PlusCircle: { glyph: PlusCircleIcon, label: "הוספה" },
  ShoppingCart: { glyph: ShoppingCartIcon, label: "עגלת קניות" },
  Coffee: { glyph: CoffeeIcon, label: "קפה" },
  Car: { glyph: CarIcon, label: "רכב" },
  House: { glyph: HouseIcon, label: "בית" },
  Receipt: { glyph: ReceiptIcon, label: "קבלה" },
  Heart: { glyph: HeartIcon, label: "לב" },
  FilmSlate: { glyph: FilmSlateIcon, label: "סרט" },
  ShoppingBag: { glyph: ShoppingBagIcon, label: "תיק קניות" },
  GraduationCap: { glyph: GraduationCapIcon, label: "כובע סיום" },
  Shield: { glyph: ShieldIcon, label: "מגן" },
  Repeat: { glyph: RepeatIcon, label: "חזרה" },
  Gift: { glyph: GiftIcon, label: "מתנה" },
  TrendUp: { glyph: TrendUpIcon, label: "מגמה עולה" },
  PiggyBank: { glyph: PiggyBankIcon, label: "קופת חיסכון" },
  ArrowsLeftRight: { glyph: ArrowsLeftRightIcon, label: "חץ דו-כיווני" },
  CreditCard: { glyph: CreditCardIcon, label: "כרטיס אשראי" },
  DotsThreeCircle: { glyph: DotsThreeCircleIcon, label: "אחר" },
  ForkKnife: { glyph: ForkKnifeIcon, label: "כלי אוכל" },
  Airplane: { glyph: AirplaneIcon, label: "מטוס" },
  Bicycle: { glyph: BicycleIcon, label: "אופניים" },
  Bus: { glyph: BusIcon, label: "אוטובוס" },
  Train: { glyph: TrainIcon, label: "רכבת" },
  Barbell: { glyph: BarbellIcon, label: "משקולות" },
  MusicNotes: { glyph: MusicNotesIcon, label: "מוזיקה" },
  Monitor: { glyph: MonitorIcon, label: "מסך" },
  DeviceMobile: { glyph: DeviceMobileIcon, label: "סמארטפון" },
  Globe: { glyph: GlobeIcon, label: "גלובוס" },
  SoccerBall: { glyph: SoccerBallIcon, label: "כדורגל" },
  HandCoins: { glyph: HandCoinsIcon, label: "מזומן" },
};

/**
 * Rows written before the redesign hold Lucide names: the seeded taxonomy
 * (`src/db/taxonomy.ts`) and the old picker. They are never rewritten, so each
 * keeps drawing its Phosphor counterpart. Lucide names the picker shares with
 * Phosphor (Coffee, Bus, Gift, …) resolve through `PICKER`.
 */
const LUCIDE_NAMES: Readonly<Record<string, string>> = {
  Banknote: "Money",
  CirclePlus: "PlusCircle",
  Home: "House",
  Clapperboard: "FilmSlate",
  TrendingUp: "TrendUp",
  ArrowLeftRight: "ArrowsLeftRight",
  MoreHorizontal: "DotsThreeCircle",
  Utensils: "ForkKnife",
  Plane: "Airplane",
  Bike: "Bicycle",
  Dumbbell: "Barbell",
  Music: "MusicNotes",
  Smartphone: "DeviceMobile",
  // The old picker labelled its volleyball "כדורגל" (Lucide has no football).
  Volleyball: "SoccerBall",
};

export const CATEGORY_ICON_OPTIONS: readonly { name: string; label: string }[] = Object.entries(
  PICKER,
).map(([name, { label }]) => ({ name, label }));

function pickerEntry(stored: string) {
  const name = Object.hasOwn(LUCIDE_NAMES, stored) ? LUCIDE_NAMES[stored] : stored;
  return Object.hasOwn(PICKER, name) ? PICKER[name] : null;
}

/** Whether a stored name has its own glyph; any other name draws the neutral mark. */
export function isKnownCategoryIcon(stored: string): boolean {
  return pickerEntry(stored) !== null;
}

/** The picker label for a stored name (either spelling), or the name itself. */
export function categoryIconLabel(stored: string): string {
  return pickerEntry(stored)?.label ?? stored;
}

/** A category's mark in the category-mark weight, duotone (ADR-0015 "Icons"). */
export function CategoryIcon({ icon, className }: { icon: string; className?: string }) {
  const glyph = pickerEntry(icon)?.glyph ?? DotsThreeCircleIcon;
  // createElement: a JSX tag on a component picked at render trips react-hooks/static-components,
  // although every candidate is a module-level constant.
  return createElement(glyph, { weight: "duotone", className });
}
