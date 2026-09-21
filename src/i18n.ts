import type { GateWarning } from "./core";

export interface RuleReference {
  syntax: string;
  description: string;
  example: string;
}

export interface Strings {
  commands: {
    openToday: string;
    insertToday: string;
    previewToday: string;
  };
  notices: {
    noTasks: string;
    warningPrefix: string;
    moreWarnings: (count: number) => string;
  };
  errors: {
    dailyNotesDisabled: string;
    unusableDailyPath: (path: string) => string;
    templateMissing: (path: string) => string;
    openDaily: string;
    insertTasks: string;
    previewTasks: string;
  };
  settings: {
    keepCommentsName: string;
    keepCommentsDescription: string;
    rulesHeading: string;
    rulesIntroduction: string;
    syntaxColumn: string;
    descriptionColumn: string;
    exampleColumn: string;
    andNote: string;
    fullExampleHeading: string;
    fullExample: string;
    references: RuleReference[];
  };
  preview: {
    title: (date: string) => string;
    taskCount: (count: number) => string;
    empty: string;
  };
}

const ENGLISH: Strings = {
  commands: {
    openToday: "Open today's daily note",
    insertToday: "Insert today's tasks",
    previewToday: "Preview today's tasks",
  },
  notices: {
    noTasks: "Daily Task Gate: There are no tasks to insert today.",
    warningPrefix: "Daily Task Gate: Template",
    moreWarnings: (count) => ` (${count} more)`,
  },
  errors: {
    dailyNotesDisabled: "Enable the Daily Notes core plugin.",
    unusableDailyPath: (path) => `The Daily Note path cannot be used as a file: ${path}`,
    templateMissing: (path) => `The Daily Notes template was not found: ${path}`,
    openDaily: "Could not open today's Daily Note",
    insertTasks: "Could not insert today's tasks",
    previewTasks: "Could not preview today's tasks",
  },
  settings: {
    keepCommentsName: "Keep Task Gate comments",
    keepCommentsDescription: "Keep <!-- dtg: ... --> comments in created or inserted tasks.",
    rulesHeading: "Rule reference",
    rulesIntroduction: "Add an HTML comment to a task. Separate multiple conditions with semicolons; all conditions must match.",
    syntaxColumn: "Condition",
    descriptionColumn: "Meaning",
    exampleColumn: "Example",
    andNote: "Condition names and values are always written in English, regardless of the Obsidian display language.",
    fullExampleHeading: "Complete example",
    fullExample: "- [ ] Take out trash <!-- dtg: weekday=mon,thu -->",
    references: [
      { syntax: "month-start", description: "Only on the first day of the month.", example: "<!-- dtg: month-start -->" },
      { syntax: "month-end", description: "Only on the last day of the month.", example: "<!-- dtg: month-end -->" },
      { syntax: "weekday=...", description: "On the specified weekdays. Values: mon, tue, wed, thu, fri, sat, sun.", example: "<!-- dtg: weekday=mon,thu -->" },
      { syntax: "nth=...", description: "On the specified occurrence of a weekday. Use together with weekday.", example: "<!-- dtg: weekday=mon; nth=1,3 -->" },
      { syntax: "day-from=N", description: "From day N of each month, inclusive.", example: "<!-- dtg: day-from=10 -->" },
      { syntax: "day-until=N", description: "Through day N of each month, inclusive.", example: "<!-- dtg: day-until=10 -->" },
      { syntax: "until-done", description: "Repeat until a matching task is completed in a past Daily Note.", example: "<!-- dtg: until-done -->" },
      { syntax: "scope=month|all", description: "Search the current month or all past Daily Notes. The default is month.", example: "<!-- dtg: until-done; scope=all -->" },
    ],
  },
  preview: {
    title: (date) => `Today's tasks — ${date}`,
    taskCount: (count) => `${count} matching task${count === 1 ? "" : "s"}`,
    empty: "No tasks match today's conditions.",
  },
};

