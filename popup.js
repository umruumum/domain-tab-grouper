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
    const result = await chrome.storage.local.get(['autoGroupEnabled']);
    return {
      autoGroupEnabled: result.autoGroupEnabled !== false // デフォルトはtrue
    };
  } catch (error) {
    console.error('Error loading settings:', error);
    return { autoGroupEnabled: true };
  }
}

// ステータスメッセージを表示
function showStatus(message) {
  const statusElement = document.getElementById('status');
  statusElement.textContent = message;
}

// グループリストを更新
async function updateGroupList() {
  try {
    const groups = await chrome.tabGroups.query({});
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

// タブをグループ化する関数
async function groupTabs() {
  try {
    showStatus('タブをグループ化中...');
    
    // バックグラウンドスクリプトにメッセージを送信
    await chrome.runtime.sendMessage({ action: 'groupTabs' });
    
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

// すべてのグループを解除する関数
async function ungroupAll() {
  try {
    showStatus('グループを解除中...');
    
    const groups = await chrome.tabGroups.query({});
    
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

// イベントリスナーを設定
document.addEventListener('DOMContentLoaded', async () => {
  // 設定を読み込んでトグルスイッチを初期化
  const settings = await loadSettings();
  const toggle = document.getElementById('autoGroupToggle');
  toggle.checked = settings.autoGroupEnabled;
  
  // 初期化時にグループリストを更新
  updateGroupList();
  
  // ボタンのイベントリスナー
  document.getElementById('groupTabs').addEventListener('click', groupTabs);
  document.getElementById('ungroupAll').addEventListener('click', ungroupAll);
  
  // トグルスイッチのイベントリスナー
  toggle.addEventListener('change', toggleAutoGroup);
  
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