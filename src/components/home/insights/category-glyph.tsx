import { createElement } from "react";
import {
  ArrowsLeftRightIcon,
  BusIcon,
  CoffeeIcon,
  CreditCardIcon,
  DotsThreeCircleIcon,
  FilmSlateIcon,
  ForkKnifeIcon,
  GiftIcon,
  HandCoinsIcon,
  HeartIcon,
  HouseIcon,
  MoneyIcon,
  PiggyBankIcon,
  PlusCircleIcon,
  ReceiptIcon,
  RepeatIcon,
  ShoppingBagIcon,
  ShoppingCartIcon,
  TrendUpIcon,
} from "@/components/icons";

type DuotoneGlyph = typeof DotsThreeCircleIcon;

/**
 * `categories.icon` stores a Lucide name (src/db/taxonomy.ts); the redesign
 * draws its Phosphor counterpart in duotone, the category-mark weight
 * (ADR-0015 "Icons"). Covers the seeded taxonomy plus the picker's names the
 * icon manifest already carries; any other picker name (Plane, Car, …) gets
 * the neutral mark until the manifest grows to cover it.
 */
const CATEGORY_GLYPHS: Record<string, DuotoneGlyph> = {
  ArrowLeftRight: ArrowsLeftRightIcon,
  Banknote: MoneyIcon,
  Bus: BusIcon,
  CirclePlus: PlusCircleIcon,
  Clapperboard: FilmSlateIcon,
  Coffee: CoffeeIcon,
  CreditCard: CreditCardIcon,
  Gift: GiftIcon,
  HandCoins: HandCoinsIcon,
  Heart: HeartIcon,
  Home: HouseIcon,
  MoreHorizontal: DotsThreeCircleIcon,
  PiggyBank: PiggyBankIcon,
  Receipt: ReceiptIcon,
  Repeat: RepeatIcon,
  ShoppingBag: ShoppingBagIcon,
  ShoppingCart: ShoppingCartIcon,
  TrendingUp: TrendUpIcon,
  Utensils: ForkKnifeIcon,
};

export function CategoryGlyph({ icon, className }: { icon: string; className?: string }) {
  const glyph = Object.hasOwn(CATEGORY_GLYPHS, icon) ? CATEGORY_GLYPHS[icon] : DotsThreeCircleIcon;
  // createElement: a JSX tag on a component picked at render trips react-hooks/static-components,
  // although every candidate is a module-level constant.
  return createElement(glyph, { weight: "duotone", className });
}
