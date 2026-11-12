export type Searchable = { label: string; hint?: string; keywords?: readonly string[] };

const FINAL_TO_REGULAR: Record<string, string> = { ך: "כ", ם: "מ", ן: "נ", ף: "פ", ץ: "צ" };

/**
 * Folds text to the form search compares: niqqud, cantillation and other
 * combining marks dropped (NFD splits Latin accents off too), final letters
 * read as their regular form (a half-typed word ends in the regular letter),
 * abbreviation marks removed so ינו׳ and צה"ל match without them, any other
 * punctuation read as a word break, Latin lower-cased.
 */
function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[ךםןףץ]/g, (c) => FINAL_TO_REGULAR[c])
    .replace(/[׳״'"`]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .toLowerCase()
    .trim();
}

type Entry<T> = { item: T; label: string; keywords: string };

/** Items with their label and keywords folded once, so typing only folds the query. */
export type SearchIndex<T> = readonly Entry<T>[];

export function buildSearchIndex<T extends Searchable>(items: readonly T[]): SearchIndex<T> {
  return items.map((item) => ({
    item,
    label: fold(item.label),
    keywords: [item.hint ?? "", ...(item.keywords ?? [])].map(fold).join(" "),
  }));
}

/** The tier one query word reaches (0 best, see `search`); null when it matches nowhere. */
function tier(word: string, entry: Entry<unknown>): 0 | 1 | 2 | 3 | null {
  const startsWord = (text: string) => ` ${text}`.includes(` ${word}`);
  if (startsWord(entry.label)) return 0;
  if (entry.label.includes(word)) return 1;
  if (startsWord(entry.keywords)) return 2;
  if (entry.keywords.includes(word)) return 3;
  return null;
}

/** Compared element by element: whole-query label prefix, then the words per tier, best first. */
function rank(words: string[], phrase: string, entry: Entry<unknown>): number[] | null {
  const counts = [0, 0, 0, 0];
  for (const word of words) {
    const t = tier(word, entry);
    if (t === null) return null;
    counts[t] += 1;
  }
  return [entry.label.startsWith(phrase) ? 1 : 0, ...counts];
}

function compareRanks(a: number[], b: number[]): number {
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return b[i] - a[i];
  }
  return 0;
}

/**
 * The items matching `query`, best first: every query word must occur in the
 * label or a keyword (hint included). A label starting with the query beats
 * a label word starting with a query word, which beats a match inside a label
 * word, which beats a keyword word starting with it, which beats a match
 * inside a keyword; several words rank by how many reached each tier. Ties
 * keep the given order, and an empty query keeps every item in that order.
 */
export function search<T>(index: SearchIndex<T>, query: string): T[] {
  const phrase = fold(query);
  if (phrase === "") return index.map((e) => e.item);
  const words = phrase.split(" ");
  return index
    .map((entry) => ({ entry, rank: rank(words, phrase, entry) }))
    .filter((m): m is { entry: Entry<T>; rank: number[] } => m.rank !== null)
    .sort((a, b) => compareRanks(a.rank, b.rank))
    .map((m) => m.entry.item);
}
