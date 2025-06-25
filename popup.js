// ポップアップUIの制御スクリプト

// Chrome拡張機能のカラーコード定義（constants.jsから移植）
const COLOR_CODES = {
  grey: '#9aa0a6',
  blue: '#4285f4',
  red: '#ea4335',
  yellow: '#fbbc04',
  green: '#34a853',
  pink: '#ff8bcb',
  purple: '#9c27b0',
  cyan: '#00bcd4'
};

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
    const result = await chrome.storage.local.get(['autoGroupEnabled', 'excludedDomains', 'domainColors']);
    return {
      autoGroupEnabled: result.autoGroupEnabled !== false, // デフォルトはtrue
      excludedDomains: result.excludedDomains || [], // デフォルトは空配列
      domainColors: result.domainColors || {} // デフォルトは空オブジェクト
    };
  } catch (error) {
    console.error('Error loading settings:', error);
    return { autoGroupEnabled: true, excludedDomains: [], domainColors: {} };
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
    
    // スクロール位置を保存
    const scrollTop = groupList.scrollTop;
    
    // 既存の内容をクリア
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
      groupElement.dataset.domain = group.title;
      groupElement.dataset.groupId = group.id;
      
      
      // グループタイトルが有効な場合のみクリックイベントを追加
      const groupTitle = group.title;
      const displayTitle = groupTitle || 'グループ';
      
      groupElement.innerHTML = `
        <div class="group-title">${displayTitle}</div>
        <div class="group-count">${tabs.length} タブ</div>
      `;
      
      // グループタイトルが有効な場合のみクリックイベントを追加
      if (groupTitle && groupTitle.trim() !== '') {
        groupElement.addEventListener('click', (e) => handleGroupClick(e, groupTitle));
        groupElement.addEventListener('contextmenu', (e) => handleGroupRightClick(e, groupTitle));
        groupElement.style.cursor = 'pointer';
      } else {
        console.warn(`Group ${group.id} has no valid title, skipping click events`);
        groupElement.style.cursor = 'default';
      }
      
      groupList.appendChild(groupElement);
    }
    
    // スクロール位置を復元
    groupList.scrollTop = scrollTop;
  } catch (error) {
    console.error('Error updating group list:', error);
    showStatus('エラーが発生しました');
  }
}

// グループ色をカラーコードに変換
function getColorCode(color) {
  return COLOR_CODES[color] || COLOR_CODES.blue;
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
    if (response && response.success) {
      const excludedList = document.getElementById('excludedList');
      const excludedDomains = response.excludedDomains;
      
      // スクロール位置を保存
      const scrollTop = excludedList.scrollTop;
      
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
      
      // スクロール位置を復元
      excludedList.scrollTop = scrollTop;
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
    
    if (response && response.success) {
      showStatus(`${domain} を除外しました`);
      await updateExcludedDomainsList();
      document.getElementById('domainInput').value = '';
    } else {
      showStatus((response && response.error) || 'ドメインの追加に失敗しました');
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
    
    if (response && response.success) {
      showStatus(`${domain} の除外を解除しました`);
      await updateExcludedDomainsList();
      await updateGroupList();
    } else {
      showStatus((response && response.error) || 'ドメインの削除に失敗しました');
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

// ドメイン色リストを更新する関数
async function updateDomainColorsList() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'getDomainColors' });
    if (response && response.success) {
      const colorList = document.getElementById('colorList');
      const domainColors = response.domainColors;
      
      // スクロール位置を保存
      const scrollTop = colorList.scrollTop;
      
      if (Object.keys(domainColors).length === 0) {
        colorList.innerHTML = '<div class="empty-state">ドメイン色設定はありません</div>';
      } else {
        colorList.innerHTML = Object.entries(domainColors).map(([domain, color]) => `
          <div class="color-item">
            <span class="color-domain">${domain}</span>
            <span class="color-badge ${color}">${getColorLabel(color)}</span>
            <button class="remove-btn" data-domain="${domain}">削除</button>
          </div>
        `).join('');
        
        // 削除ボタンのイベントリスナーを追加
        colorList.querySelectorAll('.remove-btn').forEach(btn => {
          btn.addEventListener('click', () => removeDomainColor(btn.dataset.domain));
        });
      }
      
      // スクロール位置を復元
      colorList.scrollTop = scrollTop;
    }
  } catch (error) {
    console.error('Error updating domain colors list:', error);
  }
}

