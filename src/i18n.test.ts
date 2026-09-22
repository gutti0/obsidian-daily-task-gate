import { describe, expect, it } from "vitest";
import { getStrings, localizeWarning } from "./i18n";

describe("localization", () => {
  it("uses Japanese strings for Japanese locales", () => {
    const strings = getStrings("ja-JP");
    expect(strings.commands.previewToday).toBe("今日のタスクをプレビュー");
    expect(strings.settings.rulesHeading).toBe("ルール記法");
    expect(strings.preview.taskCount(2)).toBe("該当するタスク: 2件");
  });

  it("uses English strings for every non-Japanese locale", () => {
    expect(getStrings("en").commands.previewToday).toBe("Preview today's tasks");
    expect(getStrings("fr").commands.previewToday).toBe("Preview today's tasks");
  });

  it("localizes parser warnings", () => {
    const warning = { line: 3, code: "invalid-weekday" as const, value: "monday" };
    expect(localizeWarning(warning, "ja")).toBe("weekday の値が不正です: monday");
    expect(localizeWarning(warning, "en")).toBe("Invalid weekday value: monday");
  });

  it("keeps rule names and values in English in both references", () => {
    for (const language of ["ja", "en"]) {
      const references = getStrings(language).settings.references;
      expect(references.some((reference) => reference.condition.includes("weekday=mon,thu"))).toBe(true);
      expect(references.some((reference) => reference.condition.includes("scope=all"))).toBe(true);
    }
  });
});
