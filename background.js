// ドメインベースでタブをグループ化するサービスワーカー

import { GROUP_COLORS, CONFIG } from './constants.js';
import { LRUCache, Logger } from './utils.js';

// ドメインからホスト名を抽出する関数（utils.jsから移動）
function extractDomain(url) {
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
    
    const hostname = urlObj.hostname;
    
    // サブドメイン単位グループ化が有効な場合はそのまま返す
    if (useSubdomainGrouping) {
      return hostname;
    }
    
    // ルートドメイン単位グループ化の場合は、ルートドメインを抽出
    return getRootDomain(hostname);
  } catch (error) {
    Logger.error('Invalid URL:', url);
    return null;
  }
}

// ルートドメインを抽出する関数
function getRootDomain(hostname) {
  if (!hostname) return null;
  
  // IPアドレスの場合はそのまま返す
  if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
    return hostname;
  }
  
  // localhostの場合はそのまま返す
  if (hostname === 'localhost' || hostname.endsWith('.localhost')) {
    return hostname;
  }
  
  // ドメインの部分を分割
  const parts = hostname.split('.');
  
  // 2つ以下の部分の場合（例: google.com）はそのまま返す
  if (parts.length <= 2) {
    return hostname;
  }
  
  // 3つ以上の部分の場合、最後の2つを取得（例: mail.google.com → google.com）
  return parts.slice(-2).join('.');
}

console.log('Background script loaded successfully');

// タブのドメイン履歴を保存するマップ
const tabDomainHistory = new Map();

// 自動グループ化の設定状態
let autoGroupEnabled = true;

// 除外ドメインリスト
let excludedDomains = [];

// ドメイン色設定
let domainColors = {};

// ドメイン名設定
let domainNames = {};

// サブドメイン単位グループ化設定
let useSubdomainGrouping = false;

