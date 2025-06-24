// ドメインベースでタブをグループ化するサービスワーカー

// タブのドメイン履歴を保存するマップ
const tabDomainHistory = new Map();

// 自動グループ化の設定状態
let autoGroupEnabled = true;

// 除外ドメインリスト
let excludedDomains = [];

// 設定を読み込む関数
async function loadSettings() {
  try {
    const result = await chrome.storage.local.get(['autoGroupEnabled', 'excludedDomains']);
    autoGroupEnabled = result.autoGroupEnabled !== false; // デフォルトはtrue
    excludedDomains = result.excludedDomains || []; // デフォルトは空配列
    console.log(`Auto-grouping loaded: ${autoGroupEnabled}`);
    console.log(`Excluded domains loaded: ${excludedDomains.length} domains`);
  } catch (error) {
    console.error('Error loading settings:', error);
    autoGroupEnabled = true;
    excludedDomains = [];
  }
}

// ドメインが除外リストに含まれているかチェックする関数
function isDomainExcluded(domain) {
  if (!domain) return false;
  return excludedDomains.some(excludedDomain => {
    // 完全一致チェック
    if (domain === excludedDomain) return true;
    // サブドメインチェック（*.example.com形式）
    if (excludedDomain.startsWith('*.') && domain.endsWith(excludedDomain.slice(1))) return true;
    return false;
  });
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
    
    const domain = urlObj.hostname;
    
    // 除外ドメインリストに含まれている場合はnullを返す
    if (isDomainExcluded(domain)) {
      return null;
    }
    
    return domain;
  } catch (error) {
    console.error('Invalid URL:', url);
    return null;
  }
}

