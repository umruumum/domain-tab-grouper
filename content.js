// Content script for favicon color extraction
// Service WorkerではImage/Canvasが使用できないため、content scriptで色抽出を行う

// 設定定数（constants.jsから複製）
const CONFIG = {
  FAVICON_CANVAS_SIZE: 32,
  COLOR_QUANTIZATION_LEVEL: 32
};

// faviconから主要色を抽出する関数
function extractDominantColorFromFavicon(faviconUrl) {
  console.log(`[Content Script] Extracting color from favicon: ${faviconUrl}`);
  
  return new Promise((resolve) => {
    if (!faviconUrl || faviconUrl.startsWith('chrome://') || faviconUrl.startsWith('chrome-extension://')) {
      console.log(`[Content Script] Invalid favicon URL: ${faviconUrl}`);
      resolve(null);
      return;
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';
    
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        // faviconを設定サイズにリサイズして描画
        const size = CONFIG.FAVICON_CANVAS_SIZE;
        canvas.width = size;
        canvas.height = size;
        ctx.drawImage(img, 0, 0, size, size);
        
        // 画像データを取得
        const imageData = ctx.getImageData(0, 0, size, size);
        const data = imageData.data;
        
        // 色のヒストグラムを作成
        const colorCounts = {};
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const a = data[i + 3];
          
          // 透明ピクセルと白に近い色はスキップ
          if (a < 128 || (r > 240 && g > 240 && b > 240)) continue;
          
          // 色を簡略化（設定された段階に量子化）
          const level = CONFIG.COLOR_QUANTIZATION_LEVEL;
          const quantizedR = Math.floor(r / level) * level;
          const quantizedG = Math.floor(g / level) * level;
          const quantizedB = Math.floor(b / level) * level;
          
          const colorKey = `${quantizedR},${quantizedG},${quantizedB}`;
          colorCounts[colorKey] = (colorCounts[colorKey] || 0) + 1;
        }
        
        // 最も多く使われている色を取得
        let dominantColor = null;
        let maxCount = 0;
        
        for (const [colorKey, count] of Object.entries(colorCounts)) {
          if (count > maxCount) {
            maxCount = count;
            const [r, g, b] = colorKey.split(',').map(Number);
            dominantColor = { r, g, b };
          }
        }
        
        console.log(`[Content Script] Extracted dominant color:`, dominantColor, `from ${Object.keys(colorCounts).length} colors`);
        resolve(dominantColor);
      } catch (error) {
        console.error('Error extracting color from favicon:', error);
        resolve(null);
      }
    };
    
    img.onerror = () => {
      console.log(`[Content Script] Failed to load favicon: ${faviconUrl}`);
      resolve(null);
    };
    
    img.src = faviconUrl;
  });
}

// background scriptからのメッセージをリッスン
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log(`[Content Script] Received message:`, message);
  
  if (message.action === 'extractFaviconColor') {
    extractDominantColorFromFavicon(message.faviconUrl)
      .then(color => {
        console.log(`[Content Script] Sending response:`, { success: true, color });
        sendResponse({ success: true, color: color });
      })
      .catch(error => {
        console.error('[Content Script] Error in favicon color extraction:', error);
        sendResponse({ success: false, error: error.message });
      });
    
    return true; // 非同期レスポンスを示す
  }
});