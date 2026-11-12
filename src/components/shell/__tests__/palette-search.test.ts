import { describe, it, expect } from "vitest";
import { buildSearchIndex, search, type Searchable } from "../palette/search";

const find = <T extends Searchable>(items: readonly T[], query: string) =>
  search(buildSearchIndex(items), query);

const cmd = (id: string, label: string, keywords: string[] = []): Searchable & { id: string } => ({
  id,
  label,
  keywords,
});

const ids = (results: { id: string }[]) => results.map((r) => r.id);

describe("search", () => {
  const commands = [
    cmd("home", "בית", ["home", "ראשי"]),
    cmd("tx", "תנועות", ["transactions"]),
    cmd("settings", "הגדרות", ["settings"]),
  ];

  it("returns every command, in the given order, for an empty query", () => {
    expect(ids(find(commands, ""))).toEqual(["home", "tx", "settings"]);
    expect(ids(find(commands, "   "))).toEqual(["home", "tx", "settings"]);
  });

  it("keeps only commands whose label or keywords contain the query", () => {
    expect(ids(find(commands, "תנו"))).toEqual(["tx"]);
    expect(ids(find(commands, "settings"))).toEqual(["settings"]);
    expect(ids(find(commands, "ראשי"))).toEqual(["home"]);
  });

  it("returns nothing when no command matches", () => {
    expect(find(commands, "מנויים")).toEqual([]);
  });
});

describe("search, Hebrew folding", () => {
  it("treats a final letter and its regular form as the same letter", () => {
    const commands = [
      cmd("accounts", "חשבונות"),
      cmd("account", "חשבון"),
      cmd("date", "מועד"),
      cmd("wages", "שכר"),
      cmd("year", "סוף"),
      cmd("summer", "קיץ"),
    ];
    expect(ids(find(commands, "חשבונ"))).toEqual(["accounts", "account"]);
    expect(ids(find(commands, "חשבון"))).toEqual(["accounts", "account"]);
    expect(ids(find(commands, "ם"))).toEqual(["date"]);
    expect(ids(find(commands, "ך"))).toEqual(["wages"]);
    expect(ids(find(commands, "פ"))).toEqual(["year"]);
    expect(ids(find(commands, "ץ"))).toEqual(["summer"]);
  });

  it("ignores niqqud and cantillation on either side", () => {
    const commands = [cmd("tx", "תְּנוּעוֹת"), cmd("settings", "הגדרות")];
    expect(ids(find(commands, "תנועות"))).toEqual(["tx"]);
    expect(ids(find(commands, "הַגְדָּרוֹת"))).toEqual(["settings"]);
    expect(ids(find([cmd("sync", "סנכרון"), cmd("salary", "שָׂכָר")], "שכר"))).toEqual(["salary"]);
  });

  it("ignores geresh, gershayim and their ASCII stand-ins", () => {
    const commands = [cmd("jan", "ינו׳"), cmd("idf", "צה״ל")];
    expect(ids(find(commands, "ינו"))).toEqual(["jan"]);
    expect(ids(find(commands, 'צה"ל'))).toEqual(["idf"]);
    expect(ids(find(commands, "צהל"))).toEqual(["idf"]);
  });

  it("matches Latin keywords case-insensitively", () => {
    expect(ids(find([cmd("tx", "תנועות", ["Transactions"])], "TRANS"))).toEqual(["tx"]);
  });
});

describe("search, several words", () => {
  const commands = [
    cmd("nov", "נובמבר 2026", ["2026-11"]),
    cmd("nov-prev", "נובמבר 2025", ["2025-11"]),
    cmd("oct", "אוקטובר 2026", ["2026-10"]),
  ];

  it("needs every word of the query, in any order and any field", () => {
    expect(ids(find(commands, "נובמבר 2026"))).toEqual(["nov"]);
    expect(ids(find(commands, "2026 נוב"))).toEqual(["nov"]);
    expect(ids(find(commands, "2026"))).toEqual(["nov", "oct"]);
    expect(ids(find(commands, "2026-11"))).toEqual(["nov"]);
  });
});

describe("search, ranking", () => {
  it("puts a label that starts with the query before one that only contains it", () => {
    const commands = [cmd("all-tx", "כל התנועות"), cmd("tx", "תנועות")];
    expect(ids(find(commands, "תנו"))).toEqual(["tx", "all-tx"]);
  });

  it("puts a word that starts with the query before a match inside a word", () => {
    const commands = [cmd("inside", "מתנועע"), cmd("word", "כל תנועה")];
    expect(ids(find(commands, "תנו"))).toEqual(["word", "inside"]);
  });

  it("puts label matches before keyword-only matches", () => {
    const commands = [cmd("kw", "בית", ["דוחות"]), cmd("label", "דוחות")];
    expect(ids(find(commands, "דוח"))).toEqual(["label", "kw"]);
  });

  it("puts a match inside a label word before a keyword that starts with the query", () => {
    const commands = [cmd("kw", "בית", ["תנועות"]), cmd("label", "מתנועע")];
    expect(ids(find(commands, "תנו"))).toEqual(["label", "kw"]);
  });

  it("puts a keyword that starts with the query before a match inside a keyword", () => {
    const commands = [cmd("inside", "בית", ["התנועות"]), cmd("start", "דוחות", ["תנועות"])];
    expect(ids(find(commands, "תנו"))).toEqual(["start", "inside"]);
  });

  it("ranks a several-word query by its best-matched words, label first", () => {
    const commands = [
      cmd("keywords", "סיכום", ["חודש", "שעבר"]),
      cmd("label-inside", "החודש והשעבר"),
      cmd("label-start", "חודש שעבר"),
      cmd("mixed", "חודש", ["שעבר"]),
    ];
    expect(ids(find(commands, "חודש שעבר"))).toEqual([
      "label-start",
      "mixed",
      "label-inside",
      "keywords",
    ]);
  });

  it("keeps the given order between equally good matches", () => {
    const commands = [cmd("a", "תנועות החודש"), cmd("b", "תנועות בהמתנה")];
    expect(ids(find(commands, "תנועות"))).toEqual(["a", "b"]);
  });
});
