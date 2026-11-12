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

function tokenScore(token: string, text: string, weight: number): number {
  if (` ${text}`.includes(` ${token}`)) return weight * 2;
  return text.includes(token) ? weight : 0;
}

/** 0 when some query word appears nowhere; otherwise higher for a better match. */
function score(tokens: string[], phrase: string, command: Searchable): number {
  const label = fold(command.label);
  const keywords = [command.hint ?? "", ...(command.keywords ?? [])].map(fold).join(" ");
  let total = label.startsWith(phrase) ? 4 : 0;
  for (const token of tokens) {
    const best = Math.max(tokenScore(token, label, 2), tokenScore(token, keywords, 1));
    if (best === 0) return 0;
    total += best;
  }
  return total;
}

/**
 * The commands matching `query`, best first: every query word must occur in
 * the label or a keyword. A label starting with the query beats a word in it
 * starting with a query word, which beats a match inside a word; label beats
 * keyword; ties keep the given order. An empty query keeps every command in
 * the given order.
 */
export function searchCommands<T extends Searchable>(commands: readonly T[], query: string): T[] {
  const phrase = fold(query);
  if (phrase === "") return [...commands];
  const tokens = phrase.split(" ");
  return commands
    .map((command) => ({ command, score: score(tokens, phrase, command) }))
    .filter((m) => m.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((m) => m.command);
}
