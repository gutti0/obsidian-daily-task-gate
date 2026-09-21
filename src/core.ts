export type GateScope = "month" | "all";

export interface CompletedTask {
  date: Date;
  text: string;
}

export interface GateWarning {
  line: number;
  message: string;
}

export interface ProcessOptions {
  keepComments: boolean;
}

export interface ProcessResult {
  content: string;
  insertionContent: string;
  includedTaskCount: number;
  warnings: GateWarning[];
}

interface ProcessedLine {
  rendered: string;
  included: boolean;
  isTask: boolean;
  isGatedTask: boolean;
  headingLevel?: number;
}

interface GateRule {
  monthStart: boolean;
  monthEnd: boolean;
  weekdays?: number[];
  nth?: number[];
  dayFrom?: number;
  dayUntil?: number;
  untilDone: boolean;
  scope: GateScope;
}

interface ParsedRule {
  rule?: GateRule;
  error?: string;
}

const GATE_COMMENT = /<!--\s*dtg:\s*(.*?)\s*-->/gi;
const TASK_LINE = /^(\s*(?:[-*+]|\d+[.)])\s+\[([^\]])\]\s+)(.*)$/;
const ATX_HEADING = /^\s{0,3}(#{1,6})(?:[ \t]+|$)/;
const FENCE = /^\s{0,3}(`{3,}|~{3,})/;
const WEEKDAYS: Readonly<Record<string, number>> = {
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
};

function parseIntegerList(value: string, minimum: number, maximum: number): number[] | undefined {
  const parts = value.split(",").map((part) => part.trim());
  if (parts.length === 0 || parts.some((part) => !/^\d+$/.test(part))) {
    return undefined;
  }

  const values = parts.map(Number);
  if (values.some((number) => number < minimum || number > maximum)) {
    return undefined;
  }

  return [...new Set(values)];
}

function parseRule(source: string): ParsedRule {
  const rule: GateRule = {
    monthStart: false,
    monthEnd: false,
    untilDone: false,
    scope: "month",
  };
  const seen = new Set<string>();
  const clauses = source.split(";").map((clause) => clause.trim()).filter(Boolean);

  if (clauses.length === 0) {
    return { error: "条件が空です" };
  }

  for (const clause of clauses) {
    const separator = clause.indexOf("=");
    const key = (separator === -1 ? clause : clause.slice(0, separator)).trim().toLowerCase();
    const value = separator === -1 ? undefined : clause.slice(separator + 1).trim().toLowerCase();

    if (seen.has(key)) {
      return { error: `条件 ${key} が重複しています` };
    }
    seen.add(key);

    if (key === "month-start" && value === undefined) {
      rule.monthStart = true;
    } else if (key === "month-end" && value === undefined) {
      rule.monthEnd = true;
    } else if (key === "until-done" && value === undefined) {
      rule.untilDone = true;
    } else if (key === "weekday" && value !== undefined) {
      const weekdayNames = value.split(",").map((part) => part.trim());
      if (weekdayNames.length === 0 || weekdayNames.some((name) => WEEKDAYS[name] === undefined)) {
        return { error: `weekday の値が不正です: ${value}` };
      }
      rule.weekdays = [...new Set(weekdayNames.map((name) => WEEKDAYS[name]!))];
    } else if (key === "nth" && value !== undefined) {
      const parsed = parseIntegerList(value, 1, 5);
      if (!parsed) {
        return { error: `nth の値が不正です: ${value}` };
      }
      rule.nth = parsed;
    } else if (key === "day-from" && value !== undefined) {
      const parsed = parseIntegerList(value, 1, 31);
      if (!parsed || parsed.length !== 1) {
        return { error: `day-from の値が不正です: ${value}` };
      }
      rule.dayFrom = parsed[0];
    } else if (key === "day-until" && value !== undefined) {
      const parsed = parseIntegerList(value, 1, 31);
      if (!parsed || parsed.length !== 1) {
        return { error: `day-until の値が不正です: ${value}` };
      }
      rule.dayUntil = parsed[0];
    } else if (key === "scope" && (value === "month" || value === "all")) {
      rule.scope = value;
    } else {
      return { error: `未対応または不正な条件です: ${clause}` };
    }
  }

  if (rule.nth && !rule.weekdays) {
    return { error: "nth には weekday の指定が必要です" };
  }
  if (seen.has("scope") && !rule.untilDone) {
    return { error: "scope には until-done の指定が必要です" };
  }
  if (rule.dayFrom !== undefined && rule.dayUntil !== undefined && rule.dayFrom > rule.dayUntil) {
    return { error: "day-from は day-until 以下にしてください" };
  }

  return { rule };
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function isSameMonth(left: Date, right: Date): boolean {
  return left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth();
}

function hasCompletedTask(
  taskText: string,
  scope: GateScope,
  date: Date,
  completedTasks: readonly CompletedTask[],
): boolean {
  const today = startOfDay(date);
  return completedTasks.some((task) =>
    task.text === taskText
      && startOfDay(task.date) < today
      && (scope === "all" || isSameMonth(task.date, date)),
  );
}

function matchesRule(
  rule: GateRule,
  taskText: string,
  date: Date,
  completedTasks: readonly CompletedTask[],
): boolean {
  const day = date.getDate();
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  const nth = Math.floor((day - 1) / 7) + 1;

  if (rule.monthStart && day !== 1) return false;
  if (rule.monthEnd && day !== lastDay) return false;
  if (rule.weekdays && !rule.weekdays.includes(date.getDay())) return false;
  if (rule.nth && !rule.nth.includes(nth)) return false;
  if (rule.dayFrom !== undefined && day < rule.dayFrom) return false;
  if (rule.dayUntil !== undefined && day > rule.dayUntil) return false;
  if (rule.untilDone && hasCompletedTask(taskText, rule.scope, date, completedTasks)) return false;

  return true;
}

export function getTaskIdentity(line: string): string | undefined {
  const match = line.match(TASK_LINE);
  if (!match) return undefined;

  return match[3]?.replace(GATE_COMMENT, "").trim();
}

export function collectCompletedTasks(content: string, date: Date): CompletedTask[] {
  const completed: CompletedTask[] = [];
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(TASK_LINE);
    if (!match || !/^[xX]$/.test(match[2] ?? "")) continue;
    const text = getTaskIdentity(line);
    if (text !== undefined) completed.push({ date, text });
  }
  return completed;
}

export function processTemplate(
  content: string,
  date: Date,
  completedTasks: readonly CompletedTask[],
  options: ProcessOptions,
): ProcessResult {
  const newline = content.includes("\r\n") ? "\r\n" : "\n";
  const lines: ProcessedLine[] = [];
  const warnings: GateWarning[] = [];
  let activeFence: { character: string; length: number } | undefined;

  content.split(/\r?\n/).forEach((line, index) => {
    const fence = line.match(FENCE)?.[1];
    if (activeFence) {
      const closingFence = line.match(/^\s{0,3}(`{3,}|~{3,})[ \t]*$/)?.[1];
      lines.push({ rendered: line, included: true, isTask: false, isGatedTask: false });
      if (closingFence?.[0] === activeFence.character && closingFence.length >= activeFence.length) {
        activeFence = undefined;
      }
      return;
    }
    if (fence) {
      activeFence = { character: fence[0]!, length: fence.length };
      lines.push({ rendered: line, included: true, isTask: false, isGatedTask: false });
      return;
    }

    const headingLevel = line.match(ATX_HEADING)?.[1]?.length;
    const comments = [...line.matchAll(GATE_COMMENT)];
    if (comments.length === 0) {
      lines.push({
        rendered: line,
        included: true,
        isTask: TASK_LINE.test(line),
        isGatedTask: false,
        headingLevel,
      });
      return;
    }

    const taskText = getTaskIdentity(line);
    if (taskText === undefined) {
      warnings.push({ line: index + 1, message: "dtg コメントがタスク行の外にあります" });
      lines.push({ rendered: line, included: true, isTask: false, isGatedTask: false, headingLevel });
      return;
    }

    const parsed = parseRule(comments.map((comment) => comment[1] ?? "").join(";"));
    if (!parsed.rule) {
      warnings.push({ line: index + 1, message: parsed.error ?? "条件を解釈できません" });
      lines.push({ rendered: line, included: true, isTask: true, isGatedTask: true });
      return;
    }

    const included = options.keepComments
      ? line
      : line.replace(GATE_COMMENT, "").replace(/[ \t]+$/u, "");
    lines.push({
      rendered: included,
      included: matchesRule(parsed.rule, taskText, date, completedTasks),
      isTask: true,
      isGatedTask: true,
    });
  });

  pruneEmptyTaskHeadings(lines);
  const insertionIndices = collectInsertionIndices(lines);
  const insertionContent = lines
    .filter((_line, index) => insertionIndices.has(index))
    .map((line) => line.rendered)
    .join(newline);

  return {
    content: lines.filter((line) => line.included).map((line) => line.rendered).join(newline),
    insertionContent,
    includedTaskCount: lines.filter((line) => line.isGatedTask && line.included).length,
    warnings,
  };
}

