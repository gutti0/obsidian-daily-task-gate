import {
  App,
  Editor,
  moment,
  Notice,
  normalizePath,
  Plugin,
  PluginSettingTab,
  Setting,
  TFile,
} from "obsidian";
import {
  collectCompletedTasks,
  CompletedTask,
  processTemplate,
} from "./core";

interface DailyTaskGateSettings {
  keepComments: boolean;
}

interface DailyNotesOptions {
  folder?: string;
  format?: string;
  template?: string;
}

interface InternalPlugin {
  enabled?: boolean;
  instance?: {
    options?: DailyNotesOptions;
  };
}

interface AppWithInternalPlugins extends App {
  internalPlugins: {
    getPluginById(id: string): InternalPlugin | undefined;
  };
}

const DEFAULT_SETTINGS: DailyTaskGateSettings = {
  keepComments: false,
};
const DEFAULT_DATE_FORMAT = "YYYY-MM-DD";

interface MomentValue {
  format(format: string): string;
  isValid(): boolean;
  startOf(unit: "day"): MomentValue;
  toDate(): Date;
  valueOf(): number;
}

const createMoment = moment as unknown as {
  (): MomentValue;
  (input: Date): MomentValue;
  (input: string, format: string, strict: boolean): MomentValue;
};

export default class DailyTaskGatePlugin extends Plugin {
  override settings: DailyTaskGateSettings = DEFAULT_SETTINGS;

  override async onload(): Promise<void> {
    await this.loadSettings();

    this.addCommand({
      id: "open-todays-daily-note",
      name: "Open today's daily note",
      callback: () => this.openTodaysDailyNote(),
    });

    this.addCommand({
      id: "insert-todays-tasks",
      name: "Insert today's tasks",
      editorCallback: (editor: Editor) => this.insertTodaysTasks(editor),
    });

    this.addSettingTab(new DailyTaskGateSettingTab(this.app, this));
  }

  async openTodaysDailyNote(): Promise<void> {
    try {
      const date = createMoment().toDate();
      const daily = this.getDailyNotesOptions();
      const notePath = this.getDailyNotePath(date, daily);
      const existing = this.app.vault.getAbstractFileByPath(notePath);

      if (existing instanceof TFile) {
        await this.app.workspace.getLeaf(false).openFile(existing);
        return;
      }
      if (existing) {
        throw new Error(`Daily Note の保存先がファイルとして使用できません: ${notePath}`);
      }

      const template = await this.readTemplate(daily.template);
      const resolved = this.resolveTemplateVariables(template, date, notePath);
      const completedTasks = await this.loadCompletedTasks(date, daily);
      const result = processTemplate(resolved, date, completedTasks, this.settings);
      this.showWarnings(result.warnings);

      await this.ensureParentFolders(notePath);
      const created = await this.app.vault.create(notePath, result.content);
      await this.app.workspace.getLeaf(false).openFile(created);
    } catch (error) {
      this.reportError("今日の Daily Note を開けませんでした", error);
    }
  }

  async insertTodaysTasks(editor: Editor): Promise<void> {
    try {
      const date = createMoment().toDate();
      const daily = this.getDailyNotesOptions();
      const notePath = this.getDailyNotePath(date, daily);
      const template = await this.readTemplate(daily.template);
      const resolved = this.resolveTemplateVariables(template, date, notePath);
      const completedTasks = await this.loadCompletedTasks(date, daily);
      const result = processTemplate(resolved, date, completedTasks, this.settings);
      this.showWarnings(result.warnings);

      if (result.tasks.length === 0) {
        new Notice("Daily Task Gate: 今日挿入するタスクはありません");
        return;
      }

      const newline = template.includes("\r\n") ? "\r\n" : "\n";
      editor.replaceSelection(result.tasks.join(newline));
    } catch (error) {
      this.reportError("今日のタスクを挿入できませんでした", error);
    }
  }

  private getDailyNotesOptions(): DailyNotesOptions {
    const dailyNotes = (this.app as AppWithInternalPlugins).internalPlugins.getPluginById("daily-notes");
    if (!dailyNotes?.enabled) {
      throw new Error("コアプラグイン Daily Notes を有効にしてください");
    }
    return dailyNotes.instance?.options ?? {};
  }

