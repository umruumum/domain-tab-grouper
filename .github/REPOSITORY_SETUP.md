# リポジトリ公開設定ガイド

このドキュメントは、Domain Tab Grouperリポジトリを外部に公開するための設定手順を説明します。

## 🔓 リポジトリの可視性設定

### 1. パブリック設定
1. GitHub リポジトリページで「Settings」タブを開く
2. 下部の「Danger Zone」セクションで「Change repository visibility」をクリック
3. 「Make public」を選択して確認

## 🛡️ ブランチ保護ルール設定

### 1. main ブランチの保護
**Settings** > **Branches** > **Add rule** で以下を設定：

```
Branch name pattern: main

☑️ Restrict pushes that create files larger than 100MB
☑️ Require a pull request before merging
  ☑️ Require approvals (1人)
  ☑️ Dismiss stale PR approvals when new commits are pushed
  ☑️ Require review from code owners
☑️ Require status checks to pass before merging
  ☑️ Require branches to be up to date before merging
☑️ Require conversation resolution before merging
☑️ Include administrators
```

### 2. 推奨設定
- **Allow force pushes**: ❌ 無効
- **Allow deletions**: ❌ 無効

## 👥 コラボレーター権限設定

### 1. 基本権限設定
**Settings** > **Manage access** で：
- **Base permissions**: Read
- **Allow auto-merge**: ✅ 有効（メンテナー用）

### 2. チーム/ユーザー追加
必要に応じて信頼できるコントリビューターを追加：
- **Write**: アクティブな開発者
- **Maintain**: プロジェクトメンテナー
- **Admin**: プロジェクトオーナー

## 🏷️ ラベル設定

### 1. 必須ラベル
**Issues** > **Labels** で以下のラベルを作成：

| ラベル名 | 色 | 説明 |
|---------|-----|-----|
| `bug` | `#d73a4a` | バグ報告 |
| `enhancement` | `#a2eeef` | 新機能要望 |
| `documentation` | `#0075ca` | ドキュメント改善 |
| `help wanted` | `#008672` | コミュニティからの協力を求める |
| `good first issue` | `#7057ff` | 初心者向けのタスク |
| `question` | `#d876e3` | 質問 |
| `wontfix` | `#ffffff` | 修正しない |
| `duplicate` | `#cfd3d7` | 重複 |
| `priority: high` | `#b60205` | 高優先度 |
| `priority: medium` | `#fbca04` | 中優先度 |
| `priority: low` | `#0e8a16` | 低優先度 |

## 🔒 セキュリティ設定

### 1. Security Advisories
**Security** > **Security advisories** で：
- **Private vulnerability reporting**: ✅ 有効

### 2. Dependabot
**Security** > **Dependabot** で：
- **Dependabot alerts**: ✅ 有効
- **Dependabot security updates**: ✅ 有効

### 3. Code scanning
**Security** > **Code scanning** で：
- **CodeQL analysis**: ✅ 有効（推奨）

## ⚙️ 一般設定

### 1. Features
**Settings** > **General** > **Features** で：
- **Wikis**: ❌ 無効（READMEで十分）
- **Issues**: ✅ 有効
- **Sponsorships**: お好みで
- **Projects**: ✅ 有効（プロジェクト管理用）
- **Preserve this repository**: ✅ 有効（GitHub Archive Program）

### 2. Pull Requests
**Settings** > **General** > **Pull Requests** で：
- **Allow merge commits**: ✅ 有効
- **Allow squash merging**: ✅ 有効
- **Allow rebase merging**: ❌ 無効（推奨）
- **Always suggest updating pull request branches**: ✅ 有効
- **Allow auto-merge**: ✅ 有効
- **Automatically delete head branches**: ✅ 有効

## 📊 Insights設定

### 1. Community Standards
**Insights** > **Community** で以下が完了していることを確認：
- ✅ Description
- ✅ README
- ✅ Code of conduct
- ✅ Contributing
- ✅ License
- ✅ Security policy
- ✅ Issue templates
- ✅ Pull request template

## 🚀 GitHub Actions 設定

### 1. Actions permissions
**Settings** > **Actions** > **General** で：
- **Actions permissions**: "Allow all actions and reusable workflows"
- **Artifact and log retention**: 90 days
- **Fork pull request workflows**: "Require approval for first-time contributors"

### 2. 必要なSecrets
**Settings** > **Secrets and variables** > **Actions** で：
- 現在は特に不要（パブリックリリースのみ）

## 📈 分析とモニタリング

### 1. Traffic分析
- **Insights** > **Traffic** で訪問者数を確認
- **Clones**、**Views**、**Popular content** を監視

### 2. コミュニティ健全性
- **Insights** > **Community** で定期的に確認
- **Contributors**、**Commit activity** を監視

## 🎯 推奨する初期アクション

1. **リポジトリ説明の設定**
   ```
   ドメインベースでタブを自動グループ化するChrome拡張機能
   ```

2. **トピックの追加**
   ```
   chrome-extension, tabs, productivity, javascript, browser-extension
   ```

3. **ソーシャルプレビューの設定**
   - リポジトリ画像をアップロード（推奨: 1280x640px）

4. **READMEバッジの確認**
   - 現在のバッジが適切に表示されることを確認

## 📋 公開前チェックリスト

- [ ] リポジトリをパブリックに設定
- [ ] ブランチ保護ルールを設定
- [ ] 必要なラベルを作成
- [ ] セキュリティ機能を有効化
- [ ] コミュニティスタンダードを満たす
- [ ] Actions権限を適切に設定
- [ ] 説明とトピックを追加
- [ ] ソーシャルプレビューを設定

---

これらの設定により、安全で管理しやすいオープンソースプロジェクトとして運営できます。