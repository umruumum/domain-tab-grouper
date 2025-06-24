# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## プロジェクト概要

ドメインベースでタブを自動グループ化するChrome拡張機能です。ページ遷移やタブ作成時に同じドメインのタブを動的にグループ化し、視覚的に管理しやすくします。

## アーキテクチャ

- **manifest.json**: Chrome拡張機能の設定ファイル（permissions、background script、popup設定）
- **background.js**: サービスワーカーとして動作するメインロジック
  - タブイベント（作成、更新）をリッスン
  - ドメイン抽出とグループ化の自動実行
  - 既存グループとの統合処理
- **popup.html/js**: 拡張機能のポップアップUI
  - 手動グループ化・解除機能
  - 現在のグループ状態の表示
  - バックグラウンドスクリプトとの通信

## 主要機能

1. **自動グループ化**: 同じドメインのタブが2つ以上ある場合に自動グループ化
2. **動的更新**: 新規タブ作成やページ遷移時のリアルタイム処理
3. **既存グループ統合**: 同じドメインの既存グループに新しいタブを追加
4. **視覚的区別**: ドメインごとに色分けされたタブグループ

## 開発時の注意点

- Chrome拡張機能のManifest V3を使用
- `chrome.tabs` と `chrome.tabGroups` APIが必要
- サービスワーカーは永続的でないため、イベント駆動で動作
- ドメイン抽出時にchrome://やchrome-extension://は除外
- 開発する際はmainをpullしてから開発してください
- 機能を追加したり、修正するときは必ずブランチを分けてください
  - 新機能: feature/hogehoge
  - 修正: fix/fugafuga
