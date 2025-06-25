// 定数定義ファイル - Chrome拡張機能のタブグループ色設定

// Chrome拡張機能のグループカラーとその代表RGB値
export const GROUP_COLORS = {
  'red': { r: 255, g: 67, b: 54 },
  'pink': { r: 255, g: 139, b: 203 }, // #ff8bcb
  'purple': { r: 156, g: 39, b: 176 },
  'blue': { r: 33, g: 150, b: 243 },
  'cyan': { r: 0, g: 188, b: 212 },
  'green': { r: 76, g: 175, b: 80 },
  'yellow': { r: 255, g: 235, b: 59 },
  'grey': { r: 158, g: 158, b: 158 }
};

// ポップアップUIで使用するカラーコード
export const COLOR_CODES = {
  grey: '#9aa0a6',
  blue: '#4285f4',
  red: '#ea4335',
  yellow: '#fbbc04',
  green: '#34a853',
  pink: '#ff8bcb',
  purple: '#9c27b0',
  cyan: '#00bcd4'
};

// ログレベル設定
export const LOG_LEVELS = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3
};

// 設定可能な値
export const CONFIG = {
  // キャッシュの最大サイズ（メモリリーク防止）
  MAX_CACHE_SIZE: 100,
  
  // ログレベル（本番環境では ERROR または WARN を推奨）
  CURRENT_LOG_LEVEL: LOG_LEVELS.INFO,
  
  // favicon色抽出のキャンバスサイズ
  FAVICON_CANVAS_SIZE: 32,
  
  // 色量子化レベル（8段階）
  COLOR_QUANTIZATION_LEVEL: 32
};