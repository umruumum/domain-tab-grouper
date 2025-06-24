// ドメインベースでタブをグループ化するサービスワーカー

// タブのドメイン履歴を保存するマップ
const tabDomainHistory = new Map();

// 自動グループ化の設定状態
let autoGroupEnabled = true;

// 除外ドメインリスト
let excludedDomains = [];

// ドメイン色設定
let domainColors = {};

// 設定を読み込む関数
async function loadSettings() {
  try {
    const result = await chrome.storage.local.get(['autoGroupEnabled', 'excludedDomains', 'domainColors']);
    autoGroupEnabled = result.autoGroupEnabled !== false; // デフォルトはtrue
    excludedDomains = result.excludedDomains || []; // デフォルトは空配列
    domainColors = result.domainColors || {}; // デフォルトは空オブジェクト
    console.log(`Auto-grouping loaded: ${autoGroupEnabled}`);
    console.log(`Excluded domains loaded: ${excludedDomains.length} domains`);
    console.log(`Domain colors loaded: ${Object.keys(domainColors).length} domains`);
  } catch (error) {
    console.error('Error loading settings:', error);
    autoGroupEnabled = true;
    excludedDomains = [];
    domainColors = {};
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

// ドメインごとの色キャッシュ
const domainColorCache = new Map();

// content scriptを使ってfaviconから主要色を抽出する関数
async function extractDominantColorFromFavicon(faviconUrl, tabId) {
  if (!faviconUrl || faviconUrl.startsWith('chrome://') || faviconUrl.startsWith('chrome-extension://')) {
    return null;
  }

  try {
    // content scriptに色抽出を依頼
    const response = await chrome.tabs.sendMessage(tabId, {
      action: 'extractFaviconColor',
      faviconUrl: faviconUrl
    });
    
    if (response && response.success && response.color) {
      return response.color;
    }
    return null;
  } catch (error) {
    // content scriptが利用できない場合（chrome://ページなど）
    console.log(`Content script not available for tab ${tabId}, using fallback`);
    return null;
  }
}

// RGB色をChrome拡張のグループカラーにマッピング
function mapColorToGroupColor(rgbColor) {
  if (!rgbColor) return 'blue'; // デフォルト色
  
  const { r, g, b } = rgbColor;
  
  // Chrome拡張のグループカラーとその代表RGB値
  const groupColors = {
    'red': { r: 255, g: 67, b: 54 },
    'pink': { r: 233, g: 30, b: 99 },
    'purple': { r: 156, g: 39, b: 176 },
    'blue': { r: 33, g: 150, b: 243 },
    'cyan': { r: 0, g: 188, b: 212 },
    'green': { r: 76, g: 175, b: 80 },
    'yellow': { r: 255, g: 235, b: 59 },
    'grey': { r: 158, g: 158, b: 158 }
  };
  
  let bestMatch = 'blue';
  let minDistance = Infinity;
  
  for (const [colorName, colorRgb] of Object.entries(groupColors)) {
    // ユークリッド距離を計算
    const distance = Math.sqrt(
      Math.pow(r - colorRgb.r, 2) +
      Math.pow(g - colorRgb.g, 2) +
      Math.pow(b - colorRgb.b, 2)
    );
    
    if (distance < minDistance) {
      minDistance = distance;
      bestMatch = colorName;
    }
  }
  
  return bestMatch;
}

// faviconベースでタブグループの色を取得
async function getGroupColor(domain, faviconUrl = null, tabId = null) {
  // 1. 手動設定色があるかチェック（最優先）
  if (domainColors[domain]) {
    const manualColor = domainColors[domain];
    console.log(`Using manual color for ${domain}: ${manualColor}`);
    domainColorCache.set(domain, manualColor);
    return manualColor;
  }
  
  // 2. キャッシュされた色があるかチェック
  if (domainColorCache.has(domain)) {
    return domainColorCache.get(domain);
  }
  
  let groupColor = 'blue'; // デフォルト色
  
  // 3. favicon色抽出を試行
  if (faviconUrl && tabId) {
    try {
      const dominantColor = await extractDominantColorFromFavicon(faviconUrl, tabId);
      if (dominantColor) {
        groupColor = mapColorToGroupColor(dominantColor);
        console.log(`Extracted color for ${domain}: RGB(${dominantColor.r},${dominantColor.g},${dominantColor.b}) -> ${groupColor}`);
      }
    } catch (error) {
      console.error(`Error getting favicon color for ${domain}:`, error);
    }
  }
  
  // 4. フォールバック: ハッシュベースの色
  if (groupColor === 'blue' && !faviconUrl) {
    const colors = ['blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'grey'];
    const hash = domain.split('').reduce((a, b) => {
      a = ((a << 5) - a) + b.charCodeAt(0);
      return a & a;
    }, 0);
    groupColor = colors[Math.abs(hash) % colors.length];
  }
  
  // 色をキャッシュ
  domainColorCache.set(domain, groupColor);
  return groupColor;
}

// 既存のグループの色を更新する関数
async function updateExistingGroupColor(domain, newColor = null) {
  try {
    console.log(`Updating existing group color for domain: ${domain}, newColor: ${newColor}`);
    const groups = await chrome.tabGroups.query({});
    console.log(`Found ${groups.length} total groups`);
    
    let updated = false;
    for (const group of groups) {
      console.log(`Checking group: ${group.title} (id: ${group.id})`);
      if (group.title === domain) {
        let color = newColor;
        if (!color) {
          // 色が指定されていない場合は再計算
          const tabs = await chrome.tabs.query({ groupId: group.id });
          const faviconTab = tabs.find(tab => tab.favIconUrl);
          color = await getGroupColor(domain, faviconTab?.favIconUrl, faviconTab?.id);
        }
        
        console.log(`Updating group ${group.id} to color: ${color}`);
        await chrome.tabGroups.update(group.id, { color: color });
        console.log(`Successfully updated group color for ${domain}: ${color}`);
        updated = true;
      }
    }
    
    if (!updated) {
      console.log(`No groups found for domain: ${domain}`);
    }
  } catch (error) {
    console.error('Error updating existing group color:', error);
  }
}

// 空のグループと単体タブのグループを削除する関数
async function removeEmptyAndSingleTabGroups() {
  try {
    const groups = await chrome.tabGroups.query({});
    
    for (const group of groups) {
      const tabsInGroup = await chrome.tabs.query({ groupId: group.id });
      
      if (tabsInGroup.length === 0) {
        // グループが空の場合は削除（自動的に削除されるはず）
        console.log(`Empty group removed: ${group.title}`);
      } else if (tabsInGroup.length === 1) {
        // 単体タブのグループは解除
        await chrome.tabs.ungroup([tabsInGroup[0].id]);
        console.log(`Single tab group ungrouped: ${group.title}`);
      }
    }
  } catch (error) {
    console.error('Error removing empty and single tab groups:', error);
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
    } else if (sameDomainTabs.length > 0) {
      // 新しいグループを作成（2つ以上のタブがある場合のみ）
      const allTabIds = [tabId, ...sameDomainTabs.map(tab => tab.id)];
      const groupId = await chrome.tabs.group({ tabIds: allTabIds });
      
      // faviconURLを取得（最初に見つかったタブから）
      const faviconTab = targetTab.favIconUrl ? targetTab : sameDomainTabs.find(tab => tab.favIconUrl);
      const faviconUrl = faviconTab?.favIconUrl;
      const groupColor = await getGroupColor(domain, faviconUrl, faviconTab?.id);
      
      console.log(`Creating new group in regroupSingleTab for domain: ${domain}, color: ${groupColor}`);
      await chrome.tabGroups.update(groupId, {
        title: domain,
        color: groupColor
      });
      console.log(`New group created for ${domain} with ${allTabIds.length} tabs, title set to: ${domain}`);
    } else {
      console.log(`Single tab for ${domain}, not creating group`);
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
    
    // ドメインごとにグループを作成または更新（2つ以上のタブから）
    for (const [domain, domainTabs] of Object.entries(domainGroups)) {
      if (domainTabs.length >= 2) { // 2つ以上のタブからグループ化
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
          // 新しいグループを作成（2つ以上のタブから）
          const tabIds = domainTabs.map(tab => tab.id);
          const groupId = await chrome.tabs.group({ tabIds });
          
          // faviconURLを取得（最初に見つかったタブから）
          const faviconTab = domainTabs.find(tab => tab.favIconUrl);
          const groupColor = await getGroupColor(domain, faviconTab?.favIconUrl, faviconTab?.id);
          
          console.log(`Creating new group for domain: ${domain}, title: ${groupTitle}, color: ${groupColor}`);
          await chrome.tabGroups.update(groupId, {
            title: groupTitle,
            color: groupColor
          });
          console.log(`Successfully created group ${groupId} with title: ${groupTitle}`);
        }
      }
    }
    
    // 空のグループと単体タブのグループを削除
    await removeEmptyAndSingleTabGroups();
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
        console.log(`Adding excluded domain: "${domain}"`);
        console.log(`Current excluded domains:`, excludedDomains);
        console.log(`Domain exists check:`, excludedDomains.includes(domain));
        
        if (domain && domain.trim() !== '' && !excludedDomains.includes(domain)) {
          excludedDomains.push(domain);
          await chrome.storage.local.set({ excludedDomains: excludedDomains });
          console.log(`Domain excluded: ${domain}`);
          // 既存のグループを解除してから再グループ化
          await ungroupDomainTabs(domain);
          sendResponse({ success: true, excludedDomains: excludedDomains });
        } else {
          const reason = !domain || domain.trim() === '' ? 'Invalid domain' : 'Domain already excluded';
          console.log(`Failed to exclude domain: ${reason}`);
          sendResponse({ success: false, error: reason });
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
      } else if (message.action === 'setDomainColor') {
        const domain = message.domain;
        const color = message.color;
        console.log(`Setting domain color: "${domain}" -> "${color}"`);
        console.log(`Current domain colors:`, domainColors);
        
        if (domain && color) {
          domainColors[domain] = color;
          await chrome.storage.local.set({ domainColors: domainColors });
          console.log(`Domain color set: ${domain} -> ${color}`);
          
          // キャッシュをクリアして色を更新
          domainColorCache.delete(domain);
          
          // 既存のグループの色を更新
          await updateExistingGroupColor(domain, color);
          
          sendResponse({ success: true, domainColors: domainColors });
        } else {
          console.log(`Failed to set domain color: domain="${domain}", color="${color}"`);
          sendResponse({ success: false, error: 'Invalid domain or color' });
        }
      } else if (message.action === 'removeDomainColor') {
        const domain = message.domain;
        if (domain && domainColors[domain]) {
          delete domainColors[domain];
          await chrome.storage.local.set({ domainColors: domainColors });
          console.log(`Domain color removed: ${domain}`);
          
          // キャッシュをクリアして色をリセット
          domainColorCache.delete(domain);
          
          // 既存のグループの色を再計算
          await updateExistingGroupColor(domain);
          
          sendResponse({ success: true, domainColors: domainColors });
        } else {
          sendResponse({ success: false, error: 'Domain not found in color settings' });
        }
      } else if (message.action === 'getDomainColors') {
        sendResponse({ success: true, domainColors: domainColors });
      }
    } catch (error) {
      console.error('Error in message handler:', error);
      sendResponse({ success: false, error: error.message });
    }
  })();
  
  return true; // 非同期レスポンスを示す
});

// Service Worker起動時の初期化
(async () => {
  await loadSettings();
  console.log('Background script initialized');
})();

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
chrome.tabs.onRemoved.addListener(async (tabId, removeInfo) => {
  // ドメイン履歴からタブを削除
  tabDomainHistory.delete(tabId);
  
  // 自動グループ化が有効な場合のみ処理
  if (autoGroupEnabled) {
    // 単体タブのグループをチェックして解除
    setTimeout(async () => {
      await removeEmptyAndSingleTabGroups();
      // 必要に応じて再グループ化
      await groupTabsByDomain();
    }, 100);
  }
});