import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  CATEGORY_ICON_OPTIONS,
  CategoryIcon,
  DEFAULT_CATEGORY_ICON,
  categoryIconLabel,
  isKnownCategoryIcon,
  pickerIconName,
} from "@/components/category-icon";
import { DEFAULT_GROUPS, TAXONOMY_V2 } from "@/db/taxonomy";

/** Every name the pre-redesign (Lucide) picker could store in `categories.icon`. */
const LUCIDE_PICKER_NAMES = [
  "Banknote",
  "CirclePlus",
  "ShoppingCart",
  "Coffee",
  "Car",
  "Home",
  "Receipt",
  "Heart",
  "Clapperboard",
  "ShoppingBag",
  "GraduationCap",
  "Shield",
  "Repeat",
  "Gift",
  "TrendingUp",
  "PiggyBank",
  "ArrowLeftRight",
  "CreditCard",
  "MoreHorizontal",
  "Utensils",
  "Plane",
  "Bike",
  "Bus",
  "Train",
  "Dumbbell",
  "Music",
  "Monitor",
  "Smartphone",
  "Globe",
  "Volleyball",
  "HandCoins",
];

const draw = (icon: string) => renderToStaticMarkup(createElement(CategoryIcon, { icon }));

describe("category icons", () => {
  it("draws every seeded taxonomy and default-group icon", () => {
    const seeded = [...TAXONOMY_V2, ...DEFAULT_GROUPS].map((c) => c.icon);
    expect(seeded.filter((name) => !isKnownCategoryIcon(name))).toEqual([]);
  });

  it("draws every name the old picker could have stored", () => {
    expect(LUCIDE_PICKER_NAMES.filter((name) => !isKnownCategoryIcon(name))).toEqual([]);
  });

  it("offers each picker name once, each with its own glyph and a label", () => {
    const names = CATEGORY_ICON_OPTIONS.map((o) => o.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toContain(DEFAULT_CATEGORY_ICON);
    for (const { name, label } of CATEGORY_ICON_OPTIONS) {
      expect(isKnownCategoryIcon(name)).toBe(true);
      expect(label).not.toBe(name);
    }
    expect(new Set(names.map(draw)).size).toBe(names.length);
  });

  it("draws an old name exactly as the picker name it became", () => {
    expect(draw("Utensils")).toBe(draw("ForkKnife"));
    expect(draw("Home")).toBe(draw("House"));
    expect(draw("Volleyball")).toBe(draw("SoccerBall"));
    expect(categoryIconLabel("Utensils")).toBe(categoryIconLabel("ForkKnife"));
  });

  it("opens every stored name on a picker option, so the edit form shows it selected", () => {
    const options = new Set(CATEGORY_ICON_OPTIONS.map((o) => o.name));
    const stored = [
      ...LUCIDE_PICKER_NAMES,
      ...[...TAXONOMY_V2, ...DEFAULT_GROUPS].map((c) => c.icon),
    ];
    expect(stored.filter((name) => !options.has(pickerIconName(name)))).toEqual([]);
    expect(pickerIconName("Utensils")).toBe("ForkKnife");
    expect(pickerIconName("Coffee")).toBe("Coffee");
    expect(pickerIconName("ForkKnife")).toBe("ForkKnife");
  });

  it("leaves a name it does not know as stored", () => {
    expect(pickerIconName("NoSuchIcon")).toBe("NoSuchIcon");
    expect(pickerIconName("toString")).toBe("toString");
  });

  it("draws an unknown name as the neutral mark, in the category-mark weight", () => {
    expect(isKnownCategoryIcon("NoSuchIcon")).toBe(false);
    expect(draw("NoSuchIcon")).toBe(draw(DEFAULT_CATEGORY_ICON));
    expect(draw("toString")).toBe(draw(DEFAULT_CATEGORY_ICON));
    expect(draw("Coffee")).toContain('opacity="0.2"');
  });
});