  private getDailyNotePath(date: Date, options: DailyNotesOptions): string {
    const format = options.format?.trim() || DEFAULT_DATE_FORMAT;
    const datedPath = createMoment(date).format(format);
    const withExtension = datedPath.toLowerCase().endsWith(".md") ? datedPath : `${datedPath}.md`;
    return normalizePath(options.folder ? `${options.folder}/${withExtension}` : withExtension);
  }

  private async readTemplate(templatePath: string | undefined): Promise<string> {
    if (!templatePath?.trim()) return "";
    const normalized = normalizePath(templatePath.toLowerCase().endsWith(".md") ? templatePath : `${templatePath}.md`);
    const file = this.app.vault.getAbstractFileByPath(normalized);
    if (!(file instanceof TFile)) {
      throw new Error(`Daily Notes テンプレートが見つかりません: ${normalized}`);
    }
    return this.app.vault.cachedRead(file);
  }

  private resolveTemplateVariables(template: string, date: Date, notePath: string): string {
    const value = createMoment(date);
    const title = notePath.slice(notePath.lastIndexOf("/") + 1).replace(/\.md$/iu, "");
    return template
      .replace(/\{\{\s*title\s*\}\}/giu, title)
      .replace(/\{\{\s*date(?:\s*:\s*([^}]+))?\s*\}\}/giu, (_match, format: string | undefined) =>
        value.format(format?.trim() || DEFAULT_DATE_FORMAT))
      .replace(/\{\{\s*time(?:\s*:\s*([^}]+))?\s*\}\}/giu, (_match, format: string | undefined) =>
        value.format(format?.trim() || "HH:mm"));
  }

  private async loadCompletedTasks(date: Date, options: DailyNotesOptions): Promise<CompletedTask[]> {
    const folder = normalizePath(options.folder?.trim() || "/");
    const format = options.format?.trim() || DEFAULT_DATE_FORMAT;
    const prefix = folder === "/" ? "" : `${folder}/`;
    const completed: CompletedTask[] = [];

    for (const file of this.app.vault.getMarkdownFiles()) {
      if (prefix && !file.path.startsWith(prefix)) continue;
      const relativePath = (prefix ? file.path.slice(prefix.length) : file.path).replace(/\.md$/iu, "");
      const parsed = createMoment(relativePath, format, true);
      if (!parsed.isValid() || parsed.valueOf() >= createMoment(date).startOf("day").valueOf()) continue;
      const content = await this.app.vault.cachedRead(file);
      completed.push(...collectCompletedTasks(content, parsed.toDate()));
    }

    return completed;
  }

  private async ensureParentFolders(path: string): Promise<void> {
    const parts = path.split("/").slice(0, -1);
    let current = "";
    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      if (!this.app.vault.getAbstractFileByPath(current)) {
        await this.app.vault.createFolder(current);
      }
    }
  }

  private showWarnings(warnings: readonly { line: number; message: string }[]): void {
    if (warnings.length === 0) return;
    const first = warnings[0]!;
    const suffix = warnings.length > 1 ? `（ほか ${warnings.length - 1} 件）` : "";
    new Notice(`Daily Task Gate: テンプレート ${first.line} 行目: ${first.message}${suffix}`, 8000);
    console.warn("Daily Task Gate template warnings", warnings);
  }

  private reportError(message: string, error: unknown): void {
    const detail = error instanceof Error ? error.message : String(error);
    console.error(`Daily Task Gate: ${message}`, error);
    new Notice(`Daily Task Gate: ${message}: ${detail}`, 8000);
  }

  private async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData() as Partial<DailyTaskGateSettings> | null);
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }
}

class DailyTaskGateSettingTab extends PluginSettingTab {
  constructor(app: App, private readonly plugin: DailyTaskGatePlugin) {
    super(app, plugin);
  }

  override display(): void {
    this.containerEl.empty();
    new Setting(this.containerEl)
      .setName("Keep Task Gate comments")
      .setDesc("Keep <!-- dtg: ... --> comments in created or inserted tasks.")
      .addToggle((toggle) => toggle
        .setValue(this.plugin.settings.keepComments)
        .onChange(async (value) => {
          this.plugin.settings.keepComments = value;
          await this.plugin.saveSettings();
        }));
  }
}