// 色ラベルを取得する関数
function getColorLabel(color) {
  const colorLabels = {
    'red': 'Red',
    'pink': 'Pink', 
    'purple': 'Purple',
    'blue': 'Blue',
    'cyan': 'Cyan',
    'green': 'Green',
    'yellow': 'Yellow',
    'grey': 'Grey'
  };
  return colorLabels[color] || color;
}

// ドメイン色を設定する関数
async function addDomainColor(domain, color) {
  try {
    
    if (!domain || domain.trim() === '') {
      showStatus('ドメインを入力してください');
      return;
    }
    
    if (!color) {
      showStatus('色を選択してください');
      return;
    }
    
    domain = domain.trim().toLowerCase();
    
    // 簡単なバリデーション
    if (!isValidDomain(domain)) {
      showStatus('無効なドメイン形式です');
      return;
    }
    
    showStatus('ドメイン色を設定中...');
    
    const response = await chrome.runtime.sendMessage({ 
      action: 'setDomainColor', 
      domain: domain,
      color: color
    });
    
    
    if (response && response.success) {
      showStatus(`${domain} の色を ${getColorLabel(color)} に設定しました`);
      await updateDomainColorsList();
      
      // 入力フィールドをクリア（存在する場合のみ）
      const domainInput = document.getElementById('colorDomainInput');
      const colorSelect = document.getElementById('colorSelect');
      if (domainInput) domainInput.value = '';
      if (colorSelect) colorSelect.value = '';
      
      // グループリストも更新（色が変わったため）
      setTimeout(() => {
        updateGroupList();
      }, 500);
    } else {
      showStatus((response && response.error) || 'ドメイン色の設定に失敗しました');
    }
  } catch (error) {
    console.error('Error setting domain color:', error);
    showStatus('エラーが発生しました');
  }
}

// ドメイン色を削除する関数
async function removeDomainColor(domain) {
  try {
    showStatus('ドメイン色設定を削除中...');
    
    const response = await chrome.runtime.sendMessage({ 
      action: 'removeDomainColor', 
      domain: domain 
    });
    
    if (response && response.success) {
      showStatus(`${domain} の色設定を削除しました`);
      await updateDomainColorsList();
      
      // グループリストも更新（色が変わったため）
      setTimeout(() => {
        updateGroupList();
      }, 500);
    } else {
      showStatus((response && response.error) || 'ドメイン色設定の削除に失敗しました');
    }
  } catch (error) {
    console.error('Error removing domain color:', error);
    showStatus('エラーが発生しました');
  }
}

// 現在のタブのドメイン色を設定する関数
async function setCurrentTabColor() {
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
    
    const colorSelect = document.getElementById('colorSelect');
    if (!colorSelect.value) {
      showStatus('色を選択してください');
      return;
    }
    
    document.getElementById('colorDomainInput').value = domain;
    await addDomainColor(domain, colorSelect.value);
  } catch (error) {
    console.error('Error setting current tab color:', error);
    showStatus('エラーが発生しました');
  }
}

// グローバル変数でコンテキストメニューの状態を管理
let currentContextDomain = null;

// グループをクリックしたときの処理
function handleGroupClick(event, domain) {
  event.preventDefault();
  
  // ドメインがnullの場合、datasetから取得を試行
  let finalDomain = domain;
  if (!finalDomain || finalDomain === 'null' || finalDomain.trim() === '') {
    finalDomain = event.currentTarget.dataset.domain;
  }
  
  
  hideContextMenu();
  showContextMenu(event, finalDomain);
}

