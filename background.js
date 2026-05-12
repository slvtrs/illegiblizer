const ALARM_NAME = 'illegiblizer-cycle';
const enc = encodeURIComponent;

const PLATFORMS = {
  google:    { url: q => `https://www.google.com/search?q=${enc(q)}`,                    script: 'scripts/google.js',    dwell: [50, 80] },
  youtube:   { url: q => `https://www.youtube.com/results?search_query=${enc(q)}`,        script: 'scripts/youtube.js',   dwell: [55, 85] },
  reddit:    { url: q => `https://www.reddit.com/search/?q=${enc(q)}`,                    script: 'scripts/reddit.js',    dwell: [45, 75] },
  instagram: { url: q => `https://www.instagram.com/explore/search/keyword/?q=${enc(q)}`, script: 'scripts/instagram.js', dwell: [40, 65] },
  x:         { url: q => `https://x.com/search?q=${enc(q)}&src=typed_query&f=live`,       script: 'scripts/x.js',         dwell: [40, 65] },
  tiktok:    { url: q => `https://www.tiktok.com/search?q=${enc(q)}`,                     script: 'scripts/tiktok.js',    dwell: [55, 85] },
  amazon:    { url: q => `https://www.amazon.com/s?k=${enc(q)}`,                          script: 'scripts/amazon.js',    dwell: [45, 75] },
  pinterest: { url: q => `https://www.pinterest.com/search/pins/?q=${enc(q)}`,            script: 'scripts/pinterest.js', dwell: [40, 65] },
};

const DEFAULT_PLATFORM_SETTINGS = {
  google: true, youtube: true, reddit: false,
  instagram: false, x: false, tiktok: false, amazon: false, pinterest: false,
};

// ── Icon ring ─────────────────────────────────────────────────

function drawRingIcon(size, progress, enabled) {
  const canvas = new OffscreenCanvas(size, size);
  const ctx    = canvas.getContext('2d');
  const cx = size / 2, cy = size / 2;
  const r  = size * 0.36;
  const lw = size * 0.15;

  ctx.clearRect(0, 0, size, size);

  ctx.beginPath();
  ctx.arc(cx, cy, size / 2, 0, Math.PI * 2);
  ctx.fillStyle = '#0f0f17';
  ctx.fill();

  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.strokeStyle = enabled ? '#2e2e4a' : '#1a1a2e';
  ctx.lineWidth = lw;
  ctx.stroke();

  if (enabled && progress > 0.01) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress, false);
    ctx.strokeStyle = '#f97316';
    ctx.lineWidth = lw;
    ctx.lineCap = 'round';
    ctx.stroke();
  }

  return ctx.getImageData(0, 0, size, size);
}

let iconTimerId = null;

async function updateIcon() {
  const { nextSearchAt, lastCycleAt, enabled } = await chrome.storage.local.get({
    nextSearchAt: null, lastCycleAt: null, enabled: false,
  });
  let progress = 0;
  if (enabled && nextSearchAt && lastCycleAt) {
    progress = Math.max(0, Math.min(1, (nextSearchAt - Date.now()) / (nextSearchAt - lastCycleAt)));
  }
  try {
    await chrome.action.setIcon({
      imageData: { 16: drawRingIcon(16, progress, enabled), 32: drawRingIcon(32, progress, enabled) },
    });
  } catch (_) {}
}

function startIconUpdates() {
  if (iconTimerId) clearInterval(iconTimerId);
  iconTimerId = setInterval(updateIcon, 1000);
  updateIcon();
}

// ── Word sources ──────────────────────────────────────────────

let localWordCache = null;

async function getLocalWords() {
  if (localWordCache) return localWordCache;
  const res = await fetch(chrome.runtime.getURL('data/words.json'));
  localWordCache = await res.json();
  return localWordCache;
}

async function fetchRandomTopic() {
  try {
    const res = await fetch('https://en.wikipedia.org/api/rest_v1/page/random/summary', {
      headers: { 'Api-User-Agent': 'Illegiblizer/1.0 (privacy extension)' },
    });
    if (!res.ok) throw new Error('api error');
    const data = await res.json();
    return (data.titles?.normalized || data.title).replace(/_/g, ' ');
  } catch {
    const words = await getLocalWords();
    return words[Math.floor(Math.random() * words.length)];
  }
}

// ── Scheduling ────────────────────────────────────────────────

async function scheduleNext() {
  await chrome.alarms.clearAll();
  const delayMs = 60000 + Math.random() * 10000;
  const now     = Date.now();
  await chrome.alarms.create(ALARM_NAME, { delayInMinutes: delayMs / 60000 });
  await chrome.storage.local.set({ nextSearchAt: now + delayMs, lastCycleAt: now });
}

// ── Tab readiness ─────────────────────────────────────────────

// Polls until the tab reaches 'complete', times out, or disappears.
// Polling via chrome.tabs.get() keeps the MV3 service worker alive —
// setTimeout alone can silently stall when the worker is suspended.
async function waitForTabComplete(tabId, timeout = 5000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    let tab;
    try { tab = await chrome.tabs.get(tabId); } catch { return; }
    if (tab.status === 'complete') return;
    await new Promise(r => setTimeout(r, 150));
  }
}

// ── Main cycle ────────────────────────────────────────────────

