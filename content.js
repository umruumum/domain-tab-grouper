// Content script for favicon color extraction
// Service WorkerではImage/Canvasが使用できないため、content scriptで色抽出を行う

// faviconから主要色を抽出する関数
function extractDominantColorFromFavicon(faviconUrl) {
  return new Promise((resolve) => {
    if (!faviconUrl || faviconUrl.startsWith('chrome://') || faviconUrl.startsWith('chrome-extension://')) {
      resolve(null);
      return;
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';
    
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        // faviconを32x32にリサイズして描画
        canvas.width = 32;
        canvas.height = 32;
        ctx.drawImage(img, 0, 0, 32, 32);
        
        // 画像データを取得
        const imageData = ctx.getImageData(0, 0, 32, 32);
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
          
          // 色を簡略化（8段階に量子化）
          const quantizedR = Math.floor(r / 32) * 32;
          const quantizedG = Math.floor(g / 32) * 32;
          const quantizedB = Math.floor(b / 32) * 32;
          
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
        
        resolve(dominantColor);
      } catch (error) {
        console.error('Error extracting color from favicon:', error);
        resolve(null);
      }
    };
    
    img.onerror = () => resolve(null);
    img.src = faviconUrl;
  });
}

// background scriptからのメッセージをリッスン
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'extractFaviconColor') {
    extractDominantColorFromFavicon(message.faviconUrl)
      .then(color => {
        sendResponse({ success: true, color: color });
      })
      .catch(error => {
        console.error('Error in favicon color extraction:', error);
        sendResponse({ success: false, error: error.message });
      });
    
    return true; // 非同期レスポンスを示す
  }
});