// グループを右クリックしたときの処理
function handleGroupRightClick(event, domain) {
  event.preventDefault();
  
  // ドメインがnullの場合、datasetから取得を試行
  let finalDomain = domain;
  if (!finalDomain || finalDomain === 'null' || finalDomain.trim() === '') {
    finalDomain = event.currentTarget.dataset.domain;
  }
  
  
  hideContextMenu();
  showContextMenu(event, finalDomain);
}

// コンテキストメニューを表示
function showContextMenu(event, domain) {
  const contextMenu = document.getElementById('contextMenu');
  
  // ドメインがnullの場合、dataset.domainをフォールバックとして使用
  if (!domain || domain === 'null' || domain.trim() === '') {
    const fallbackDomain = event.currentTarget.dataset.domain;
    domain = fallbackDomain;
  }
  
  currentContextDomain = domain;
  
  
  if (!domain || domain === 'null' || domain.trim() === '') {
    console.error('Cannot show context menu: invalid domain');
    showStatus('無効なグループです');
    return;
  }
  
  // メニューの位置を計算
  const rect = event.currentTarget.getBoundingClientRect();
  const popupRect = document.body.getBoundingClientRect();
  
  contextMenu.style.left = Math.min(rect.right + 10, popupRect.width - 160) + 'px';
  contextMenu.style.top = rect.top + 'px';
  contextMenu.style.display = 'block';
  
  // 少し遅らせてクリック外し処理を有効化
  setTimeout(() => {
    document.addEventListener('click', handleClickOutside);
  }, 100);
}

// コンテキストメニューを非表示
function hideContextMenu() {
  const contextMenu = document.getElementById('contextMenu');
  contextMenu.style.display = 'none';
  currentContextDomain = null;
  document.removeEventListener('click', handleClickOutside);
}

// メニュー外をクリックしたときの処理
function handleClickOutside(event) {
  const contextMenu = document.getElementById('contextMenu');
  if (!contextMenu.contains(event.target)) {
    hideContextMenu();
  }
}

// 除外ドメインに追加（コンテキストメニューから）
async function excludeDomainFromMenu() {
  if (!currentContextDomain) {
    showStatus('ドメインが選択されていません');
    return;
  }
  
  
  // currentContextDomainを保持するため、先にドメインを保存
  const domainToExclude = currentContextDomain;
  
  hideContextMenu();
  
  try {
    showStatus(`${domainToExclude} を除外中...`);
    
    const response = await chrome.runtime.sendMessage({ 
      action: 'addExcludedDomain', 
      domain: domainToExclude 
    });
    
    
    if (response && response.success) {
      showStatus(`${domainToExclude} を除外しました`);
      
      // 除外ドメインリストを更新
      await updateExcludedDomainsList();
      
      // グループリストを更新（除外されたグループが消える）
      setTimeout(async () => {
        await updateGroupList();
      }, 1500);
    } else {
      showStatus((response && response.error) || 'ドメインの除外に失敗しました');
    }
  } catch (error) {
    console.error('Error excluding domain from menu:', error);
    showStatus('エラーが発生しました: ' + error.message);
  }
}

// 色変更（コンテキストメニューから）
async function changeColorFromMenu() {
  
  if (!currentContextDomain) {
    showStatus('ドメインが選択されていません');
    return;
  }
  
  // currentContextDomainを保持するため、先にドメインを保存
  const domainToProcess = currentContextDomain;
  
  hideContextMenu();
  
  // ドメインを復元
  currentContextDomain = domainToProcess;
  
  showGroupColorSelectionMenu();
}

// グループ色選択メニューを表示
function showGroupColorSelectionMenu() {
  const colorMenu = document.getElementById('groupColorSelectionMenu');
  
  // メニューの位置を計算（画面中央に表示）
  const popupRect = document.body.getBoundingClientRect();
  colorMenu.style.left = Math.max(10, (popupRect.width - 280) / 2) + 'px';
  colorMenu.style.top = '150px';
  colorMenu.style.display = 'block';
  
  // 色選択セレクトボックスをリセット
  const groupColorSelect = document.getElementById('groupColorSelect');
  groupColorSelect.value = '';
  
  // クリック外し処理を有効化
  setTimeout(() => {
    document.addEventListener('click', handleGroupColorMenuClickOutside);
  }, 100);
}