// 設定を読み込む関数
async function loadSettings() {
  try {
    const result = await chrome.storage.local.get(['autoGroupEnabled', 'excludedDomains', 'domainColors', 'domainNames', 'useSubdomainGrouping']);

    autoGroupEnabled = result.autoGroupEnabled !== false; // デフォルトはtrue
    excludedDomains = result.excludedDomains || []; // デフォルトは空配列
    domainColors = result.domainColors || {}; // デフォルトは空オブジェクト
    domainNames = result.domainNames || {}; // デフォルトは空オブジェクト

    useSubdomainGrouping = result.useSubdomainGrouping || false; // デフォルトはfalse

    Logger.info(`Auto-grouping loaded: ${autoGroupEnabled}`);
    Logger.info(`Excluded domains loaded: ${excludedDomains.length} domains`);
    Logger.info(`Domain colors loaded: ${Object.keys(domainColors).length} domains`);
    Logger.info(`Domain names loaded: ${Object.keys(domainNames).length} domains`);
    Logger.info(`Subdomain grouping loaded: ${useSubdomainGrouping}`);

  } catch (error) {
    console.error('Error loading settings:', error);
    autoGroupEnabled = true;
    excludedDomains = [];
    domainColors = {};
    domainNames = {};
    useSubdomainGrouping = false;
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

// ドメインごとの色キャッシュ（LRU実装）
const domainColorCache = new LRUCache(CONFIG.MAX_CACHE_SIZE);

// ドメインのグループタイトルを取得する関数
function getGroupTitle(domain) {
  // domainNamesが初期化されていない場合は初期化
  if (!domainNames) {
    domainNames = {};
  }
  // カスタム名が設定されている場合はそれを使用、なければドメイン名
  return domainNames[domain] || domain;
}


// content scriptを使ってfaviconから主要色を抽出する関数
async function extractDominantColorFromFavicon(faviconUrl, tabId) {
  if (!faviconUrl || faviconUrl.startsWith('chrome://') || faviconUrl.startsWith('chrome-extension://')) {
    Logger.debug(`Invalid favicon URL: ${faviconUrl}`);
    return null;
  }

  try {
    Logger.debug(`Requesting color extraction for favicon: ${faviconUrl} on tab ${tabId}`);
    
    // content scriptに色抽出を依頼
    const response = await chrome.tabs.sendMessage(tabId, {
      action: 'extractFaviconColor',
      faviconUrl: faviconUrl
    });
    
    Logger.debug(`Color extraction response:`, response);
    
    if (response && response.success && response.color) {
      Logger.debug(`Successfully extracted color:`, response.color);
      return response.color;
    }
    Logger.debug(`No color extracted from response`);
    return null;
  } catch (error) {
    // content scriptが利用できない場合（chrome://ページなど）
    Logger.debug(`Content script not available for tab ${tabId}:`, error.message);
    return null;
  }
}

// RGB色をChrome拡張のグループカラーにマッピング
function mapColorToGroupColor(rgbColor) {
  if (!rgbColor) return 'blue'; // デフォルト色
  
  const { r, g, b } = rgbColor;
  
  // 定数ファイルから色情報を使用
  
  let bestMatch = 'blue';
  let minDistance = Infinity;
  
  for (const [colorName, colorRgb] of Object.entries(GROUP_COLORS)) {
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

// タブからfaviconURLを取得する関数
async function getFaviconFromTab(tabId) {
  try {
    const tab = await chrome.tabs.get(tabId);
    return tab.favIconUrl || null;
  } catch (error) {
    Logger.debug(`Could not get tab ${tabId} favicon:`, error.message);
    return null;
  }
}

// faviconベースでタブグループの色を取得
async function getGroupColor(domain, faviconUrl = null, tabId = null) {
  Logger.debug(`getGroupColor called for ${domain}, faviconUrl: ${faviconUrl}, tabId: ${tabId}`);
  
  // 1. 手動設定色があるかチェック（最優先）
  if (domainColors[domain]) {
    const manualColor = domainColors[domain];
    Logger.debug(`Using manual color for ${domain}: ${manualColor}`);
    domainColorCache.set(domain, manualColor);
    return manualColor;
  }
  
  // 2. キャッシュされた色があるかチェック
  if (domainColorCache.has(domain)) {
    const cachedColor = domainColorCache.get(domain);
    Logger.debug(`Using cached color for ${domain}: ${cachedColor}`);
    return cachedColor;
  }
  
  let groupColor = 'blue'; // デフォルト色
  
  // 3. favicon色抽出を試行
  let actualFaviconUrl = faviconUrl;
  
  // faviconURLが無いがtabIdがある場合、再取得を試行
  if (!actualFaviconUrl && tabId) {
    actualFaviconUrl = await getFaviconFromTab(tabId);
    Logger.debug(`Retrieved favicon URL from tab ${tabId}: ${actualFaviconUrl}`);
  }
  
  if (actualFaviconUrl && tabId) {
    Logger.debug(`Attempting favicon color extraction for ${domain} with URL: ${actualFaviconUrl}`);
    try {
      const dominantColor = await extractDominantColorFromFavicon(actualFaviconUrl, tabId);
      if (dominantColor) {
        groupColor = mapColorToGroupColor(dominantColor);
        Logger.info(`Extracted color for ${domain}: RGB(${dominantColor.r},${dominantColor.g},${dominantColor.b}) -> ${groupColor}`);
      } else {
        Logger.debug(`No dominant color extracted for ${domain}, using fallback`);
      }
    } catch (error) {
      console.error(`Error getting favicon color for ${domain}:`, error);
    }
  } else {
    Logger.debug(`No favicon URL or tab ID for ${domain}, using fallback color`);
  }
  
  // 4. フォールバック: ハッシュベースの色（faviconが無い場合も色抽出が失敗した場合も）
  if (groupColor === 'blue') {
    const colors = ['red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'grey', 'blue'];
    const hash = domain.split('').reduce((a, b) => {
      a = ((a << 5) - a) + b.charCodeAt(0);
      return a & a;
    }, 0);
    groupColor = colors[Math.abs(hash) % colors.length];
    Logger.debug(`Using hash-based fallback color for ${domain}: ${groupColor}`);
  }
  
  // 色をキャッシュ
  domainColorCache.set(domain, groupColor);
  Logger.debug(`Final color for ${domain}: ${groupColor}`);
  return groupColor;
}

// グループが実際に存在するかチェックする関数
async function verifyGroupExists(groupId) {
  try {
    await chrome.tabGroups.get(groupId);
    return true;
  } catch (error) {
    if (error.message.includes('No group with id')) {
      return false;
    }
    throw error; // 他のエラーは再スロー
  }
}

// 既存のグループのタイトルを更新する関数
async function updateExistingGroupTitle(domain, newTitle, windowId = null) {
  try {
    Logger.debug(`Updating existing group title for domain: ${domain}, newTitle: ${newTitle}`);
    
    // windowIdが指定されている場合はそのウィンドウのみ、そうでなければ全てのウィンドウ
    const queryOptions = windowId ? { windowId: windowId } : {};
    const groups = await chrome.tabGroups.query(queryOptions);
    Logger.debug(`Found ${groups.length} groups in ${windowId ? `window ${windowId}` : 'all windows'}`);
    
    let updated = false;
    for (const group of groups) {
      Logger.debug(`Checking group: ${group.title} (id: ${group.id})`);
      
      // グループが実際に存在するかチェック
      const groupExists = await verifyGroupExists(group.id);
      if (!groupExists) {
        Logger.warn(`Group ${group.id} no longer exists, skipping`);
        continue;
      }
      
      // グループのタイトルがドメイン名またはカスタム名と一致するかチェック
      if (group.title === domain || (domainNames && group.title === domainNames[domain])) {
        Logger.debug(`Updating group ${group.id} title to: ${newTitle}`);
        try {
          await chrome.tabGroups.update(group.id, { title: newTitle });
          Logger.info(`Successfully updated group title for ${domain}: ${newTitle}`);
          updated = true;
        } catch (error) {
          console.error(`Error updating group ${group.id} title:`, error);
          if (error.message.includes('No group with id')) {
            Logger.warn(`Group ${group.id} no longer exists, skipping title update`);
          } else {
            throw error; // 他のエラーは再スロー
          }
        }
      }
    }
    
    if (!updated) {
      Logger.debug(`No groups found for domain: ${domain}`);
    }
  } catch (error) {
    console.error('Error updating existing group title:', error);
  }
}

// 既存のグループの色を更新する関数
async function updateExistingGroupColor(domain, newColor = null, windowId = null) {
  try {
    Logger.debug(`Updating existing group color for domain: ${domain}, newColor: ${newColor}`);
    
    // windowIdが指定されている場合はそのウィンドウのみ、そうでなければ全てのウィンドウ
    const queryOptions = windowId ? { windowId: windowId } : {};
    const groups = await chrome.tabGroups.query(queryOptions);
    Logger.debug(`Found ${groups.length} groups in ${windowId ? `window ${windowId}` : 'all windows'}`);
    
    let updated = false;
    for (const group of groups) {
      Logger.debug(`Checking group: ${group.title} (id: ${group.id})`);
      
      // グループが実際に存在するかチェック
      const groupExists = await verifyGroupExists(group.id);
      if (!groupExists) {
        Logger.warn(`Group.*no longer exists, skipping`);
        continue;
      }
      
      if (group.title === domain) {
        let color = newColor;
        if (!color) {
          // 色が指定されていない場合は再計算
          const tabs = await chrome.tabs.query({ groupId: group.id });
          const faviconTab = tabs.find(tab => tab.favIconUrl);
          color = await getGroupColor(domain, faviconTab?.favIconUrl, faviconTab?.id);
        }
        
        Logger.debug(`Updating group ${group.id} to color: ${color}`);
        try {
          await chrome.tabGroups.update(group.id, { color: color });
          Logger.info(`Successfully updated group color for ${domain}: ${color}`);
          updated = true;
        } catch (error) {
          console.error(`Error updating group ${group.id} color:`, error);
          if (error.message.includes('No group with id')) {
            Logger.warn(`Group.*no longer exists, skipping color update`);
          } else {
            throw error; // 他のエラーは再スロー
          }
        }
      }
    }
    
    if (!updated) {
      Logger.debug(`No groups found for domain: ${domain}`);
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
        Logger.info(`Empty group removed: ${group.title}`);
      } else if (tabsInGroup.length === 1) {
        // 単体タブのグループは解除
        await chrome.tabs.ungroup([tabsInGroup[0].id]);
        Logger.info(`Single tab group ungrouped: ${group.title}`);
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
          Logger.info(`Ungrouped ${tabIds.length} tabs from ${domain} group`);
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
    
    if (!newDomain || isDomainExcluded(newDomain)) {
      return;
    }
    
    // ドメインが変更された場合
    if (oldDomain && oldDomain !== newDomain) {
      Logger.debug(`Tab ${tabId} domain changed from ${oldDomain} to ${newDomain}`);
      
      // 元のグループから外す
      const tab = await chrome.tabs.get(tabId);
      if (tab.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE) {
        await chrome.tabs.ungroup([tabId]);
        Logger.debug(`Tab ${tabId} ungrouped from ${oldDomain} group`);
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
      return tabDomain === domain && !isDomainExcluded(tabDomain) && tab.id !== tabId;
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
      try {
        await chrome.tabs.group({
          tabIds: [tabId],
          groupId: targetGroup.id
        });
        Logger.info(`Tab ${tabId} added to existing ${domain} group`);
      } catch (error) {
        if (error.message.includes('No group with id')) {
          Logger.warn(`Group ${targetGroup.id} no longer exists, will create new group for ${domain}`);
          targetGroup = null; // 新規作成フローに進む
        } else {
          console.error(`Error adding tab ${tabId} to group ${targetGroup.id}:`, error);
          throw error; // 他のエラーは再スロー
        }
      }
    }
    
    // targetGroupがnullの場合（初回または既存グループが削除された場合）
    if (!targetGroup && sameDomainTabs.length > 0) {
      // 新しいグループを作成（2つ以上のタブがある場合のみ）
      const allTabIds = [tabId, ...sameDomainTabs.map(tab => tab.id)];
      const groupId = await chrome.tabs.group({ tabIds: allTabIds });
      
      // faviconURLを取得（最初に見つかったタブから）
      const faviconTab = targetTab.favIconUrl ? targetTab : sameDomainTabs.find(tab => tab.favIconUrl);
      const faviconUrl = faviconTab?.favIconUrl;
      const groupColor = await getGroupColor(domain, faviconUrl, faviconTab?.id);
      
      const groupTitle = getGroupTitle(domain);
      Logger.debug(`Creating new group in regroupSingleTab for domain: ${domain}, title: ${groupTitle}, color: ${groupColor}`);
      await chrome.tabGroups.update(groupId, {
        title: groupTitle,
        color: groupColor
      });
      Logger.info(`New group created for ${domain} with ${allTabIds.length} tabs, title set to: ${groupTitle}`);
    } else {
      Logger.debug(`Single tab for ${domain}, not creating group`);
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
      if (domain && !isDomainExcluded(domain)) {
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
          if (currentDomain && !isDomainExcluded(currentDomain) && currentDomain !== group.title) {
            tabsToUngroup.push(tab.id);
          }
        }
        
        if (tabsToUngroup.length > 0) {
          await chrome.tabs.ungroup(tabsToUngroup);
          Logger.info(`Ungrouped ${tabsToUngroup.length} tabs from ${group.title} group`);
        }
      }
    }
    
    // ドメインごとにグループを作成または更新（2つ以上のタブから）
    for (const [domain, domainTabs] of Object.entries(domainGroups)) {
      if (domainTabs.length >= 2) { // 2つ以上のタブからグループ化
        const groupTitle = getGroupTitle(domain);
        
        // 既存のグループがあるかチェック
        let existingGroup = existingGroupsByTitle[groupTitle];
        
        if (existingGroup) {
          // 既存グループに新しいタブを追加
          try {
            const tabIds = domainTabs.map(tab => tab.id);
            const groupedTabIds = await chrome.tabs.query({groupId: existingGroup.id});
            const newTabIds = tabIds.filter(id => !groupedTabIds.some(t => t.id === id));
            
            if (newTabIds.length > 0) {
              await chrome.tabs.group({
                tabIds: newTabIds,
                groupId: existingGroup.id
              });
              Logger.info(`Added ${newTabIds.length} tabs to existing group ${existingGroup.id}`);
            }
          } catch (error) {
            // グループが存在しない場合は、新しいグループを作成
            if (error.message.includes('No group with id')) {
              Logger.warn(`Group ${existingGroup.id} no longer exists, will create new group for ${domain}`);
              existingGroup = null; // 新規作成フローに進む
            } else {
              console.error(`Error adding tabs to existing group ${existingGroup.id}:`, error);
              throw error;
            }
          }
        }
        
        // existingGroupがnullの場合（初回または削除された場合）
        if (!existingGroup) {
          // 新しいグループを作成
          const tabIds = domainTabs.map(tab => tab.id);
          const groupId = await chrome.tabs.group({ tabIds });
          
          // faviconURLを取得（最初に見つかったタブから）
          const faviconTab = domainTabs.find(tab => tab.favIconUrl);
          const groupColor = await getGroupColor(domain, faviconTab?.favIconUrl, faviconTab?.id);
          
          Logger.debug(`Creating new group for domain: ${domain}, title: ${groupTitle}, color: ${groupColor}`);
          await chrome.tabGroups.update(groupId, {
            title: groupTitle,
            color: groupColor
          });
          Logger.info(`Successfully created new group ${groupId} with title: ${groupTitle}`);
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
    
    Logger.info(`Grouped tabs in ${windows.length} windows`);
  } catch (error) {
    console.error('Error grouping tabs in all windows:', error);
  }
}

// タブが作成された時のイベントリスナー
chrome.tabs.onCreated.addListener(async (tab) => {
  if (!autoGroupEnabled) {
    console.log('Auto-grouping disabled, skipping tab creation event');
    return;
  }
  
  console.log(`Tab created: ${tab.id}, URL: ${tab.url || 'pending'}, windowId: ${tab.windowId}`);
  Logger.debug(`Tab created: ${tab.id}, URL: ${tab.url || 'pending'}`);
  
  // 少し待ってから該当ウィンドウのみグループ化（URLが確定するまで）
  setTimeout(async () => {
    console.log(`Triggering grouping for window ${tab.windowId} after tab ${tab.id} creation`);
    try {
      await groupTabsByDomainInWindow(tab.windowId);
      console.log(`Grouping completed for window ${tab.windowId}`);
    } catch (error) {
      console.error(`Error during grouping for window ${tab.windowId}:`, error);
    }
  }, 500);
});

// タブが更新された時のイベントリスナー（ページ遷移を検知）
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (!autoGroupEnabled) return;
  
  console.log(`Tab updated: ${tabId}, changeInfo:`, changeInfo, `URL: ${tab.url}`);
  
  // URLが変更された場合の処理
  if (changeInfo.url && tab.url) {
    const oldDomain = tabDomainHistory.get(tabId);
    const newDomain = extractDomain(tab.url);
    
    console.log(`URL change detected for tab ${tabId}: ${oldDomain} -> ${newDomain}`);
    
    // ドメインが実際に変更されたかチェック
    if (newDomain && !isDomainExcluded(newDomain) && newDomain !== oldDomain) {
      Logger.debug(`URL change detected for tab ${tabId}: ${oldDomain} -> ${newDomain}`);
      await handleTabDomainChange(tabId, tab.url, oldDomain);
      
      // 新しいドメインが検出された場合、同じウィンドウ内で即座にグループ化を試行
      setTimeout(async () => {
        console.log(`Triggering grouping for window ${tab.windowId} after URL change to ${newDomain}`);
        try {
          await groupTabsByDomainInWindow(tab.windowId);
          console.log(`Grouping completed for window ${tab.windowId} after URL change`);
        } catch (error) {
          console.error(`Error during grouping for window ${tab.windowId}:`, error);
        }
      }, 100);
      return; // URL変更処理が完了したらここで終了
    }
  }
  
  // ページ読み込み完了時の処理
  if (changeInfo.status === 'complete' && tab.url) {
    const currentDomain = extractDomain(tab.url);
    const storedDomain = tabDomainHistory.get(tabId);
    
    console.log(`Tab ${tabId} loading complete: domain: ${currentDomain}, stored: ${storedDomain}`);
    
    // 新しいドメインが検出された場合（最初のページ読み込み時も含む）
    if (currentDomain && !isDomainExcluded(currentDomain) && currentDomain !== storedDomain) {
      console.log(`Domain detected on status complete for tab ${tabId}: ${storedDomain} -> ${currentDomain}`);
      Logger.debug(`Domain detected on status complete for tab ${tabId}: ${storedDomain} -> ${currentDomain}`);
      
      // ドメイン履歴を更新
      tabDomainHistory.set(tabId, currentDomain);
      
      // グループ化を実行
      setTimeout(async () => {
        console.log(`Triggering grouping for window ${tab.windowId} after domain detection`);
        try {
          await groupTabsByDomainInWindow(tab.windowId);
          console.log(`Grouping completed for window ${tab.windowId} after domain detection`);
        } catch (error) {
          console.error(`Error during grouping for window ${tab.windowId}:`, error);
        }
      }, 100);
    } else {
      console.log(`Skipping group update for tab ${tabId} - same domain: ${currentDomain}`);
      Logger.debug(`Skipping group update for tab ${tabId} - same domain: ${currentDomain}`);
    }
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
        Logger.info(`Auto-grouping ${autoGroupEnabled ? 'enabled' : 'disabled'}`);
        sendResponse({ success: true });
      } else if (message.action === 'addExcludedDomain') {
        const domain = message.domain;
        Logger.debug(`Adding excluded domain: "${domain}"`);
        Logger.debug(`Current excluded domains:`, excludedDomains);
        Logger.debug(`Domain exists check:`, excludedDomains.includes(domain));
        
        if (domain && domain.trim() !== '' && !excludedDomains.includes(domain)) {
          excludedDomains.push(domain);
          await chrome.storage.local.set({ excludedDomains: excludedDomains });
          Logger.info(`Domain excluded: ${domain}`);
          // 既存のグループを解除してから再グループ化
          await ungroupDomainTabs(domain);
          sendResponse({ success: true, excludedDomains: excludedDomains });
        } else {
          const reason = !domain || domain.trim() === '' ? 'Invalid domain' : 'Domain already excluded';
          Logger.warn(`Failed to exclude domain: ${reason}`);
          sendResponse({ success: false, error: reason });
        }
      } else if (message.action === 'removeExcludedDomain') {
        const domain = message.domain;
        const index = excludedDomains.indexOf(domain);
        if (index > -1) {
          excludedDomains.splice(index, 1);
          await chrome.storage.local.set({ excludedDomains: excludedDomains });
          Logger.info(`Domain unexcluded: ${domain}`);
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
        Logger.debug(`Setting domain color: "${domain}" -> "${color}"`);
        Logger.debug(`Current domain colors:`, domainColors);
        
        if (domain && color) {
          domainColors[domain] = color;
          await chrome.storage.local.set({ domainColors: domainColors });
          Logger.info(`Domain color set: ${domain} -> ${color}`);
          
          // キャッシュをクリアして色を更新
          domainColorCache.delete(domain);
          
          // 既存のグループの色を更新
          await updateExistingGroupColor(domain, color);
          
          sendResponse({ success: true, domainColors: domainColors });
        } else {
          Logger.warn(`Failed to set domain color: domain="${domain}", color="${color}"`);
          sendResponse({ success: false, error: 'Invalid domain or color' });
        }
      } else if (message.action === 'removeDomainColor') {
        const domain = message.domain;
        if (domain && domainColors[domain]) {
          delete domainColors[domain];
          await chrome.storage.local.set({ domainColors: domainColors });
          Logger.info(`Domain color removed: ${domain}`);
          
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
      } else if (message.action === 'setDomainName') {
        const domain = message.domain;
        const name = message.name;
        Logger.debug(`Setting domain name: "${domain}" -> "${name}"`);
        Logger.debug(`Current domain names:`, domainNames);
        
        if (domain && name && name.trim() !== '') {
          domainNames[domain] = name.trim();
          await chrome.storage.local.set({ domainNames: domainNames });
          Logger.info(`Domain name set: ${domain} -> ${name}`);
          
          // 既存のグループのタイトルを更新
          await updateExistingGroupTitle(domain, name.trim());
          
          sendResponse({ success: true, domainNames: domainNames });
        } else {
          Logger.warn(`Failed to set domain name: domain="${domain}", name="${name}"`);
          sendResponse({ success: false, error: 'Invalid domain or name' });
        }
      } else if (message.action === 'removeDomainName') {
        const domain = message.domain;
        if (domain && domainNames[domain]) {
          delete domainNames[domain];
          await chrome.storage.local.set({ domainNames: domainNames });
          Logger.info(`Domain name removed: ${domain}`);
          
          // 既存のグループのタイトルをドメイン名にリセット
          await updateExistingGroupTitle(domain, domain);
          
          sendResponse({ success: true, domainNames: domainNames });
        } else {
          sendResponse({ success: false, error: 'Domain not found in name settings' });
        }
      } else if (message.action === 'getDomainNames') {
        // domainNamesが初期化されていない場合は初期化
        if (!domainNames) {
          domainNames = {};
        }
        sendResponse({ success: true, domainNames: domainNames });
      } else if (message.action === 'toggleSubdomainGrouping') {
        useSubdomainGrouping = message.enabled;
        await chrome.storage.local.set({ useSubdomainGrouping: message.enabled });
        Logger.info(`Subdomain grouping ${useSubdomainGrouping ? 'enabled' : 'disabled'}`);
        
        // 設定変更時は既存のグループを再構築
        if (autoGroupEnabled) {
          await groupTabsByDomain();
        }
        
        sendResponse({ success: true, useSubdomainGrouping: useSubdomainGrouping });
      } else if (message.action === 'getSubdomainGrouping') {
        sendResponse({ success: true, useSubdomainGrouping: useSubdomainGrouping });
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
  Logger.info('Background script initialized');
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