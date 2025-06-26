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
    const result = await chrome.storage.local.get(['autoGroupEnabled', 'excludedDomains', 'domainColors', 'domainNames', 'useSubdomainGrouping']);
    return {
      autoGroupEnabled: result.autoGroupEnabled !== false, // デフォルトはtrue
      excludedDomains: result.excludedDomains || [], // デフォルトは空配列
      domainColors: result.domainColors || {}, // デフォルトは空オブジェクト
      domainNames: result.domainNames || {}, // デフォルトは空オブジェクト
      useSubdomainGrouping: result.useSubdomainGrouping || false // デフォルトはfalse
    };
  } catch (error) {
    console.error('Error loading settings:', error);
    return { autoGroupEnabled: true, excludedDomains: [], domainColors: {}, domainNames: {}, useSubdomainGrouping: false };
  }
}

// ステータスメッセージを表示
function showStatus(message) {
  const statusElement = document.getElementById('status');
  statusElement.textContent = message;
}

// グループリストを更新（現在のウィンドウのみ）
let updateInProgress = false;
async function updateGroupList() {
  if (updateInProgress) {
    console.log('updateGroupList already in progress, skipping');
    return;
  }
  
  updateInProgress = true;
  console.log('updateGroupList started');
  try {
    // 現在のウィンドウを取得
    const currentWindow = await chrome.windows.getCurrent();
    const allGroups = await chrome.tabGroups.query({ windowId: currentWindow.id });
    
    // API結果から重複を除去（念のため）
    const uniqueGroupsMap = new Map();
    allGroups.forEach(group => {
      uniqueGroupsMap.set(group.id, group);
    });
    const groups = Array.from(uniqueGroupsMap.values());
    
    console.log(`Found ${allGroups.length} groups from API, ${groups.length} unique groups`);
    if (allGroups.length !== groups.length) {
      console.warn('Duplicate groups detected in API response:', 
        allGroups.map(g => `ID:${g.id} Title:${g.title}`));
    }
    
    const groupList = document.getElementById('groupList');
    
    // スクロール位置を保存
    const scrollTop = groupList.scrollTop;
    
    // 既存の内容をクリア
    groupList.innerHTML = '';
    
    if (groups.length === 0) {
      groupList.innerHTML = '<div class="group-item">グループはありません</div>';
      return;
    }
    
    // 重複防止のためのSet（グループIDで判定）
    const displayedGroupIds = new Set();
    
    for (const group of groups) {
      // 同じIDのグループが既に表示されている場合はスキップ
      if (displayedGroupIds.has(group.id)) {
        console.warn(`Duplicate group ID detected: ${group.id} (${group.title}), skipping`);
        continue;
      }
      // グループの存在確認
      let tabs;
      try {
        tabs = await chrome.tabs.query({ groupId: group.id });
      } catch (error) {
        if (error.message.includes('No group with id')) {
          continue; // エラーが出たグループはスキップ
        }
        throw error;
      }
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
      
      // グループIDを表示済みとしてマーク
      displayedGroupIds.add(group.id);
      console.log(`Displaying group: ID=${group.id}, Title=${group.title}, Tabs=${tabs.length}`);
      
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
  } finally {
    updateInProgress = false;
    console.log('updateGroupList completed');
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
    pink: '#ff8bcb',
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
      // グループの存在確認（簡素化）
      let tabs;
      try {
        tabs = await chrome.tabs.query({ groupId: group.id });
      } catch (error) {
        if (error.message.includes('No group with id')) {
          continue; // エラーが出たグループはスキップ
        }
        throw error;
      }
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

// サブドメイングループ化の設定を切り替える関数
async function toggleSubdomainGrouping() {
  try {
    const toggle = document.getElementById('subdomainGroupingToggle');
    const enabled = toggle.checked;
    
    // 設定を保存
    await saveSettings({ useSubdomainGrouping: enabled });
    
    // バックグラウンドスクリプトに設定変更を通知
    await chrome.runtime.sendMessage({ 
      action: 'toggleSubdomainGrouping', 
      enabled: enabled 
    });
    
    // ステータス更新
    showStatus(enabled ? 'サブドメイン単位グループ化が有効になりました' : 'ルートドメイン単位グループ化に戻しました');
    
    // グループリストを更新（グループ名が変わる可能性があるため）
    setTimeout(() => {
      updateGroupList();
    }, 1000);
  } catch (error) {
    console.error('Error toggling subdomain grouping:', error);
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

// ドメイン名リストを更新する関数
async function updateDomainNamesList() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'getDomainNames' });
    if (response && response.success) {
      const nameList = document.getElementById('nameList');
      const domainNames = response.domainNames;
      
      // スクロール位置を保存
      const scrollTop = nameList.scrollTop;
      
      if (Object.keys(domainNames).length === 0) {
        nameList.innerHTML = '<div class="empty-state">ドメイン名設定はありません</div>';
      } else {
        nameList.innerHTML = Object.entries(domainNames).map(([domain, name]) => `
          <div class="name-item">
            <span class="name-domain">${domain}</span>
            <span class="name-display">${name}</span>
            <button class="remove-btn" data-domain="${domain}">削除</button>
          </div>
        `).join('');
        
        // 削除ボタンのイベントリスナーを追加
        nameList.querySelectorAll('.remove-btn').forEach(btn => {
          btn.addEventListener('click', () => removeDomainName(btn.dataset.domain));
        });
      }
      
      // スクロール位置を復元
      nameList.scrollTop = scrollTop;
    }
  } catch (error) {
    console.error('Error updating domain names list:', error);
  }
}

// ドメイン名を設定する関数
async function addDomainName(domain, name) {
  try {
    if (!domain || domain.trim() === '') {
      showStatus('ドメインを入力してください');
      return;
    }
    
    if (!name || name.trim() === '') {
      showStatus('グループ名を入力してください');
      return;
    }
    
    domain = domain.trim().toLowerCase();
    name = name.trim();
    
    // 簡単なバリデーション
    if (!isValidDomain(domain)) {
      showStatus('無効なドメイン形式です');
      return;
    }
    
    showStatus('ドメイン名を設定中...');
    
    const response = await chrome.runtime.sendMessage({ 
      action: 'setDomainName', 
      domain: domain,
      name: name
    });
    
    if (response && response.success) {
      showStatus(`${domain} のグループ名を "${name}" に設定しました`);
      await updateDomainNamesList();
      
      // 入力フィールドをクリア（存在する場合のみ）
      const domainInput = document.getElementById('nameDomainInput');
      const nameInput = document.getElementById('nameInput');
      if (domainInput) domainInput.value = '';
      if (nameInput) nameInput.value = '';
      
      // グループリストも更新（名前が変わったため）
      setTimeout(() => {
        updateGroupList();
      }, 500);
    } else {
      showStatus((response && response.error) || 'ドメイン名の設定に失敗しました');
    }
  } catch (error) {
    console.error('Error setting domain name:', error);
    showStatus('エラーが発生しました');
  }
}

// ドメイン名を削除する関数
async function removeDomainName(domain) {
  try {
    showStatus('ドメイン名設定を削除中...');
    
    const response = await chrome.runtime.sendMessage({ 
      action: 'removeDomainName', 
      domain: domain 
    });
    
    if (response && response.success) {
      showStatus(`${domain} のグループ名設定を削除しました`);
      await updateDomainNamesList();
      
      // グループリストも更新（名前が変わったため）
      setTimeout(() => {
        updateGroupList();
      }, 500);
    } else {
      showStatus((response && response.error) || 'ドメイン名設定の削除に失敗しました');
    }
  } catch (error) {
    console.error('Error removing domain name:', error);
    showStatus('エラーが発生しました');
  }
}

// 現在のタブのドメイン名を設定する関数
async function setCurrentTabName() {
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
    
    const nameInput = document.getElementById('nameInput');
    if (!nameInput.value) {
      showStatus('グループ名を入力してください');
      return;
    }
    
    document.getElementById('nameDomainInput').value = domain;
    await addDomainName(domain, nameInput.value);
  } catch (error) {
    console.error('Error setting current tab name:', error);
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

// グループ名変更（コンテキストメニューから）
async function renameGroupFromMenu() {
  if (!currentContextDomain) {
    showStatus('ドメインが選択されていません');
    return;
  }
  
  // currentContextDomainを保持するため、先にドメインを保存
  const domainToProcess = currentContextDomain;
  
  hideContextMenu();
  
  // ドメインを復元
  currentContextDomain = domainToProcess;
  
  showGroupNameInputMenu();
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
  colorMenu.style.left = Math.max(10, (popupRect.width - 260) / 2) + 'px';
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

// グループ名入力メニューを表示
function showGroupNameInputMenu() {
  const nameMenu = document.getElementById('groupNameInputMenu');
  
  // メニューの位置を計算（画面中央に表示）
  const popupRect = document.body.getBoundingClientRect();
  nameMenu.style.left = Math.max(10, (popupRect.width - 280) / 2) + 'px';
  nameMenu.style.top = '150px';
  nameMenu.style.display = 'block';
  
  // 入力フィールドをリセット
  const groupNameInput = document.getElementById('groupNameInput');
  groupNameInput.value = '';
  groupNameInput.focus();
  
  // クリック外し処理を有効化
  setTimeout(() => {
    document.addEventListener('click', handleGroupNameMenuClickOutside);
  }, 100);
}

// グループ名入力メニューを非表示
function hideGroupNameInputMenu() {
  const nameMenu = document.getElementById('groupNameInputMenu');
  nameMenu.style.display = 'none';
  document.removeEventListener('click', handleGroupNameMenuClickOutside);
}

// グループ名入力メニュー外をクリックしたときの処理
function handleGroupNameMenuClickOutside(event) {
  const nameMenu = document.getElementById('groupNameInputMenu');
  if (!nameMenu.contains(event.target)) {
    hideGroupNameInputMenu();
  }
}

// グループ名を適用する処理
async function applyGroupName() {
  const groupNameInput = document.getElementById('groupNameInput');
  const newName = groupNameInput.value.trim();
  
  if (!currentContextDomain) {
    showStatus('ドメインが選択されていません');
    return;
  }
  
  if (!newName) {
    showStatus('グループ名を入力してください');
    return;
  }
  
  hideGroupNameInputMenu();
  
  // addDomainName関数と同じロジックを使用
  await addDomainName(currentContextDomain, newName);
  
  // 適用後にcurrentContextDomainをリセット
  currentContextDomain = null;
}

// グループ名入力をキャンセルする処理
function cancelGroupName() {
  hideGroupNameInputMenu();
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

// ドメイングループ名リストを更新する関数
async function updateDomainNamesList() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'getDomainNames' });
    if (response && response.success) {
      const nameList = document.getElementById('nameList');
      const domainNames = response.domainNames;
      
      // スクロール位置を保存
      const scrollTop = nameList.scrollTop;
      
      if (Object.keys(domainNames).length === 0) {
        nameList.innerHTML = '<div class="empty-state">ドメイングループ名設定はありません</div>';
      } else {
        nameList.innerHTML = Object.entries(domainNames).map(([domain, name]) => `
          <div class="name-item">
            <span class="name-domain">${domain}</span>
            <span class="name-badge">${name}</span>
            <button class="remove-btn" data-domain="${domain}">削除</button>
          </div>
        `).join('');
        
        // 削除ボタンのイベントリスナーを追加
        nameList.querySelectorAll('.remove-btn').forEach(btn => {
          btn.addEventListener('click', () => removeDomainName(btn.dataset.domain));
        });
      }
      
      // スクロール位置を復元
      nameList.scrollTop = scrollTop;
    }
  } catch (error) {
    console.error('Error updating domain names list:', error);
  }
}

