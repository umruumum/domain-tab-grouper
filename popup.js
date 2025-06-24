// ポップアップUIの制御スクリプト

// ドメインからホスト名を抽出する関数
function extractDomain(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch (error) {
    return null;
  }
}

// 設定を保存する関数
async function saveSettings(settings) {
  try {
    await chrome.storage.local.set(settings);
  } catch (error) {
    console.error('Error saving settings:', error);
  }
}

// 設定を読み込む関数
async function loadSettings() {
  try {
    const result = await chrome.storage.local.get(['autoGroupEnabled', 'excludedDomains']);
    return {
      autoGroupEnabled: result.autoGroupEnabled !== false, // デフォルトはtrue
      excludedDomains: result.excludedDomains || [] // デフォルトは空配列
    };
  } catch (error) {
    console.error('Error loading settings:', error);
    return { autoGroupEnabled: true, excludedDomains: [] };
  }
}

// ステータスメッセージを表示
function showStatus(message) {
  const statusElement = document.getElementById('status');
  statusElement.textContent = message;
}

// グループリストを更新（現在のウィンドウのみ）
async function updateGroupList() {
  try {
    // 現在のウィンドウを取得
    const currentWindow = await chrome.windows.getCurrent();
    const groups = await chrome.tabGroups.query({ windowId: currentWindow.id });
    const groupList = document.getElementById('groupList');
    groupList.innerHTML = '';
    
    if (groups.length === 0) {
      groupList.innerHTML = '<div class="group-item">グループはありません</div>';
      return;
    }
    
    for (const group of groups) {
      const tabs = await chrome.tabs.query({ groupId: group.id });
      const groupElement = document.createElement('div');
      groupElement.className = 'group-item';
      groupElement.style.borderColor = getColorCode(group.color);
      
      groupElement.innerHTML = `
        <div class="group-title">${group.title || 'グループ'}</div>
        <div class="group-count">${tabs.length} タブ</div>
      `;
      
      groupList.appendChild(groupElement);
    }
  } catch (error) {
    console.error('Error updating group list:', error);
    showStatus('エラーが発生しました');
  }
}

// グループ色をカラーコードに変換
function getColorCode(color) {
  const colorMap = {
    grey: '#9aa0a6',
    blue: '#4285f4',
    red: '#ea4335',
    yellow: '#fbbc04',
    green: '#34a853',
    pink: '#ff6d01',
    purple: '#9c27b0',
    cyan: '#00bcd4'
  };
  return colorMap[color] || '#4285f4';
}

// タブをグループ化する関数（現在のウィンドウのみ）
async function groupTabs() {
  try {
    showStatus('タブをグループ化中...');
    
    // 現在のウィンドウIDを取得
    const currentWindow = await chrome.windows.getCurrent();
    
    // バックグラウンドスクリプトにメッセージを送信
    await chrome.runtime.sendMessage({ 
      action: 'groupTabsInWindow', 
      windowId: currentWindow.id 
    });
    
    // 少し待ってからグループリストを更新
    setTimeout(() => {
      updateGroupList();
      showStatus('グループ化完了');
    }, 1000);
  } catch (error) {
    console.error('Error grouping tabs:', error);
    showStatus('エラーが発生しました');
  }
}

// すべてのグループを解除する関数（現在のウィンドウのみ）
async function ungroupAll() {
  try {
    showStatus('グループを解除中...');
    
    // 現在のウィンドウのグループのみを取得
    const currentWindow = await chrome.windows.getCurrent();
    const groups = await chrome.tabGroups.query({ windowId: currentWindow.id });
    
    for (const group of groups) {
      const tabs = await chrome.tabs.query({ groupId: group.id });
      const tabIds = tabs.map(tab => tab.id);
      
      if (tabIds.length > 0) {
        await chrome.tabs.ungroup(tabIds);
      }
    }
    
    updateGroupList();
    showStatus('すべてのグループを解除しました');
  } catch (error) {
    console.error('Error ungrouping tabs:', error);
    showStatus('エラーが発生しました');
  }
}

// 自動グループ化の設定を切り替える関数
async function toggleAutoGroup() {
  try {
    const toggle = document.getElementById('autoGroupToggle');
    const enabled = toggle.checked;
    
    // 設定を保存
    await saveSettings({ autoGroupEnabled: enabled });
    
    // バックグラウンドスクリプトに設定変更を通知
    await chrome.runtime.sendMessage({ 
      action: 'toggleAutoGroup', 
      enabled: enabled 
    });
    
    // ステータス更新
    showStatus(enabled ? '自動グループ化が有効になりました' : '自動グループ化が無効になりました');
    
    // 有効になった場合は即座にグループ化を実行
    if (enabled) {
      setTimeout(() => {
        chrome.runtime.sendMessage({ action: 'groupTabs' });
      }, 500);
    }
  } catch (error) {
    console.error('Error toggling auto group:', error);
    showStatus('設定の更新に失敗しました');
  }
}

