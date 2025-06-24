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
      
      console.log(`Creating group element: title="${group.title}", id=${group.id}`);
      
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

// タブリストを更新（現在のウィンドウのみ）
async function updateTabList() {
  try {
    // 現在のウィンドウを取得
    const currentWindow = await chrome.windows.getCurrent();
    const tabs = await chrome.tabs.query({ windowId: currentWindow.id });
    const groups = await chrome.tabGroups.query({ windowId: currentWindow.id });
    const tabList = document.getElementById('tabList');
    
    // スクロール位置を保存
    const scrollTop = tabList.scrollTop;
    
    // 既存の内容をクリア
    tabList.innerHTML = '';
    
    if (tabs.length === 0) {
      tabList.innerHTML = '<div class="tab-item">タブはありません</div>';
      return;
    }
    
    // グループ情報をマップに変換
    const groupMap = {};
    groups.forEach(group => {
      groupMap[group.id] = group;
    });
    
    for (const tab of tabs) {
      const tabElement = document.createElement('div');
      tabElement.className = 'tab-item';
      
      // タブのドメインを取得
      const domain = extractDomain(tab.url);
      
      // グループ情報を取得
      let groupInfo = '';
      if (tab.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE) {
        const group = groupMap[tab.groupId];
        if (group) {
          const groupColor = getColorCode(group.color);
          groupInfo = `<span class="tab-group-indicator" style="background-color: ${groupColor}">${group.title || 'グループ'}</span>`;
        }
      }
      
      tabElement.innerHTML = `
        <img class="tab-favicon" src="${tab.favIconUrl || 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="%23ddd"/></svg>'}" alt="">
        <div class="tab-info">
          <div class="tab-title">${tab.title || 'タイトルなし'}</div>
          <div class="tab-domain">${domain || 'ドメインなし'}</div>
        </div>
        ${groupInfo}
      `;
      
      // データ属性を設定
      tabElement.dataset.tabId = tab.id;
      tabElement.dataset.domain = domain || '';
      tabElement.dataset.url = tab.url;
      
      // クリックイベントを追加（ドメインが有効な場合のみ）
      if (domain && domain.trim() !== '') {
        tabElement.addEventListener('click', (e) => handleTabClick(e, domain, tab));
        tabElement.addEventListener('contextmenu', (e) => handleTabRightClick(e, domain, tab));
        tabElement.style.cursor = 'pointer';
      } else {
        tabElement.style.cursor = 'default';
      }
      
      tabList.appendChild(tabElement);
    }
    
    // スクロール位置を復元
    tabList.scrollTop = scrollTop;
  } catch (error) {
    console.error('Error updating tab list:', error);
    showStatus('エラーが発生しました');
  }
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
      document.getElementById('colorDomainInput').value = '';
      document.getElementById('colorSelect').value = '';
      
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
  console.log('Group clicked:', domain);
  console.log('Domain type in click handler:', typeof domain);
  console.log('Event target:', event.target);
  console.log('Event currentTarget:', event.currentTarget);
  console.log('Dataset domain:', event.currentTarget.dataset.domain);
  hideContextMenu();
  showContextMenu(event, domain);
}

// グループを右クリックしたときの処理
function handleGroupRightClick(event, domain) {
  event.preventDefault();
  console.log('Group right-clicked:', domain);
  console.log('Domain type in right-click handler:', typeof domain);
  console.log('Event target:', event.target);
  console.log('Event currentTarget:', event.currentTarget);
  console.log('Dataset domain:', event.currentTarget.dataset.domain);
  hideContextMenu();
  showContextMenu(event, domain);
}