const JAPANESE: Strings = {
  commands: {
    openToday: "今日のデイリーノートを開く",
    insertToday: "今日のタスクを挿入",
    previewToday: "今日のタスクをプレビュー",
  },
  notices: {
    noTasks: "Daily Task Gate: 今日挿入するタスクはありません。",
    warningPrefix: "Daily Task Gate: テンプレート",
    moreWarnings: (count) => `（ほか ${count} 件）`,
  },
  errors: {
    dailyNotesDisabled: "コアプラグイン Daily Notes を有効にしてください。",
    unusableDailyPath: (path) => `Daily Note の保存先をファイルとして使用できません: ${path}`,
    templateMissing: (path) => `Daily Notes テンプレートが見つかりません: ${path}`,
    openDaily: "今日の Daily Note を開けませんでした",
    insertTasks: "今日のタスクを挿入できませんでした",
    previewTasks: "今日のタスクをプレビューできませんでした",
  },
  settings: {
    keepCommentsName: "Task Gate コメントを残す",
    keepCommentsDescription: "作成または挿入したタスクに <!-- dtg: ... --> コメントを残します。",
    rulesHeading: "ルール記法",
    rulesIntroduction: "タスク行へ HTML コメントを付けます。複数条件はセミコロンで区切り、すべての条件に一致した場合だけ表示します。",
    syntaxColumn: "条件",
    descriptionColumn: "動作",
    exampleColumn: "記述例",
    andNote: "Obsidian の表示言語にかかわらず、条件名と設定値は常に英語で記述します。",
    fullExampleHeading: "タスク全体の例",
    fullExample: "- [ ] ゴミ出し <!-- dtg: weekday=mon,thu -->",
    references: [
      { syntax: "month-start", description: "毎月1日だけ表示します。", example: "<!-- dtg: month-start -->" },
      { syntax: "month-end", description: "毎月の最終日だけ表示します。", example: "<!-- dtg: month-end -->" },
      { syntax: "weekday=...", description: "指定曜日に表示します。値は mon、tue、wed、thu、fri、sat、sun です。", example: "<!-- dtg: weekday=mon,thu -->" },
      { syntax: "nth=...", description: "第N曜日に表示します。weekday と一緒に指定します。", example: "<!-- dtg: weekday=mon; nth=1,3 -->" },
      { syntax: "day-from=N", description: "毎月N日以降に表示します。N日を含みます。", example: "<!-- dtg: day-from=10 -->" },
      { syntax: "day-until=N", description: "毎月N日まで表示します。N日を含みます。", example: "<!-- dtg: day-until=10 -->" },
      { syntax: "until-done", description: "過去の Daily Note で同名タスクが完了するまで繰り返します。", example: "<!-- dtg: until-done -->" },
      { syntax: "scope=month|all", description: "今月または過去全期間を検索します。初期値は month です。", example: "<!-- dtg: until-done; scope=all -->" },
    ],
  },
  preview: {
    title: (date) => `今日のタスク — ${date}`,
    taskCount: (count) => `該当するタスク: ${count}件`,
    empty: "今日の条件に一致するタスクはありません。",
  },
};

export function getStrings(language: string): Strings {
  return language.toLowerCase().startsWith("ja") ? JAPANESE : ENGLISH;
}

export function localizeWarning(warning: GateWarning, language: string): string {
  const value = warning.value ?? "";
  if (language.toLowerCase().startsWith("ja")) {
    switch (warning.code) {
      case "empty-condition": return "条件が空です";
      case "duplicate-condition": return `条件 ${value} が重複しています`;
      case "invalid-weekday": return `weekday の値が不正です: ${value}`;
      case "invalid-nth": return `nth の値が不正です: ${value}`;
      case "invalid-day-from": return `day-from の値が不正です: ${value}`;
      case "invalid-day-until": return `day-until の値が不正です: ${value}`;
      case "invalid-condition": return `未対応または不正な条件です: ${value}`;
      case "nth-requires-weekday": return "nth には weekday の指定が必要です";
      case "scope-requires-until-done": return "scope には until-done の指定が必要です";
      case "invalid-day-range": return "day-from は day-until 以下にしてください";
      case "comment-outside-task": return "dtg コメントがタスク行の外にあります";
    }
  }

  switch (warning.code) {
    case "empty-condition": return "The condition is empty.";
    case "duplicate-condition": return `The ${value} condition is duplicated.`;
    case "invalid-weekday": return `Invalid weekday value: ${value}`;
    case "invalid-nth": return `Invalid nth value: ${value}`;
    case "invalid-day-from": return `Invalid day-from value: ${value}`;
    case "invalid-day-until": return `Invalid day-until value: ${value}`;
    case "invalid-condition": return `Unsupported or invalid condition: ${value}`;
    case "nth-requires-weekday": return "nth requires weekday.";
    case "scope-requires-until-done": return "scope requires until-done.";
    case "invalid-day-range": return "day-from must be less than or equal to day-until.";
    case "comment-outside-task": return "The dtg comment is outside a task line.";
  }
}
