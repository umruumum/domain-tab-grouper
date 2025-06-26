# コントリビューションガイド

Domain Tab Grouperプロジェクトへのコントリビューションに興味を持っていただき、ありがとうございます！

## 🤝 コントリビューションの方法

### バグ報告
バグを発見した場合は、[Issue](https://github.com/umruumum/domain-tab-grouper/issues)を作成してください。

### 機能リクエスト
新しい機能のアイデアがある場合は、[Feature Request](https://github.com/umruumum/domain-tab-grouper/issues)を作成してください。

### コード貢献
1. このリポジトリをフォーク
2. 新しいブランチを作成: `git checkout -b feature/your-feature-name`
3. 変更を実装
4. テストを実行して動作確認
5. コミット: `git commit -m 'Add some feature'`
6. プッシュ: `git push origin feature/your-feature-name`
7. Pull Requestを作成

## 🔧 開発環境の設定

### 必要な環境
- Chrome ブラウザ
- Git
- テキストエディタ（VS Code推奨）

### セットアップ手順
1. リポジトリをクローン
```bash
git clone https://github.com/umruumum/domain-tab-grouper.git
cd domain-tab-grouper
```

2. Chrome拡張機能として読み込み
   - `chrome://extensions/` を開く
   - 「デベロッパーモード」を有効化
   - 「パッケージ化されていない拡張機能を読み込む」でプロジェクトフォルダを選択

## 📝 コーディング規約

### ファイル構成
- `manifest.json`: 拡張機能の設定
- `background.js`: メインロジック（Service Worker）
- `popup.html/js`: ポップアップUI
- `content.js`: ページ内実行スクリプト
- `constants.js`: 定数定義
- `utils.js`: ユーティリティ関数

### コードスタイル
- **JavaScript**: ES6+ を使用
- **コメント**: 日本語で記述
- **ネーミング**: camelCase を使用
- **インデント**: 2スペース

### コミットメッセージ
コミットメッセージは以下の形式で記述してください：
```
[type] 変更内容の要約

詳細な説明（必要に応じて）

🤖 Generated with [Claude Code](https://claude.ai/code)

Co-Authored-By: Claude <noreply@anthropic.com>
```

**Type の種類:**
- `feat`: 新機能
- `fix`: バグ修正
- `docs`: ドキュメント更新
- `style`: コードスタイルの変更
- `refactor`: リファクタリング
- `test`: テスト追加
- `chore`: その他の変更

## 🧪 テスト

### 手動テスト
1. 拡張機能をリロード
2. 以下の機能をテスト：
   - 自動グループ化
   - 手動グループ化/解除
   - 除外ドメイン設定
   - ドメイン色設定
   - ドメイングループ名設定

### 確認事項
- [ ] 新機能が意図した通りに動作する
- [ ] 既存機能に悪影響がない
- [ ] UI/UXが一貫している
- [ ] エラーハンドリングが適切

## 🏗️ アーキテクチャガイド

### 主要コンポーネント
- **background.js**: タブイベント監視、グループ管理、設定管理
- **popup.js**: UI制御、設定同期、ユーザーインタラクション
- **content.js**: ファビコン色抽出

### 設計原則
- **単一責任**: 各ファイルは明確な責任を持つ
- **疎結合**: コンポーネント間の依存を最小化
- **拡張性**: 新機能を追加しやすい構造

## 📋 PR レビュープロセス

### レビュー基準
- [ ] 機能要件を満たしている
- [ ] コードが読みやすく保守しやすい
- [ ] 適切なエラーハンドリング
- [ ] 既存機能への影響なし
- [ ] ドキュメントが更新されている

### レビュー後の対応
- レビューコメントに対しては迅速に対応
- 変更が必要な場合は追加コミットで対応
- すべてのチェックがパスしたらマージ

## 🚨 セキュリティ

セキュリティに関する問題を発見した場合は、公開Issueではなく、プライベートな方法で報告してください。

## 🎯 優先事項

現在の開発優先順位：
1. 🐛 **バグ修正**: 既存機能の安定性向上
2. 🎨 **UI/UX改善**: ユーザビリティの向上
3. ⚡ **パフォーマンス**: 動作速度の改善
4. ✨ **新機能**: ユーザーからの要望機能

## 📞 質問・サポート

質問がある場合は、[Issues](https://github.com/umruumum/domain-tab-grouper/issues)で気軽にお聞きください。

---

皆様のコントリビューションをお待ちしています！ 🎉