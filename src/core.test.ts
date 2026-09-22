import { describe, expect, it } from "vitest";
import {
  collectCompletedTasks,
  getTaskIdentity,
  processTemplate,
} from "./core";

function localDate(year: number, month: number, day: number): Date {
  return new Date(year, month - 1, day, 12, 0, 0);
}

function render(template: string, date: Date, history = "", historyDate = localDate(2026, 9, 1)) {
  return processTemplate(template, date, collectCompletedTasks(history, historyDate), { keepComments: false });
}

describe("date conditions", () => {
  it("filters month-start and month-end", () => {
    const template = [
      "- [ ] start <!-- dtg: month-start -->",
      "- [ ] end <!-- dtg: month-end -->",
    ].join("\n");

    expect(render(template, localDate(2026, 9, 1)).content).toBe("- [ ] start");
    expect(render(template, localDate(2026, 9, 30)).content).toBe("- [ ] end");
  });

  it("accepts multiple weekdays", () => {
    const task = "- [ ] trash <!-- dtg: weekday=mon,thu -->";
    expect(render(task, localDate(2026, 9, 21)).content).toBe("- [ ] trash");
    expect(render(task, localDate(2026, 9, 22)).content).toBe("");
  });

  it("matches multiple nth weekdays", () => {
    const task = "- [ ] review <!-- dtg: weekday=mon; nth=1,3 -->";
    expect(render(task, localDate(2026, 9, 7)).content).toBe("- [ ] review");
    expect(render(task, localDate(2026, 9, 14)).content).toBe("");
    expect(render(task, localDate(2026, 9, 21)).content).toBe("- [ ] review");
  });

  it("applies inclusive day ranges with AND semantics", () => {
    const task = "- [ ] transfer <!-- dtg: day-from=5; day-until=10 -->";
    expect(render(task, localDate(2026, 9, 4)).content).toBe("");
    expect(render(task, localDate(2026, 9, 5)).content).toBe("- [ ] transfer");
    expect(render(task, localDate(2026, 9, 10)).content).toBe("- [ ] transfer");
    expect(render(task, localDate(2026, 9, 11)).content).toBe("");
  });
});

describe("template processing", () => {
  it("keeps ordinary content and tasks unchanged", () => {
    const template = "# Daily\n\n- [ ] ordinary\ntext";
    expect(render(template, localDate(2026, 9, 21)).content).toBe(template);
  });

  it("can retain gate comments", () => {
    const task = "- [ ] trash <!-- dtg: weekday=mon -->";
    const result = processTemplate(task, localDate(2026, 9, 21), [], { keepComments: true });
    expect(result.content).toBe(task);
  });

  it("fails open and reports invalid rules", () => {
    const task = "- [ ] safe <!-- dtg: weekday=monday -->";
    const result = render(task, localDate(2026, 9, 21));
    expect(result.content).toBe(task);
    expect(result.warnings).toEqual([{ line: 1, code: "invalid-weekday", value: "monday" }]);
  });

  it("requires weekday when nth is used", () => {
    const task = "- [ ] safe <!-- dtg: nth=1 -->";
    expect(render(task, localDate(2026, 9, 1)).warnings[0]?.code).toBe("nth-requires-weekday");
  });

  it("extracts only matching gated tasks for manual insertion", () => {
    const template = [
      "# Heading",
      "- [ ] ordinary",
      "- [ ] monday <!-- dtg: weekday=mon -->",
      "- [ ] tuesday <!-- dtg: weekday=tue -->",
    ].join("\n");
    expect(render(template, localDate(2026, 9, 21)).insertionContent).toBe("# Heading\n- [ ] monday");
  });
});

