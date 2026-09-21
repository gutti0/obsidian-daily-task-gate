# Obsidian Daily Task Gate

Daily Notes のテンプレートから、その日の条件に合うタスクだけを残して Daily Note を作成する Obsidian プラグインです。既存のノートは変更しません。

## コマンド

- `Daily Task Gate: Open today's daily note` は、今日のノートがあればそのまま開き、なければテンプレートを処理して作成します。
- `Daily Task Gate: Insert today's tasks` は、現在のカーソル位置へ、条件に合う `dtg` 付きタスクだけを挿入します。

保存先、日付形式、テンプレートは、コアプラグイン Daily Notes の設定を使います。Daily Notes を有効にしてから利用してください。

## 条件

```markdown
- [ ] 月初処理 <!-- dtg: month-start -->
- [ ] 月末処理 <!-- dtg: month-end -->
- [ ] ゴミ出し <!-- dtg: weekday=mon,thu -->
- [ ] 定期確認 <!-- dtg: weekday=mon; nth=1,3 -->
- [ ] 処理 <!-- dtg: day-from=5; day-until=10 -->
- [ ] 振込 <!-- dtg: day-until=10; until-done; scope=month -->
```

複数条件は AND で評価します。対応する曜日は `mon`、`tue`、`wed`、`thu`、`fri`、`sat`、`sun` です。

`until-done` は、対象範囲の過去の Daily Note に同名の完了タスクがあると非表示になります。`scope=month` が既定値で、`scope=all` も指定できます。今日のノートは検索対象に含めません。

同名判定では、チェック状態、Task Gate コメント、前後の空白を除いた本文を完全一致で比較します。条件の書式に誤りがある行は、安全のため削除せず、通知と開発者コンソールへ警告を出します。

## 設定

`Keep Task Gate comments` を有効にすると、生成後や挿入後も `<!-- dtg: ... -->` を残します。初期値は無効です。

## 開発

```bash
npm install
npm test
npm run build
```

`main.js`、`manifest.json`、必要に応じて `styles.css` を Vault の `.obsidian/plugins/obsidian-daily-task-gate/` に配置します。

