import type { AiProviderKind } from "@/lib/ai-categorization";

/**
 * The settings page's sections, in display order. The drilled-in section lives
 * in the URL (`/settings?section=<key>`), so reload and back/forward keep it.
 */
export const SETTINGS_SECTIONS = [
  "accounts",
  "categories",
  "rules",
  "ai",
  "targets",
  "budgets",
  "goals",
  "scheduler",
  "appearance",
] as const;

export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

export const SECTION_PARAM = "section";

/** What a wide screen shows when the URL names no section; a phone shows the list instead. */
export const DEFAULT_SECTION: SettingsSection = "accounts";

export const SECTION_TITLES: Record<SettingsSection, string> = {
  accounts: "חשבונות בנק ואשראי",
  categories: "קטגוריות",
  rules: "כללי סיווג",
  ai: "סיווג אוטומטי",
  targets: "יעדים חודשיים",
  budgets: "תקציבים",
  goals: "יעדי חיסכון",
  scheduler: "סנכרון אוטומטי",
  appearance: "מראה",
};

/** The grouped list's groups, in order; every section belongs to exactly one. */
export const SECTION_GROUPS: readonly { label: string; sections: readonly SettingsSection[] }[] = [
  { label: "חשבונות", sections: ["accounts"] },
  { label: "סיווג", sections: ["categories", "rules", "ai"] },
  { label: "תכנון", sections: ["targets", "budgets", "goals"] },
  { label: "כללי", sections: ["scheduler", "appearance"] },
];

/** Any value that is not a known section (absent, unknown, repeated) reads as "no section". */
export function parseSettingsSection(value: string | null | undefined): SettingsSection | null {
  if (!value) return null;
  return (SETTINGS_SECTIONS as readonly string[]).includes(value)
    ? (value as SettingsSection)
    : null;
}

export function settingsSectionHref(section: SettingsSection | null): string {
  return section ? `/settings?${SECTION_PARAM}=${section}` : "/settings";
}

/** A count in Hebrew: "one" phrased as the noun with "אחד/אחת", otherwise "n nouns", and a phrase for none. */
type CountNoun = { one: string; many: string; none: string };

const COUNT_NOUNS = {
  accounts: { one: "חשבון אחד", many: "חשבונות", none: "לא חוברו חשבונות" },
  categories: { one: "קטגוריה אחת", many: "קטגוריות", none: "אין קטגוריות" },
  rules: { one: "כלל אחד", many: "כללים", none: "אין כללים" },
  budgets: { one: "תקציב אחד", many: "תקציבים", none: "אין תקציבים" },
  goals: { one: "יעד פעיל אחד", many: "יעדים פעילים", none: "אין יעדים" },
} satisfies Record<string, CountNoun>;

export type CountedSection = keyof typeof COUNT_NOUNS;

export function countSummary(section: CountedSection, count: number): string {
  const noun = COUNT_NOUNS[section];
  if (count <= 0) return noun.none;
  if (count === 1) return noun.one;
  return `${count} ${noun.many}`;
}

const PROVIDER_SHORT_LABELS: Record<AiProviderKind, string> = {
  off: "כבוי",
  ollama: "מקומי",
  gemini: "Gemini",
};

export function providerSummary(effective: AiProviderKind, pinned: boolean): string {
  const label = PROVIDER_SHORT_LABELS[effective];
  return pinned ? `${label} (מהסביבה)` : label;
}

export function schedulerSummary(config: { enabled: boolean; cronTime: string }): string {
  return config.enabled ? `כל יום ב-${config.cronTime}` : "כבוי";
}