// タブグループの色を循環的に取得
function getGroupColor(domain) {
  const colors = ['blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'grey'];
  const hash = domain.split('').reduce((a, b) => {
    a = ((a << 5) - a) + b.charCodeAt(0);
    return a & a;
  }, 0);
  return colors[Math.abs(hash) % colors.length];
}

// 空のグループを削除する関数
async function removeEmptyGroups() {
  try {
    const groups = await chrome.tabGroups.query({});
    
    for (const group of groups) {
      const tabsInGroup = await chrome.tabs.query({ groupId: group.id });
      if (tabsInGroup.length === 0) {
        // グループが空の場合は削除（自動的に削除されるはず）
        console.log(`Empty group removed: ${group.title}`);
      }
    }
  } catch (error) {
    console.error('Error removing empty groups:', error);
  }
}

// 特定ドメインのタブをグループから解除する関数
async function ungroupDomainTabs(domain) {
  try {
    const groups = await chrome.tabGroups.query({});
    
    for (const group of groups) {
      if (group.title === domain) {
        const tabsInGroup = await chrome.tabs.query({ groupId: group.id });
        const tabIds = tabsInGroup.map(tab => tab.id);
        
        if (tabIds.length > 0) {
          await chrome.tabs.ungroup(tabIds);
          console.log(`Ungrouped ${tabIds.length} tabs from ${domain} group`);
        }
        break;
      }
    }
  } catch (error) {
    console.error('Error ungrouping domain tabs:', error);
  }
}

// タブのドメイン変更を処理する関数
async function handleTabDomainChange(tabId, newUrl, oldDomain) {
  try {
    const newDomain = extractDomain(newUrl);
    
    if (!newDomain) {
      return;
    }
    
    // ドメインが変更された場合
    if (oldDomain && oldDomain !== newDomain) {
      console.log(`Tab ${tabId} domain changed from ${oldDomain} to ${newDomain}`);
      
      // 元のグループから外す
      const tab = await chrome.tabs.get(tabId);
      if (tab.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE) {
        await chrome.tabs.ungroup([tabId]);
        console.log(`Tab ${tabId} ungrouped from ${oldDomain} group`);
      }
      
      // 新しいドメインのグループを探す
      await regroupSingleTab(tabId, newDomain);
    }
    
    // ドメイン履歴を更新
    tabDomainHistory.set(tabId, newDomain);
  } catch (error) {
    console.error('Error handling tab domain change:', error);
  }
}

// 単一のタブを適切なグループに配置する関数（ウィンドウ内で）
async function regroupSingleTab(tabId, domain) {
  try {
    // まず該当タブの情報を取得してウィンドウIDを確認
    const targetTab = await chrome.tabs.get(tabId);
    const windowId = targetTab.windowId;
    
    // 同じウィンドウ内で同じドメインの他のタブを探す
    const tabs = await chrome.tabs.query({ windowId: windowId });
    const sameDomainTabs = tabs.filter(tab => {
      const tabDomain = extractDomain(tab.url);
      return tabDomain === domain && tab.id !== tabId;
    });
    
    // 同じウィンドウ内の既存のグループがあるかチェック
    const groups = await chrome.tabGroups.query({ windowId: windowId });
    let targetGroup = null;
    
    for (const group of groups) {
      if (group.title === domain) {
        targetGroup = group;
        break;
      }
    }
    
    if (targetGroup) {
      // 既存グループに追加
      await chrome.tabs.group({
        tabIds: [tabId],
        groupId: targetGroup.id
      });
      console.log(`Tab ${tabId} added to existing ${domain} group`);
    } else {
      // 新しいグループを作成（単体でも他のタブとでも）
      const allTabIds = [tabId, ...sameDomainTabs.map(tab => tab.id)];
      const groupId = await chrome.tabs.group({ tabIds: allTabIds });
      
      await chrome.tabGroups.update(groupId, {
        title: domain,
        color: getGroupColor(domain)
      });
      console.log(`New group created for ${domain} with ${allTabIds.length} tabs`);
    }
  } catch (error) {
    console.error('Error regrouping single tab:', error);
  }
}

// 特定のウィンドウでドメインに基づいてタブをグループ化する関数
async function groupTabsByDomainInWindow(windowId) {
  try {
    // 指定されたウィンドウのタブを取得
    const tabs = await chrome.tabs.query({ windowId: windowId });
    
    // ドメインごとにタブをグループ化（ウィンドウ内で）
    const domainGroups = {};
    
    for (const tab of tabs) {
      const domain = extractDomain(tab.url);
      if (domain) {
        if (!domainGroups[domain]) {
          domainGroups[domain] = [];
        }
        domainGroups[domain].push(tab);
        
        // ドメイン履歴を更新
        tabDomainHistory.set(tab.id, domain);
      }
    }
    
    // 指定されたウィンドウの既存のグループを取得
    const existingGroups = await chrome.tabGroups.query({ windowId: windowId });
    const existingGroupsByTitle = {};
    existingGroups.forEach(group => {
      if (group.title) {
        existingGroupsByTitle[group.title] = group;
      }
    });
    
    // 間違ったグループにあるタブをチェック
    for (const group of existingGroups) {
      if (group.title) {
        const tabsInGroup = await chrome.tabs.query({ groupId: group.id });
        const tabsToUngroup = [];
        
        for (const tab of tabsInGroup) {
          const currentDomain = extractDomain(tab.url);
          if (currentDomain && currentDomain !== group.title) {
            tabsToUngroup.push(tab.id);
          }
        }
        
        if (tabsToUngroup.length > 0) {
          await chrome.tabs.ungroup(tabsToUngroup);
          console.log(`Ungrouped ${tabsToUngroup.length} tabs from ${group.title} group`);
        }
      }
    }
    
    // ドメインごとにグループを作成または更新（単体タブも含む）
    for (const [domain, domainTabs] of Object.entries(domainGroups)) {
      if (domainTabs.length >= 1) { // 単体タブでもグループ化
        const groupTitle = domain;
        
        // 既存のグループがあるかチェック
        let existingGroup = existingGroupsByTitle[groupTitle];
        
        if (existingGroup) {
          // 既存グループに新しいタブを追加
          const tabIds = domainTabs.map(tab => tab.id);
          const groupedTabIds = await chrome.tabs.query({groupId: existingGroup.id});
          const newTabIds = tabIds.filter(id => !groupedTabIds.some(t => t.id === id));
          
          if (newTabIds.length > 0) {
            await chrome.tabs.group({
              tabIds: newTabIds,
              groupId: existingGroup.id
            });
          }
        } else {
          // 新しいグループを作成（単体タブでも）
          const tabIds = domainTabs.map(tab => tab.id);
          const groupId = await chrome.tabs.group({ tabIds });
          
          await chrome.tabGroups.update(groupId, {
            title: groupTitle,
            color: getGroupColor(domain)
          });
        }
      }
    }
    
    // 空のグループを削除
    await removeEmptyGroups();
  } catch (error) {
    console.error('Error grouping tabs in window:', error);
  }
}

// 全ウィンドウでドメインに基づいてタブをグループ化する関数
async function groupTabsByDomain() {
  try {
    // 全ウィンドウを取得
    const windows = await chrome.windows.getAll({ windowTypes: ['normal'] });
    
    // 各ウィンドウで個別にグループ化処理を実行
    for (const window of windows) {
      await groupTabsByDomainInWindow(window.id);
    }
    
    console.log(`Grouped tabs in ${windows.length} windows`);
  } catch (error) {
    console.error('Error grouping tabs in all windows:', error);
  }
}

// タブが作成された時のイベントリスナー
chrome.tabs.onCreated.addListener(async (tab) => {
  if (!autoGroupEnabled) return;
  
  // 少し待ってから該当ウィンドウのみグループ化（URLが確定するまで）
  setTimeout(() => groupTabsByDomainInWindow(tab.windowId), 500);
});

// タブが更新された時のイベントリスナー（ページ遷移を検知）
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (!autoGroupEnabled) return;
  
  if (changeInfo.url && tab.url) {
    // URLが変更された場合、ドメイン変更を処理
    const oldDomain = tabDomainHistory.get(tabId);
    await handleTabDomainChange(tabId, tab.url, oldDomain);
  } else if (changeInfo.status === 'complete' && tab.url) {
    // ページ読み込み完了時に該当ウィンドウのみ再グループ化
    await groupTabsByDomainInWindow(tab.windowId);
  }
});

