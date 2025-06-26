# Domain Tab Grouper 🗂️

[![Manifest V3](https://img.shields.io/badge/Manifest-V3-green.svg)](https://developer.chrome.com/docs/extensions/mv3/intro/)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

ドメインベースでタブを自動グループ化するChrome拡張機能です。ページ遷移を検知して動的にタブをグループ化し、ブラウジング体験を向上させます。

![Demo](docs/demo.gif)

## ✨ 主な機能

### 🔄 自動グループ化
- **リアルタイム検知**: タブ作成・ページ遷移を即座に検知
- **効率的グループ化**: 同じドメインのタブが2つ以上ある場合に自動グループ化
- **自動グループ解除**: グループが1つのタブになった時に自動解除
- **スマート移動**: ドメイン変更時に適切なグループへ自動移動

### 🎨 視覚的管理
- **ファビコン色抽出**: サイトのファビコンから自動的にグループ色を決定
- **手動色設定**: ドメインごとに好みの色を設定可能
- **カスタムグループ名**: ドメインごとに分かりやすいグループ名を設定
- **クリーンUI**: 直感的で使いやすいポップアップインターフェース

### ⚙️ 柔軟な制御
- **ON/OFF切り替え**: 自動グループ化の有効・無効をワンクリック
- **手動操作**: いつでも手動でグループ化・解除が可能
- **除外ドメイン設定**: 特定のドメインをグループ化から除外（ワイルドカード対応）
- **設定永続化**: 設定は自動保存され、再起動後も維持

## 🚀 インストール方法

### 推奨方法（Releaseからダウンロード）
1. [Releases ページ](https://github.com/umruumum/domain-tab-grouper/releases) から最新版をダウンロード

2. ダウンロードしたZIPファイルを解凍

3. Chromeの拡張機能ページを開く
```
chrome://extensions/
```

4. 右上の「デベロッパーモード」を有効化

5. 「パッケージ化されていない拡張機能を読み込む」をクリックして解凍したフォルダを選択

### 開発版（開発者向け）
1. このリポジトリをクローン
```bash
git clone https://github.com/umruumum/domain-tab-grouper.git
cd domain-tab-grouper
```

2. 上記手順3〜5を実行

## 📖 使用方法

### 基本操作
1. **自動グループ化**: 拡張機能をインストールすると自動的に開始
2. **手動制御**: ツールバーアイコンをクリックしてポップアップを表示
3. **ON/OFF**: トグルスイッチで自動グループ化を制御

### 具体例
```
例: google.com のタブが2つ以上ある場合
→ 「google.com」という名前のグループが自動作成される

例: 単一のタブの場合
→ グループ化せずに通常のタブのまま

例: あるタブで google.com から yahoo.com に遷移
→ 自動的に google.com グループから除外され、yahoo.com グループに移動（2つ以上ある場合）

例: グループが1つのタブになった場合
→ 自動的にグループが解除され、通常のタブに戻る

例: 除外ドメイン設定
→ "example.com" または "*.example.com" を追加
→ 該当ドメインはグループ化されなくなる
```

## 🏗️ アーキテクチャ

### ファイル構成
```
domain-tab-grouper/
├── manifest.json          # 拡張機能設定
├── background.js          # メインロジック（Service Worker）
├── popup.html             # ポップアップUI
├── popup.js              # UI制御スクリプト
├── icons/                # アイコンファイル
└── README.md             # このファイル
```

### 主要コンポーネント

#### 🔧 background.js
- **タブイベント監視**: 作成・更新・削除イベントをリッスン
- **ドメイン解析**: URLからドメインを抽出
- **グループ管理**: 動的なグループ作成・更新・削除
- **設定管理**: ON/OFF状態の永続化

#### 🎯 popup.js
- **UI制御**: トグルスイッチ・ボタンの制御
- **リアルタイム表示**: 現在のグループ状態を表示
- **設定同期**: バックグラウンドスクリプトとの通信

## 🛠️ 技術仕様

- **Manifest Version**: 3.0
- **必要な権限**: `tabs`, `tabGroups`, `activeTab`, `storage`
- **対応ブラウザ**: Chrome（Chromium系ブラウザでも動作可能）

## 🔧 開発者向け情報

### デバッグ方法
1. `chrome://extensions/` で拡張機能の「詳細」をクリック
2. 「バックグラウンドページを検査」でデベロッパーツールを開く
3. コンソールでログを確認

### カスタマイズ
```javascript
// グループの色をカスタマイズ
function getGroupColor(domain) {
  const colors = ['blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'grey'];
  // カスタムロジックをここに追加
}
```

## 🎯 今後の予定

- [ ] サブドメイン単位でのグループ化オプション  
- [x] グループ名のカスタマイズ機能
- [x] 除外ドメイン設定
- [x] ファビコン色抽出機能
- [x] ドメイン別色設定
- [ ] エクスポート・インポート機能
- [ ] ショートカットキー対応

## 🤝 コントリビューション

コントリビューションを歓迎します！

1. このリポジトリをフォーク
2. フィーチャーブランチを作成 (`git checkout -b feature/amazing-feature`)
3. 変更をコミット (`git commit -m 'Add amazing feature'`)
4. ブランチにプッシュ (`git push origin feature/amazing-feature`)
5. プルリクエストを作成

## 📝 ライセンス

このプロジェクトは MIT ライセンスの下で公開されています。詳細は [LICENSE](LICENSE) ファイルをご覧ください。

## 🙏 謝辞

- Chrome Extensions API の豊富な機能
- オープンソースコミュニティからのインスピレーション

---

<div align="center">
Made with ❤️ for better browsing experience
</div>