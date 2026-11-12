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
 * (ADR-0015 "Icons"). A name outside the taxonomy gets a neutral mark.
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
  Receipt: ReceiptIcon,
  Repeat: RepeatIcon,
  ShoppingBag: ShoppingBagIcon,
  ShoppingCart: ShoppingCartIcon,
  TrendingUp: TrendUpIcon,
  Utensils: ForkKnifeIcon,
};

export function CategoryGlyph({ icon, className }: { icon: string; className?: string }) {
  const glyph = Object.hasOwn(CATEGORY_GLYPHS, icon) ? CATEGORY_GLYPHS[icon] : DotsThreeCircleIcon;
  // createElement, not a JSX tag: the glyph is a module-level constant picked by name.
  return createElement(glyph, { weight: "duotone", className });
}
