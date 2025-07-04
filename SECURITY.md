# セキュリティポリシー

## サポートされているバージョン

以下のバージョンがセキュリティアップデートでサポートされています：

| バージョン | サポート状況 |
| ------- | ----------- |
| 0.3.x   | ✅ |
| 0.2.x   | ✅ |
| < 0.2   | ❌ |

## 脆弱性の報告

セキュリティの脆弱性を発見した場合は、以下のガイドラインに従って報告してください：

### 🚨 緊急度の高い脆弱性

以下に該当する場合は**即座に**報告してください：
- ユーザーデータの漏洩につながる可能性
- 悪意のあるコード実行の可能性
- 権限昇格の脆弱性
- クロスサイトスクリプティング（XSS）
- 不正なタブ操作やブラウザ機能の悪用

### 📧 報告方法

**公開Issueは使用しないでください。** セキュリティ問題は以下の方法で報告してください：

1. **GitHub Security Advisory**（推奨）
   - リポジトリの「Security」タブから「Report a vulnerability」を選択
   - 詳細な説明と再現手順を記載

2. **プライベート連絡**
   - GitHubのプライベートメッセージ機能を使用

### 📝 報告に含めるべき情報

効果的な修正のため、以下の情報を含めてください：

- **脆弱性の種類**: XSS、権限昇格、データ漏洩など
- **影響範囲**: どのバージョンが影響を受けるか
- **再現手順**: 詳細なステップバイステップの手順
- **攻撃シナリオ**: 悪用される可能性のある方法
- **環境情報**: OS、ブラウザバージョン、拡張機能バージョン
- **修正提案**: 可能であれば修正方法の提案

### 🔐 報告後のプロセス

1. **24時間以内**: 報告の受領確認
2. **48時間以内**: 初期評価と重要度の判定
3. **7日以内**: 詳細調査と修正計画の策定
4. **14日以内**: 修正版のリリース（重要度により調整）

### 🏆 責任ある開示

脆弱性を発見したセキュリティ研究者の方々に感謝します：

- 修正が完了するまで脆弱性の詳細を公開しないでください
- 悪意のある目的でシステムにアクセスしないでください
- 報告された脆弱性は適切にクレジットします

### 🛡️ セキュリティ対策

このプロジェクトでは以下のセキュリティ対策を実施しています：

- **最小権限の原則**: 必要最小限のブラウザ権限のみ要求
- **入力検証**: すべてのユーザー入力を適切に検証
- **XSS防止**: Content Security Policy (CSP) の実装
- **定期的な依存関係更新**: セキュリティパッチの適用
- **コードレビュー**: すべての変更に対するレビュープロセス

### 📋 既知の制限事項

Chrome拡張機能の性質上、以下の制限があります：

- ユーザーが悪意のあるWebサイトを訪問した場合の完全な保護は困難
- 他の拡張機能との競合によるセキュリティリスク
- ブラウザ自体の脆弱性による影響

### 🔄 定期的なセキュリティレビュー

- 四半期ごとの依存関係監査
- 年次のセキュリティ評価
- リリース前のセキュリティチェック

---

セキュリティは私たちの最優先事項です。ご協力いただきありがとうございます。