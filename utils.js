// ユーティリティクラス

import { LOG_LEVELS, CONFIG } from './constants.js';

// LRUキャッシュ実装（メモリリーク防止）
export class LRUCache {
  constructor(maxSize = CONFIG.MAX_CACHE_SIZE) {
    this.maxSize = maxSize;
    this.cache = new Map();
  }

  get(key) {
    if (this.cache.has(key)) {
      // アクセスされたアイテムを最新にする
      const value = this.cache.get(key);
      this.cache.delete(key);
      this.cache.set(key, value);
      return value;
    }
    return undefined;
  }

  set(key, value) {
    if (this.cache.has(key)) {
      // 既存のキーの場合は削除してから追加（最新にする）
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // キャッシュが満杯の場合、最も古いアイテムを削除
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(key, value);
  }

  delete(key) {
    return this.cache.delete(key);
  }

  has(key) {
    return this.cache.has(key);
  }

  clear() {
    this.cache.clear();
  }

  size() {
    return this.cache.size;
  }
}

// ログ機能（レベル制御付き）
export class Logger {
  static log(level, message, ...args) {
    if (level <= CONFIG.CURRENT_LOG_LEVEL) {
      switch (level) {
        case LOG_LEVELS.ERROR:
          console.error(message, ...args);
          break;
        case LOG_LEVELS.WARN:
          console.warn(message, ...args);
          break;
        case LOG_LEVELS.INFO:
          console.info(message, ...args);
          break;
        case LOG_LEVELS.DEBUG:
          console.debug(message, ...args);
          break;
      }
    }
  }

  static error(message, ...args) {
    this.log(LOG_LEVELS.ERROR, message, ...args);
  }

  static warn(message, ...args) {
    this.log(LOG_LEVELS.WARN, message, ...args);
  }

  static info(message, ...args) {
    this.log(LOG_LEVELS.INFO, message, ...args);
  }

  static debug(message, ...args) {
    this.log(LOG_LEVELS.DEBUG, message, ...args);
  }
}

// ドメイン抽出ユーティリティ
export function extractDomain(url) {
  try {
    const urlObj = new URL(url);
    
    // Chrome内部ページは除外
    if (urlObj.protocol === 'chrome:' || 
        urlObj.protocol === 'chrome-extension:' ||
        url.includes('chrome://newtab/') ||
        url.includes('chrome://new-tab-page/') ||
        url === 'chrome://newtab/' ||
        url === 'about:blank' ||
        url === '') {
      return null;
    }
    
    return urlObj.hostname;
  } catch (error) {
    Logger.error('Invalid URL:', url);
    return null;
  }
}