describe("task headings", () => {
  it("removes a heading when all tasks in its section are filtered", () => {
    const template = [
      "# Notes",
      "Static text",
      "# Monday",
      "- [ ] keep <!-- dtg: weekday=mon -->",
      "# Tuesday",
      "- [ ] remove <!-- dtg: weekday=tue -->",
    ].join("\n");

    expect(render(template, localDate(2026, 9, 21)).content).toBe([
      "# Notes",
      "Static text",
      "# Monday",
      "- [ ] keep",
    ].join("\n"));
  });

  it("preserves headings that only contain static template content", () => {
    const template = "# Journal\nWrite anything here.\n## Ideas";
    expect(render(template, localDate(2026, 9, 21)).content).toBe(template);
  });

  it("keeps the complete ancestor chain for a surviving nested task", () => {
    const template = [
      "# Parent",
      "## Child",
      "### Active",
      "- [ ] keep <!-- dtg: weekday=mon -->",
      "### Empty",
      "- [ ] remove <!-- dtg: weekday=tue -->",
      "## Empty branch",
      "- [ ] remove too <!-- dtg: weekday=tue -->",
    ].join("\n");
    const result = render(template, localDate(2026, 9, 21));

    expect(result.content).toBe([
      "# Parent",
      "## Child",
      "### Active",
      "- [ ] keep",
    ].join("\n"));
    expect(result.insertionContent).toBe([
      "# Parent",
      "## Child",
      "### Active",
      "- [ ] keep",
    ].join("\n"));
  });

  it("removes an entire heading chain when no nested task survives", () => {
    const template = "# Parent\n## Child\n### Grandchild\n- [ ] remove <!-- dtg: weekday=tue -->";
    const result = render(template, localDate(2026, 9, 21));
    expect(result.content).toBe("");
    expect(result.insertionContent).toBe("");
  });

  it("keeps headings around normal tasks in generated notes but omits them from insertion", () => {
    const template = "# Ordinary\n- [ ] normal";
    const result = render(template, localDate(2026, 9, 21));
    expect(result.content).toBe(template);
    expect(result.insertionContent).toBe("");
  });

  it("does not interpret headings or tasks inside fenced code blocks", () => {
    const template = [
      "```markdown",
      "# Example",
      "- [ ] sample <!-- dtg: weekday=tue -->",
      "```",
    ].join("\n");
    const result = render(template, localDate(2026, 9, 21));
    expect(result.content).toBe(template);
    expect(result.insertionContent).toBe("");
    expect(result.warnings).toEqual([]);
  });
});

describe("until-done", () => {
  const monthly = "- [ ] transfer <!-- dtg: day-until=10; until-done; scope=month -->";

  it("defaults scope to the current month", () => {
    const task = "- [ ] archive <!-- dtg: until-done -->";
    const previousMonth = render(task, localDate(2026, 10, 1), "- [x] archive", localDate(2026, 9, 3));
    const currentMonth = render(task, localDate(2026, 10, 2), "- [x] archive", localDate(2026, 10, 1));
    expect(previousMonth.content).toBe("- [ ] archive");
    expect(currentMonth.content).toBe("");
  });

  it("continues while earlier copies are incomplete", () => {
    const result = render(monthly, localDate(2026, 9, 3), "- [ ] transfer", localDate(2026, 9, 2));
    expect(result.content).toBe("- [ ] transfer");
  });

  it("stops after completion in the same month", () => {
    const result = render(monthly, localDate(2026, 9, 4), "- [x] transfer", localDate(2026, 9, 3));
    expect(result.content).toBe("");
  });

  it("resets month scope in a new month", () => {
    const result = render(monthly, localDate(2026, 10, 1), "- [x] transfer", localDate(2026, 9, 3));
    expect(result.content).toBe("- [ ] transfer");
  });

  it("honors completed tasks across months for all scope", () => {
    const task = "- [ ] archive <!-- dtg: until-done; scope=all -->";
    const result = render(task, localDate(2026, 10, 1), "- [x] archive", localDate(2026, 9, 3));
    expect(result.content).toBe("");
  });

  it("does not consider today's records", () => {
    const task = "- [ ] archive <!-- dtg: until-done; scope=all -->";
    const result = render(task, localDate(2026, 9, 3), "- [x] archive", localDate(2026, 9, 3));
    expect(result.content).toBe("- [ ] archive");
  });
});

describe("task identity", () => {
  it("ignores checkbox state, gate comments, and surrounding whitespace", () => {
    expect(getTaskIdentity("- [ ]   credit card transfer   <!-- dtg: until-done -->")).toBe("credit card transfer");
    expect(getTaskIdentity("- [x] credit card transfer")).toBe("credit card transfer");
  });
});