// ドメイングループ名を設定する関数
async function addDomainName(domain, name) {
  try {
    console.log('addDomainName called with:', { domain, name });
    
    if (!domain || domain.trim() === '') {
      showStatus('ドメインを入力してください');
      return;
    }
    
    if (!name || name.trim() === '') {
      showStatus('グループ名を入力してください');
      return;
    }
    
    domain = domain.trim().toLowerCase();
    name = name.trim();
    
    console.log('Processed values:', { domain, name });
    
    // 簡単なバリデーション
    if (!isValidDomain(domain)) {
      showStatus('無効なドメイン形式です');
      return;
    }
    
    showStatus('ドメイングループ名を設定中...');
    console.log('Sending message to background script...');
    
    try {
      // 5秒のタイムアウトを設定
      const response = await Promise.race([
        chrome.runtime.sendMessage({ 
          action: 'setDomainName', 
          domain: domain,
          name: name
        }),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Timeout: 5秒後にタイムアウトしました')), 5000)
        )
      ]);
      
      console.log('Response received:', response);
      
      if (response && response.success) {
        showStatus(`${domain} のグループ名を ${name} に設定しました`);
        await updateDomainNamesList();
        
        // 入力フィールドをクリア
        const domainInput = document.getElementById('nameDomainInput');
        const nameInput = document.getElementById('groupNameInput');
        if (domainInput) domainInput.value = '';
        if (nameInput) nameInput.value = '';
        
        // グループリストも更新（名前が変わったため）
        setTimeout(() => {
          updateGroupList();
        }, 500);
      } else {
        console.error('Background script returned error:', response);
        showStatus((response && response.error) || 'ドメイングループ名の設定に失敗しました');
      }
    } catch (messageError) {
      console.error('Error sending message to background script:', messageError);
      showStatus('バックグラウンドスクリプトとの通信に失敗しました');
    }
  } catch (error) {
    console.error('Error in addDomainName:', error);
    showStatus('エラーが発生しました: ' + error.message);
  }
}