// ポップアップからのメッセージをリッスン
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    try {
      if (message.action === 'groupTabs') {
        await groupTabsByDomain();
        sendResponse({ success: true });
      } else if (message.action === 'groupTabsInWindow') {
        await groupTabsByDomainInWindow(message.windowId);
        sendResponse({ success: true });
      } else if (message.action === 'toggleAutoGroup') {
        autoGroupEnabled = message.enabled;
        await chrome.storage.local.set({ autoGroupEnabled: message.enabled });
        console.log(`Auto-grouping ${autoGroupEnabled ? 'enabled' : 'disabled'}`);
        sendResponse({ success: true });
      } else if (message.action === 'addExcludedDomain') {
        const domain = message.domain;
        if (domain && !excludedDomains.includes(domain)) {
          excludedDomains.push(domain);
          await chrome.storage.local.set({ excludedDomains: excludedDomains });
          console.log(`Domain excluded: ${domain}`);
          // 既存のグループを解除してから再グループ化
          await ungroupDomainTabs(domain);
          sendResponse({ success: true, excludedDomains: excludedDomains });
        } else {
          sendResponse({ success: false, error: 'Domain already excluded or invalid' });
        }
      } else if (message.action === 'removeExcludedDomain') {
        const domain = message.domain;
        const index = excludedDomains.indexOf(domain);
        if (index > -1) {
          excludedDomains.splice(index, 1);
          await chrome.storage.local.set({ excludedDomains: excludedDomains });
          console.log(`Domain unexcluded: ${domain}`);
          // 再グループ化を実行
          if (autoGroupEnabled) {
            await groupTabsByDomain();
          }
          sendResponse({ success: true, excludedDomains: excludedDomains });
        } else {
          sendResponse({ success: false, error: 'Domain not found in excluded list' });
        }
      } else if (message.action === 'getExcludedDomains') {
        sendResponse({ success: true, excludedDomains: excludedDomains });
      }
    } catch (error) {
      console.error('Error in message handler:', error);
      sendResponse({ success: false, error: error.message });
    }
  })();
  
  return true; // 非同期レスポンスを示す
});

// 拡張機能の初期化時にグループ化を実行
chrome.runtime.onStartup.addListener(async () => {
  await loadSettings();
  if (autoGroupEnabled) {
    groupTabsByDomain();
  }
});

chrome.runtime.onInstalled.addListener(async () => {
  await loadSettings();
  if (autoGroupEnabled) {
    groupTabsByDomain();
  }
});

// タブが削除された時のイベントリスナー
chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
  // ドメイン履歴からタブを削除
  tabDomainHistory.delete(tabId);
  
  // 自動グループ化が有効な場合のみ再実行
  if (autoGroupEnabled) {
    setTimeout(() => groupTabsByDomain(), 100);
  }
});