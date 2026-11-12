import { describe, it, expect } from "vitest";
import { searchCommands, type Searchable } from "../palette/search";

const cmd = (id: string, label: string, keywords: string[] = []): Searchable & { id: string } => ({
  id,
  label,
  keywords,
});

const ids = (results: { id: string }[]) => results.map((r) => r.id);

describe("searchCommands", () => {
  const commands = [
    cmd("home", "בית", ["home", "ראשי"]),
    cmd("tx", "תנועות", ["transactions"]),
    cmd("settings", "הגדרות", ["settings"]),
  ];

  it("returns every command, in the given order, for an empty query", () => {
    expect(ids(searchCommands(commands, ""))).toEqual(["home", "tx", "settings"]);
    expect(ids(searchCommands(commands, "   "))).toEqual(["home", "tx", "settings"]);
  });

  it("keeps only commands whose label or keywords contain the query", () => {
    expect(ids(searchCommands(commands, "תנו"))).toEqual(["tx"]);
    expect(ids(searchCommands(commands, "settings"))).toEqual(["settings"]);
    expect(ids(searchCommands(commands, "ראשי"))).toEqual(["home"]);
  });

  it("returns nothing when no command matches", () => {
    expect(searchCommands(commands, "מנויים")).toEqual([]);
  });
});

describe("searchCommands, Hebrew folding", () => {
  it("treats a final letter and its regular form as the same letter", () => {
    const commands = [
      cmd("accounts", "חשבונות"),
      cmd("account", "חשבון"),
      cmd("date", "מועד"),
      cmd("wages", "שכר"),
      cmd("year", "סוף"),
      cmd("summer", "קיץ"),
    ];
    expect(ids(searchCommands(commands, "חשבונ"))).toEqual(["accounts", "account"]);
    expect(ids(searchCommands(commands, "חשבון"))).toEqual(["accounts", "account"]);
    expect(ids(searchCommands(commands, "ם"))).toEqual(["date"]);
    expect(ids(searchCommands(commands, "ך"))).toEqual(["wages"]);
    expect(ids(searchCommands(commands, "פ"))).toEqual(["year"]);
    expect(ids(searchCommands(commands, "ץ"))).toEqual(["summer"]);
  });

  it("ignores niqqud and cantillation on either side", () => {
    const commands = [cmd("tx", "תְּנוּעוֹת"), cmd("settings", "הגדרות")];
    expect(ids(searchCommands(commands, "תנועות"))).toEqual(["tx"]);
    expect(ids(searchCommands(commands, "הַגְדָּרוֹת"))).toEqual(["settings"]);
    expect(ids(searchCommands([cmd("sync", "סנכרון"), cmd("salary", "שָׂכָר")], "שכר"))).toEqual([
      "salary",
    ]);
  });

  it("ignores geresh, gershayim and their ASCII stand-ins", () => {
    const commands = [cmd("jan", "ינו׳"), cmd("idf", "צה״ל")];
    expect(ids(searchCommands(commands, "ינו"))).toEqual(["jan"]);
    expect(ids(searchCommands(commands, 'צה"ל'))).toEqual(["idf"]);
    expect(ids(searchCommands(commands, "צהל"))).toEqual(["idf"]);
  });

  it("matches Latin keywords case-insensitively", () => {
    expect(ids(searchCommands([cmd("tx", "תנועות", ["Transactions"])], "TRANS"))).toEqual(["tx"]);
  });
});

describe("searchCommands, several words", () => {
  const commands = [
    cmd("nov", "נובמבר 2026", ["2026-11"]),
    cmd("nov-prev", "נובמבר 2025", ["2025-11"]),
    cmd("oct", "אוקטובר 2026", ["2026-10"]),
  ];

  it("needs every word of the query, in any order and any field", () => {
    expect(ids(searchCommands(commands, "נובמבר 2026"))).toEqual(["nov"]);
    expect(ids(searchCommands(commands, "2026 נוב"))).toEqual(["nov"]);
    expect(ids(searchCommands(commands, "2026"))).toEqual(["nov", "oct"]);
    expect(ids(searchCommands(commands, "2026-11"))).toEqual(["nov"]);
  });
});

describe("searchCommands, ranking", () => {
  it("puts a label that starts with the query before one that only contains it", () => {
    const commands = [cmd("all-tx", "כל התנועות"), cmd("tx", "תנועות")];
    expect(ids(searchCommands(commands, "תנו"))).toEqual(["tx", "all-tx"]);
  });

  it("puts a word that starts with the query before a match inside a word", () => {
    const commands = [cmd("inside", "מתנועע"), cmd("word", "כל תנועה")];
    expect(ids(searchCommands(commands, "תנו"))).toEqual(["word", "inside"]);
  });

  it("puts label matches before keyword-only matches", () => {
    const commands = [cmd("kw", "בית", ["דוחות"]), cmd("label", "דוחות")];
    expect(ids(searchCommands(commands, "דוח"))).toEqual(["label", "kw"]);
  });

  it("keeps the given order between equally good matches", () => {
    const commands = [cmd("a", "תנועות החודש"), cmd("b", "תנועות בהמתנה")];
    expect(ids(searchCommands(commands, "תנועות"))).toEqual(["a", "b"]);
  });
});