// グループ色選択メニューを非表示
function hideGroupColorSelectionMenu() {
  const colorMenu = document.getElementById('groupColorSelectionMenu');
  colorMenu.style.display = 'none';
  document.removeEventListener('click', handleGroupColorMenuClickOutside);
}

// グループ色選択メニュー外をクリックしたときの処理
function handleGroupColorMenuClickOutside(event) {
  const colorMenu = document.getElementById('groupColorSelectionMenu');
  if (!colorMenu.contains(event.target)) {
    hideGroupColorSelectionMenu();
  }
}

// グループ色を適用する処理
async function applyGroupColor() {
  const groupColorSelect = document.getElementById('groupColorSelect');
  const selectedColor = groupColorSelect.value;
  
  
  if (!currentContextDomain) {
    showStatus('ドメインが選択されていません');
    return;
  }
  
  if (!selectedColor) {
    showStatus('色を選択してください');
    return;
  }
  
  hideGroupColorSelectionMenu();
  
  // addDomainColor関数と同じロジックを使用
  await addDomainColor(currentContextDomain, selectedColor);
  
  // 適用後にcurrentContextDomainをリセット
  currentContextDomain = null;
}

// グループ色選択をキャンセルする処理
function cancelGroupColor() {
  hideGroupColorSelectionMenu();
  // キャンセル時にcurrentContextDomainをリセット
  currentContextDomain = null;
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
  
  // 初期化時にグループリストと除外ドメインリスト、ドメイン色リストを更新
  updateGroupList();
  updateExcludedDomainsList();
  updateDomainColorsList();
  
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

  // ドメイン色関連のイベントリスナー
  document.getElementById('addColorBtn').addEventListener('click', () => {
    const domain = document.getElementById('colorDomainInput').value;
    const color = document.getElementById('colorSelect').value;
    addDomainColor(domain, color);
  });
  
  document.getElementById('setCurrentColorBtn').addEventListener('click', setCurrentTabColor);
  
  // Enterキーでドメイン色設定
  document.getElementById('colorDomainInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      const domain = document.getElementById('colorDomainInput').value;
      const color = document.getElementById('colorSelect').value;
      addDomainColor(domain, color);
    }
  });

  // コンテキストメニューのイベントリスナー
  document.getElementById('excludeDomainMenu').addEventListener('click', excludeDomainFromMenu);
  document.getElementById('changeColorMenu').addEventListener('click', changeColorFromMenu);

  // グループ色選択メニューのイベントリスナー
  document.getElementById('applyGroupColorBtn').addEventListener('click', applyGroupColor);
  document.getElementById('cancelGroupColorBtn').addEventListener('click', cancelGroupColor);
  
  // グループ変更を監視してリアルタイム更新
  let currentGroupState = null;
  
  async function checkGroupChanges() {
    try {
      const currentWindow = await chrome.windows.getCurrent();
      const groups = await chrome.tabGroups.query({ windowId: currentWindow.id });
      
      // グループごとのタブ数も含めて状態をチェック
      const groupStatePromises = groups.map(async (group) => {
        const tabs = await chrome.tabs.query({ groupId: group.id });
        return {
          id: group.id,
          title: group.title,
          color: group.color,
          tabCount: tabs.length
        };
      });
      
      const groupStates = await Promise.all(groupStatePromises);
      const newGroupState = JSON.stringify(groupStates);
      
      if (currentGroupState !== newGroupState) {
        currentGroupState = newGroupState;
        await updateGroupList();
      }
    } catch (error) {
      console.error('Error checking group changes:', error);
    }
  }
  
  // 初期状態を設定
  checkGroupChanges();
  
  // 軽量な変更検知（1秒間隔）
  setInterval(checkGroupChanges, 1000);
  
  // 初期ステータスを設定
  showStatus(settings.autoGroupEnabled ? '自動グループ化が有効です' : '自動グループ化が無効です');
});

// バックグラウンドスクリプトからのメッセージをリッスン
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'updateGroupList') {
    updateGroupList();
  }
});