// ドメイングループ名を削除する関数
async function removeDomainName(domain) {
  try {
    showStatus('ドメイングループ名設定を削除中...');
    
    const response = await chrome.runtime.sendMessage({ 
      action: 'removeDomainName', 
      domain: domain 
    });
    
    if (response && response.success) {
      showStatus(`${domain} のグループ名設定を削除しました`);
      await updateDomainNamesList();
      
      // グループリストも更新（名前が変わったため）
      setTimeout(() => {
        updateGroupList();
      }, 500);
    } else {
      showStatus((response && response.error) || 'ドメイングループ名設定の削除に失敗しました');
    }
  } catch (error) {
    console.error('Error removing domain name:', error);
    showStatus('エラーが発生しました');
  }
}

// 現在のタブのドメイングループ名を設定する関数
async function setCurrentTabName() {
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
    
    const nameInput = document.getElementById('groupNameInput');
    if (!nameInput.value) {
      showStatus('グループ名を入力してください');
      return;
    }
    
    document.getElementById('nameDomainInput').value = domain;
    await addDomainName(domain, nameInput.value);
  } catch (error) {
    console.error('Error setting current tab name:', error);
    showStatus('エラーが発生しました');
  }
}

// 更新チェック機能
async function checkForUpdates() {
  try {
    // 現在のバージョンを取得
    const manifest = chrome.runtime.getManifest();
    const currentVersion = manifest.version;
    
    // 最後のチェック時刻を確認（24時間に1回のみチェック）
    const lastCheck = await chrome.storage.local.get('lastUpdateCheck');
    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000; // 24時間をミリ秒で
    
    if (lastCheck.lastUpdateCheck && (now - lastCheck.lastUpdateCheck < oneDay)) {
      // 24時間以内にチェック済み
      return;
    }
    
    // GitHub Releases APIから最新バージョンを取得
    const response = await fetch('https://api.github.com/repos/umruumum/domain-tab-grouper/releases/latest');
    if (!response.ok) {
      console.warn('Failed to check for updates:', response.status);
      return;
    }
    
    const release = await response.json();
    const latestVersion = release.tag_name.replace('v', ''); // "v0.3.1" -> "0.3.1"
    
    // バージョン比較
    if (isNewerVersion(latestVersion, currentVersion)) {
      showUpdateNotification(release);
    }
    
    // チェック時刻を保存
    await chrome.storage.local.set({ lastUpdateCheck: now });
    
  } catch (error) {
    console.warn('Update check failed:', error);
  }
}