async function runCycle({ force = false } = {}) {
  const stored = await chrome.storage.local.get({
    enabled: false,
    platforms: DEFAULT_PLATFORM_SETTINGS,
    searchCount: 0,
    recentSearches: [],
  });

  if (!stored.enabled && !force) return;

  const enabledPlatforms = Object.entries(stored.platforms)
    .filter(([, on]) => on)
    .map(([name]) => name)
    .filter(name => PLATFORMS[name]);

  if (enabledPlatforms.length === 0) return;

  // Capture the user's current window before touching anything
  const userWindow = await chrome.windows.getLastFocused({ windowTypes: ['normal'] }).catch(() => null);

  const term = await fetchRandomTopic();

  await scheduleNext();
  startIconUpdates();
  await closeOverdueTabs();

  // Open one platform at a time: create window → focus → wait for load →
  // inject script → next platform. Each tab gets full rendering rights
  // before we move on. All tabs then dwell in the background in parallel.
  const openedTabs  = [];
  const tabWindows  = {};
  const tabCloseTimes = {};

  for (const platform of enabledPlatforms) {
    const config = PLATFORMS[platform];
    let tabId, windowId;

    try {
      const win = await chrome.windows.create({
        url:     config.url(term),
        type:    'popup',
        focused: true,   // focused from the start so it renders immediately
        width:   480,
        height:  640,
      });
      tabId    = win.tabs[0].id;
      windowId = win.id;
    } catch (_) { continue; }

    // Wait for the page to finish loading
    await waitForTabComplete(tabId);

    // Inject the platform engagement script
    try {
      await chrome.scripting.executeScript({ target: { tabId }, files: [config.script] });
    } catch (_) {}

    // Brief pause so the script's first actions (scroll, click) can fire
    await new Promise(r => setTimeout(r, 400));

    // Schedule this tab's closure — dwell runs in the background from here
    const [minDwell, maxDwell] = config.dwell;
    const dwellMs = (minDwell + Math.random() * (maxDwell - minDwell)) * 1000;
    tabCloseTimes[tabId] = Date.now() + dwellMs;
    setTimeout(() => closeNoiseTab(tabId), dwellMs);

    openedTabs.push({ tabId, windowId, platform });
    tabWindows[tabId] = windowId;
  }

  // Return focus to user's original window now that all tabs are initialised
  if (userWindow) {
    try { await chrome.windows.update(userWindow.id, { focused: true }); } catch (_) {}
  }

  const newSearches = openedTabs.map(({ platform }) => ({ term, platform, time: Date.now() }));

  await chrome.storage.local.set({
    tabWindows,
    tabCloseTimes,
    noiseTabs:      openedTabs.map(t => t.tabId),
    searchCount:    (stored.searchCount || 0) + openedTabs.length,
    recentSearches: [...newSearches, ...(stored.recentSearches || [])].slice(0, 20),
  });
}

// ── Tab cleanup ───────────────────────────────────────────────

async function closeNoiseTab(tabId) {
  const { tabWindows = {}, noiseTabs = [], tabCloseTimes = {} } = await chrome.storage.local.get(['tabWindows', 'noiseTabs', 'tabCloseTimes']);
  const windowId = tabWindows[tabId];

  try {
    if (windowId) await chrome.windows.remove(windowId);
    else          await chrome.tabs.remove(tabId);
  } catch (_) {}

  delete tabWindows[tabId];
  delete tabCloseTimes[tabId];
  await chrome.storage.local.set({
    tabWindows,
    tabCloseTimes,
    noiseTabs: noiseTabs.filter(id => id !== tabId),
  });
}

async function closeOverdueTabs() {
  const { tabCloseTimes = {} } = await chrome.storage.local.get('tabCloseTimes');
  const now     = Date.now();
  const overdue = Object.entries(tabCloseTimes)
    .filter(([, t]) => t <= now)
    .map(([id]) => Number(id));
  await Promise.all(overdue.map(closeNoiseTab));
}

// ── Alarm + message handlers ──────────────────────────────────

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) runCycle();
});

chrome.runtime.onMessage.addListener((msg, _sender, respond) => {
  if (msg.type === 'START') {
    chrome.power.requestKeepAwake('system');
    chrome.storage.local.set({ enabled: true }).then(async () => {
      await runCycle();
      respond({ ok: true });
    });
    return true;
  }

  if (msg.type === 'STOP') {
    chrome.power.releaseKeepAwake();
    (async () => {
      chrome.alarms.clearAll();
      const { noiseTabs = [] } = await chrome.storage.local.get('noiseTabs');
      await Promise.all(noiseTabs.map(closeNoiseTab));
      await chrome.storage.local.set({ enabled: false, nextSearchAt: null, lastCycleAt: null });
      updateIcon();
      respond({ ok: true });
    })();
    return true;
  }

  if (msg.type === 'SEARCH_NOW') {
    runCycle({ force: true }).then(() => respond({ ok: true }));
    return true;
  }

  if (msg.type === 'UPDATE_SETTINGS') {
    chrome.storage.local.set(msg.payload).then(() => respond({ ok: true }));
    return true;
  }

  if (msg.type === 'FOREGROUND_TAB') {
    const ytTabId = _sender.tab?.id;
    if (!ytTabId) { respond({ ok: false }); return true; }
    (async () => {
      const [prevTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      await chrome.tabs.update(ytTabId, { active: true });
      await new Promise(r => setTimeout(r, 600));
      if (prevTab && prevTab.id !== ytTabId) {
        await chrome.tabs.update(prevTab.id, { active: true });
      }
      respond({ ok: true });
    })();
    return true;
  }
});