function pruneEmptyTaskHeadings(lines: ProcessedLine[]): void {
  lines.forEach((line, index) => {
    if (line.headingLevel === undefined) return;

    let sectionEnd = lines.length;
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      const candidateLevel = lines[cursor]?.headingLevel;
      if (candidateLevel !== undefined && candidateLevel <= line.headingLevel) {
        sectionEnd = cursor;
        break;
      }
    }

    const section = lines.slice(index + 1, sectionEnd);
    const hadTasks = section.some((candidate) => candidate.isTask);
    const hasIncludedTasks = section.some((candidate) => candidate.isTask && candidate.included);
    if (hadTasks && !hasIncludedTasks) line.included = false;
  });
}

function collectInsertionIndices(lines: readonly ProcessedLine[]): Set<number> {
  const selected = new Set<number>();
  const headingStack: Array<{ index: number; level: number }> = [];

  lines.forEach((line, index) => {
    if (line.headingLevel !== undefined) {
      while (headingStack.length > 0 && headingStack[headingStack.length - 1]!.level >= line.headingLevel) {
        headingStack.pop();
      }
      headingStack.push({ index, level: line.headingLevel });
      return;
    }

    if (!line.isGatedTask || !line.included) return;
    headingStack.forEach((heading) => selected.add(heading.index));
    selected.add(index);
  });

  return selected;
}