// コンテキストメニューを表示
function showContextMenu(event, domain) {
  const contextMenu = document.getElementById('contextMenu');
  
  // ドメインがnullの場合、dataset.domainをフォールバックとして使用
  if (!domain || domain === 'null' || domain.trim() === '') {
    const fallbackDomain = event.currentTarget.dataset.domain;
    console.log('Using fallback domain from dataset:', fallbackDomain);
    domain = fallbackDomain;
  }
  
  currentContextDomain = domain;
  
  console.log('Showing context menu for domain:', domain);
  console.log('Domain type:', typeof domain);
  console.log('Domain is null/undefined:', domain == null);
  
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
  
  console.log('Excluding domain from menu:', currentContextDomain);
  hideContextMenu();
  
  try {
    showStatus(`${currentContextDomain} を除外中...`);
    
    const response = await chrome.runtime.sendMessage({ 
      action: 'addExcludedDomain', 
      domain: currentContextDomain 
    });
    
    console.log('Exclude domain response:', response);
    
    if (response && response.success) {
      showStatus(`${currentContextDomain} を除外しました`);
      
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
  
  hideContextMenu();
  showColorSelectionMenu();
}

// 色選択メニューを表示
function showColorSelectionMenu() {
  const colorMenu = document.getElementById('colorSelectionMenu');
  
  // メニューの位置を計算（画面中央に表示）
  const popupRect = document.body.getBoundingClientRect();
  colorMenu.style.left = Math.max(10, (popupRect.width - 250) / 2) + 'px';
  colorMenu.style.top = '150px';
  colorMenu.style.display = 'block';
  
  // クリック外し処理を有効化
  setTimeout(() => {
    document.addEventListener('click', handleColorMenuClickOutside);
  }, 100);
}

// 色選択メニューを非表示
function hideColorSelectionMenu() {
  const colorMenu = document.getElementById('colorSelectionMenu');
  colorMenu.style.display = 'none';
  document.removeEventListener('click', handleColorMenuClickOutside);
}

// 色選択メニュー外をクリックしたときの処理
function handleColorMenuClickOutside(event) {
  const colorMenu = document.getElementById('colorSelectionMenu');
  if (!colorMenu.contains(event.target)) {
    hideColorSelectionMenu();
  }
}

// 色を選択したときの処理
async function selectColor(color) {
  if (!currentContextDomain) {
    showStatus('ドメインが選択されていません');
    return;
  }
  
  hideColorSelectionMenu();
  
  const colorLabels = {
    'red': '🔴 Red',
    'pink': '🩷 Pink',
    'purple': '🟣 Purple',
    'blue': '🔵 Blue',
    'cyan': '🩵 Cyan',
    'green': '🟢 Green',
    'yellow': '🟡 Yellow',
    'grey': '⚪ Grey'
  };
  
  try {
    showStatus(`${currentContextDomain} の色を ${colorLabels[color]} に変更中...`);
    
    const response = await chrome.runtime.sendMessage({ 
      action: 'setDomainColor', 
      domain: currentContextDomain,
      color: color
    });
    
    console.log('Set domain color response:', response);
    
    if (response && response.success) {
      showStatus(`${currentContextDomain} の色を ${colorLabels[color]} に変更しました`);
      
      // ドメイン色リストを更新
      await updateDomainColorsList();
      
      // グループリストを更新（色が変わるため）
      setTimeout(async () => {
        await updateGroupList();
      }, 500);
    } else {
      showStatus((response && response.error) || 'ドメイン色の設定に失敗しました');
    }
  } catch (error) {
    console.error('Error changing color from menu:', error);
    showStatus('エラーが発生しました');
  }
}

// タブをクリックしたときの処理
function handleTabClick(event, domain, tab) {
  event.preventDefault();
  console.log('Tab clicked:', domain);
  console.log('Domain type in click handler:', typeof domain);
  console.log('Event target:', event.target);
  console.log('Event currentTarget:', event.currentTarget);
  console.log('Dataset domain:', event.currentTarget.dataset.domain);
  hideContextMenu();
  showContextMenu(event, domain);
}

// タブを右クリックしたときの処理
function handleTabRightClick(event, domain, tab) {
  event.preventDefault();
  console.log('Tab right-clicked:', domain);
  console.log('Domain type in right-click handler:', typeof domain);
  console.log('Event target:', event.target);
  console.log('Event currentTarget:', event.currentTarget);
  console.log('Dataset domain:', event.currentTarget.dataset.domain);
  hideContextMenu();
  showContextMenu(event, domain);
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
  
  // View toggle buttons
  document.getElementById('showGroupsBtn').addEventListener('click', () => {
    document.getElementById('showGroupsBtn').classList.add('active');
    document.getElementById('showTabsBtn').classList.remove('active');
    document.getElementById('groupList').style.display = 'block';
    document.getElementById('tabList').style.display = 'none';
  });
  
  document.getElementById('showTabsBtn').addEventListener('click', () => {
    document.getElementById('showTabsBtn').classList.add('active');
    document.getElementById('showGroupsBtn').classList.remove('active');
    document.getElementById('groupList').style.display = 'none';
    document.getElementById('tabList').style.display = 'block';
    updateTabList();
  });
  
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

  // 色選択メニューのイベントリスナー
  document.querySelectorAll('.color-option').forEach(option => {
    option.addEventListener('click', (e) => {
      e.stopPropagation();
      const color = option.dataset.color;
      selectColor(color);
    });
  });
  
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