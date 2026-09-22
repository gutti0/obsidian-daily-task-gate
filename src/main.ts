import {
  App,
  Component,
  Editor,
  getLanguage,
  MarkdownRenderer,
  Modal,
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
  processTemplate,
} from "./core";
import type { CompletedTask, GateWarning } from "./core";
import { getStrings, localizeWarning } from "./i18n";
import type { Strings } from "./i18n";

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
  readonly language = getLanguage();
  readonly strings = getStrings(this.language);

  override async onload(): Promise<void> {
    await this.loadSettings();

    this.addCommand({
      id: "open-todays-daily-note",
      name: this.strings.commands.openToday,
      callback: () => this.openTodaysDailyNote(),
    });

    this.addCommand({
      id: "insert-todays-tasks",
      name: this.strings.commands.insertToday,
      editorCallback: (editor: Editor) => this.insertTodaysTasks(editor),
    });

    this.addCommand({
      id: "preview-todays-tasks",
      name: this.strings.commands.previewToday,
      callback: () => this.previewTodaysTasks(),
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
        throw new Error(this.strings.errors.unusableDailyPath(notePath));
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
      this.reportError(this.strings.errors.openDaily, error);
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

      if (result.includedTaskCount === 0) {
        new Notice(this.strings.notices.noTasks);
        return;
      }

      editor.replaceSelection(result.insertionContent);
    } catch (error) {
      this.reportError(this.strings.errors.insertTasks, error);
    }
  }

  async previewTodaysTasks(): Promise<void> {
    try {
      const date = createMoment().toDate();
      const daily = this.getDailyNotesOptions();
      const notePath = this.getDailyNotePath(date, daily);
      const template = await this.readTemplate(daily.template);
      const resolved = this.resolveTemplateVariables(template, date, notePath);
      const completedTasks = await this.loadCompletedTasks(date, daily);
      const result = processTemplate(resolved, date, completedTasks, this.settings);
      this.showWarnings(result.warnings);

      new TaskPreviewModal(
        this.app,
        createMoment(date).format(DEFAULT_DATE_FORMAT),
        result.insertionContent,
        result.includedTaskCount,
        daily.template ?? "",
        this.strings,
      ).open();
    } catch (error) {
      this.reportError(this.strings.errors.previewTasks, error);
    }
  }

  private getDailyNotesOptions(): DailyNotesOptions {
    const dailyNotes = (this.app as AppWithInternalPlugins).internalPlugins.getPluginById("daily-notes");
    if (!dailyNotes?.enabled) {
      throw new Error(this.strings.errors.dailyNotesDisabled);
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
      throw new Error(this.strings.errors.templateMissing(normalized));
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

  private showWarnings(warnings: readonly GateWarning[]): void {
    if (warnings.length === 0) return;
    const first = warnings[0]!;
    const suffix = warnings.length > 1 ? this.strings.notices.moreWarnings(warnings.length - 1) : "";
    const lineLabel = this.language.toLowerCase().startsWith("ja") ? `${first.line} 行目` : `line ${first.line}`;
    new Notice(`${this.strings.notices.warningPrefix} ${lineLabel}: ${localizeWarning(first, this.language)}${suffix}`, 8000);
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
    const strings = this.plugin.strings.settings;
    new Setting(this.containerEl)
      .setName(strings.keepCommentsName)
      .setDesc(strings.keepCommentsDescription)
      .addToggle((toggle) => toggle
        .setValue(this.plugin.settings.keepComments)
        .onChange(async (value) => {
          this.plugin.settings.keepComments = value;
          await this.plugin.saveSettings();
        }));

    new Setting(this.containerEl)
      .setName(strings.rulesHeading)
      .setHeading();
    this.containerEl.createEl("p", { text: strings.rulesIntroduction });

    const tableWrapper = this.containerEl.createDiv({ cls: "daily-task-gate-rule-table-wrapper" });
    const table = tableWrapper.createEl("table", { cls: "daily-task-gate-rule-table" });
    const header = table.createEl("thead").createEl("tr");
    header.createEl("th", { text: strings.conditionColumn });
    header.createEl("th", { text: strings.descriptionColumn });
    const body = table.createEl("tbody");
    strings.references.forEach((reference) => {
      const row = body.createEl("tr");
      row.createEl("td").createEl("code", { text: reference.condition });
      row.createEl("td", { text: reference.description });
    });

    this.containerEl.createEl("h4", { text: strings.fullExampleHeading });
    this.containerEl.createEl("pre", { cls: "daily-task-gate-rule-example" })
      .createEl("code", { text: strings.fullExample });
  }
}

class TaskPreviewModal extends Modal {
  private readonly renderer = new Component();

  constructor(
    app: App,
    private readonly dateLabel: string,
    private readonly markdown: string,
    private readonly taskCount: number,
    private readonly sourcePath: string,
    private readonly strings: Strings,
  ) {
    super(app);
  }

  override async onOpen(): Promise<void> {
    this.renderer.load();
    this.modalEl.addClass("daily-task-gate-preview-modal");
    this.setTitle(this.strings.preview.title(this.dateLabel));
    this.contentEl.empty();
    this.contentEl.createEl("p", {
      cls: "daily-task-gate-preview-summary",
      text: this.strings.preview.taskCount(this.taskCount),
    });

    if (!this.markdown.trim()) {
      this.contentEl.createEl("p", {
        cls: "daily-task-gate-preview-empty",
        text: this.strings.preview.empty,
      });
      return;
    }

    const preview = this.contentEl.createDiv({ cls: "daily-task-gate-preview markdown-rendered" });
    await MarkdownRenderer.render(this.app, this.markdown, preview, this.sourcePath, this.renderer);
    preview.querySelectorAll<HTMLInputElement>('input[type="checkbox"]').forEach((checkbox) => {
      checkbox.tabIndex = -1;
      checkbox.setAttribute("aria-disabled", "true");
    });
  }

  override onClose(): void {
    this.renderer.unload();
    this.contentEl.empty();
  }
}