// バージョン比較関数（semantic versioningに対応）
function isNewerVersion(latest, current) {
  const latestParts = latest.split('.').map(Number);
  const currentParts = current.split('.').map(Number);
  
  for (let i = 0; i < 3; i++) {
    const latestPart = latestParts[i] || 0;
    const currentPart = currentParts[i] || 0;
    
    if (latestPart > currentPart) return true;
    if (latestPart < currentPart) return false;
  }
  
  return false;
}

// 更新通知を表示
function showUpdateNotification(release) {
  const notification = document.getElementById('updateNotification');
  const updateLink = document.getElementById('updateLink');
  const dismissBtn = document.getElementById('dismissUpdate');
  
  // リンクを設定
  updateLink.href = release.html_url;
  
  // 通知を表示
  notification.style.display = 'block';
  
  // 閉じるボタンのイベントリスナー
  dismissBtn.onclick = () => {
    notification.style.display = 'none';
  };
}

// イベントリスナーを設定
document.addEventListener('DOMContentLoaded', async () => {
  // 設定を読み込んでトグルスイッチを初期化
  const settings = await loadSettings();
  const toggle = document.getElementById('autoGroupToggle');
  const subdomainToggle = document.getElementById('subdomainGroupingToggle');
  toggle.checked = settings.autoGroupEnabled;
  subdomainToggle.checked = settings.useSubdomainGrouping;
  
  // 初期化時にグループリストと除外ドメインリスト、ドメイン色リスト、ドメイン名リストを更新
  updateGroupList();
  updateExcludedDomainsList();
  updateDomainColorsList();
  updateDomainNamesList();
  
  // ボタンのイベントリスナー
  document.getElementById('groupTabs').addEventListener('click', groupTabs);
  document.getElementById('ungroupAll').addEventListener('click', ungroupAll);
  
  // トグルスイッチのイベントリスナー
  toggle.addEventListener('change', toggleAutoGroup);
  subdomainToggle.addEventListener('change', toggleSubdomainGrouping);
  
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

  // ドメイン名関連のイベントリスナー
  document.getElementById('addNameBtn').addEventListener('click', () => {
    const domain = document.getElementById('nameDomainInput').value;
    const name = document.getElementById('nameInput').value;
    addDomainName(domain, name);
  });
  
  document.getElementById('setCurrentNameBtn').addEventListener('click', setCurrentTabName);
  
  // Enterキーでドメイン名設定
  document.getElementById('nameDomainInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      const domain = document.getElementById('nameDomainInput').value;
      const name = document.getElementById('nameInput').value;
      addDomainName(domain, name);
    }
  });
  
  document.getElementById('nameInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      const domain = document.getElementById('nameDomainInput').value;
      const name = document.getElementById('nameInput').value;
      addDomainName(domain, name);
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

  // ドメイングループ名関連のイベントリスナー
  document.getElementById('addNameBtn').addEventListener('click', () => {
    const domain = document.getElementById('nameDomainInput').value;
    const name = document.getElementById('groupNameInput').value;
    addDomainName(domain, name);
  });
  
  document.getElementById('setCurrentNameBtn').addEventListener('click', setCurrentTabName);
  
  // Enterキーでドメイングループ名設定
  document.getElementById('nameDomainInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      const domain = document.getElementById('nameDomainInput').value;
      const name = document.getElementById('groupNameInput').value;
      addDomainName(domain, name);
    }
  });
  
  document.getElementById('groupNameInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      const domain = document.getElementById('nameDomainInput').value;
      const name = document.getElementById('groupNameInput').value;
      addDomainName(domain, name);
    }
  });

  // コンテキストメニューのイベントリスナー
  document.getElementById('editNameMenu').addEventListener('click', editGroupNameFromMenu);
  document.getElementById('excludeDomainMenu').addEventListener('click', excludeDomainFromMenu);
  document.getElementById('changeColorMenu').addEventListener('click', changeColorFromMenu);
  document.getElementById('renameGroupMenu').addEventListener('click', renameGroupFromMenu);

  // グループ色選択メニューのイベントリスナー
  document.getElementById('applyGroupColorBtn').addEventListener('click', applyGroupColor);
  document.getElementById('cancelGroupColorBtn').addEventListener('click', cancelGroupColor);
  
  // グループ名入力メニューのイベントリスナー
  document.getElementById('applyGroupNameBtn').addEventListener('click', applyGroupName);
  document.getElementById('cancelGroupNameBtn').addEventListener('click', cancelGroupName);
  
  // グループ名入力でEnterキー
  document.getElementById('groupNameInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      applyGroupName();
    }
  });
  
  // グループ変更を監視してリアルタイム更新
  let currentGroupState = null;
  let isUpdating = false; // 更新中フラグ
  
  async function checkGroupChanges() {
    if (isUpdating) {
      console.log('updateGroupList already in progress, skipping');
      return;
    }
    
    try {
      const currentWindow = await chrome.windows.getCurrent();
      const groups = await chrome.tabGroups.query({ windowId: currentWindow.id });
      
      // グループごとのタブ数も含めて状態をチェック
      const groupStatePromises = groups.map(async (group) => {
        // グループの存在確認
        let tabs;
        try {
          tabs = await chrome.tabs.query({ groupId: group.id });
        } catch (error) {
          if (error.message.includes('No group with id')) {
            return null; // このグループをスキップ
          }
          throw error;
        }
        return {
          id: group.id,
          title: group.title,
          color: group.color,
          tabCount: tabs.length
        };
      });
      
      const groupStates = (await Promise.all(groupStatePromises)).filter(state => state !== null);
      const newGroupState = JSON.stringify(groupStates);
      
      if (currentGroupState !== newGroupState) {
        currentGroupState = newGroupState;
        isUpdating = true;
        try {
          await updateGroupList();
        } finally {
          isUpdating = false;
        }
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