// 除外ドメインリストを更新する関数
async function updateExcludedDomainsList() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'getExcludedDomains' });
    if (response.success) {
      const excludedList = document.getElementById('excludedList');
      const excludedDomains = response.excludedDomains;
      
      if (excludedDomains.length === 0) {
        excludedList.innerHTML = '<div class="empty-state">除外ドメインはありません</div>';
      } else {
        excludedList.innerHTML = excludedDomains.map(domain => `
          <div class="excluded-item">
            <span class="excluded-domain">${domain}</span>
            <button class="remove-btn" data-domain="${domain}">削除</button>
          </div>
        `).join('');
        
        // 削除ボタンのイベントリスナーを追加
        excludedList.querySelectorAll('.remove-btn').forEach(btn => {
          btn.addEventListener('click', () => removeExcludedDomain(btn.dataset.domain));
        });
      }
    }
  } catch (error) {
    console.error('Error updating excluded domains list:', error);
  }
}

// ドメインを除外リストに追加する関数
async function addExcludedDomain(domain) {
  try {
    if (!domain || domain.trim() === '') {
      showStatus('ドメインを入力してください');
      return;
    }
    
    domain = domain.trim().toLowerCase();
    
    // 簡単なバリデーション
    if (!isValidDomain(domain)) {
      showStatus('無効なドメイン形式です');
      return;
    }
    
    showStatus('ドメインを除外中...');
    
    const response = await chrome.runtime.sendMessage({ 
      action: 'addExcludedDomain', 
      domain: domain 
    });
    
    if (response.success) {
      showStatus(`${domain} を除外しました`);
      await updateExcludedDomainsList();
      document.getElementById('domainInput').value = '';
    } else {
      showStatus(response.error || 'ドメインの追加に失敗しました');
    }
  } catch (error) {
    console.error('Error adding excluded domain:', error);
    showStatus('エラーが発生しました');
  }
}

// ドメインを除外リストから削除する関数
async function removeExcludedDomain(domain) {
  try {
    showStatus('ドメインの除外を解除中...');
    
    const response = await chrome.runtime.sendMessage({ 
      action: 'removeExcludedDomain', 
      domain: domain 
    });
    
    if (response.success) {
      showStatus(`${domain} の除外を解除しました`);
      await updateExcludedDomainsList();
      await updateGroupList();
    } else {
      showStatus(response.error || 'ドメインの削除に失敗しました');
    }
  } catch (error) {
    console.error('Error removing excluded domain:', error);
    showStatus('エラーが発生しました');
  }
}

// 現在のタブのドメインを除外リストに追加する関数
async function excludeCurrentTabDomain() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url) {
      showStatus('現在のタブのドメインを取得できません');
      return;
    }
    
    const domain = extractDomain(tab.url);
    if (!domain) {
      showStatus('このタブはグループ化対象外です');
      return;
    }
    
    await addExcludedDomain(domain);
  } catch (error) {
    console.error('Error excluding current tab domain:', error);
    showStatus('エラーが発生しました');
  }
}


// ドメインからホスト名を抽出する関数
function extractDomain(url) {
  try {
    const urlObj = new URL(url);
    
    // newtabページやChromeの内部ページは除外
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
    console.error('Invalid URL:', url);
    return null;
  }
}

// ドメインの形式をチェックする関数
function isValidDomain(domain) {
  // ワイルドカード形式 (*.example.com) の場合
  if (domain.startsWith('*.')) {
    domain = domain.slice(2);
  }
  
  // 基本的なドメイン形式チェック
  const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
  return domainRegex.test(domain);
}

// イベントリスナーを設定
document.addEventListener('DOMContentLoaded', async () => {
  // 設定を読み込んでトグルスイッチを初期化
  const settings = await loadSettings();
  const toggle = document.getElementById('autoGroupToggle');
  toggle.checked = settings.autoGroupEnabled;
  
  // 初期化時にグループリストと除外ドメインリストを更新
  updateGroupList();
  updateExcludedDomainsList();
  
  // ボタンのイベントリスナー
  document.getElementById('groupTabs').addEventListener('click', groupTabs);
  document.getElementById('ungroupAll').addEventListener('click', ungroupAll);
  
  // トグルスイッチのイベントリスナー
  toggle.addEventListener('change', toggleAutoGroup);
  
  // 除外ドメイン関連のイベントリスナー
  document.getElementById('addDomainBtn').addEventListener('click', () => {
    const domain = document.getElementById('domainInput').value;
    addExcludedDomain(domain);
  });
  
  document.getElementById('excludeCurrentBtn').addEventListener('click', excludeCurrentTabDomain);
  
  // Enterキーでドメイン追加
  document.getElementById('domainInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      const domain = document.getElementById('domainInput').value;
      addExcludedDomain(domain);
    }
  });
  
  // 定期的にグループリストを更新
  setInterval(updateGroupList, 2000);
  
  // 初期ステータスを設定
  showStatus(settings.autoGroupEnabled ? '自動グループ化が有効です' : '自動グループ化が無効です');
});

// バックグラウンドスクリプトからのメッセージをリッスン
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'updateGroupList') {
    updateGroupList();
  }
});