import { describe, it, expect } from "vitest";
import {
  DEFAULT_SECTION,
  SECTION_GROUPS,
  SETTINGS_SECTIONS,
  countSummary,
  parseSettingsSection,
  providerSummary,
  schedulerSummary,
  settingsSectionHref,
} from "../sections";

describe("settings sections", () => {
  it("files every section under exactly one group, in display order", () => {
    const grouped = SECTION_GROUPS.flatMap((group) => group.sections);
    expect(grouped).toEqual([...SETTINGS_SECTIONS]);
  });

  it("reads a known section from the URL", () => {
    for (const section of SETTINGS_SECTIONS) {
      expect(parseSettingsSection(section)).toBe(section);
      expect(
        parseSettingsSection(
          new URL(`http://x${settingsSectionHref(section)}`).searchParams.get("section"),
        ),
      ).toBe(section);
    }
  });

  it("reads an absent or unknown section as none", () => {
    expect(parseSettingsSection(null)).toBeNull();
    expect(parseSettingsSection(undefined)).toBeNull();
    expect(parseSettingsSection("")).toBeNull();
    expect(parseSettingsSection("passwords")).toBeNull();
    expect(parseSettingsSection("constructor")).toBeNull();
  });

  it("links the list root without a section", () => {
    expect(settingsSectionHref(null)).toBe("/settings");
  });

  it("opens the accounts section by default on a wide screen", () => {
    expect(DEFAULT_SECTION).toBe("accounts");
  });
});

describe("list summaries", () => {
  it("phrases none, one and many in Hebrew", () => {
    expect(countSummary("rules", 0)).toBe("אין כללים");
    expect(countSummary("rules", 1)).toBe("כלל אחד");
    expect(countSummary("rules", 12)).toBe("12 כללים");
    expect(countSummary("categories", 1)).toBe("קטגוריה אחת");
    expect(countSummary("accounts", 0)).toBe("לא חוברו חשבונות");
  });

  it("names the provider in use and says when the environment pins it", () => {
    expect(providerSummary("off", false)).toBe("כבוי");
    expect(providerSummary("gemini", false)).toBe("Gemini");
    expect(providerSummary("ollama", true)).toBe("מקומי (מהסביבה)");
  });

  it("states the daily sync time only when the scheduler is on", () => {
    expect(schedulerSummary({ enabled: true, cronTime: "06:30" })).toBe("כל יום ב-06:30");
    expect(schedulerSummary({ enabled: false, cronTime: "06:30" })).toBe("כבוי");
  });
});
