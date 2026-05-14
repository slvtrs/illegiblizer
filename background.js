const ALARM_NAME = 'illegiblizer-cycle';
const enc = encodeURIComponent;

// engage: true  → inject script and hold for 60/numPlatforms seconds before opening next
// engage: false → open window (search registers on page load) and move on immediately
const PLATFORMS = {
  google:    { url: q => `https://www.google.com/search?q=${enc(q)}`,                    script: 'scripts/google.js',    dwell: [50, 80], engage: true  },
  youtube:   { url: q => `https://www.youtube.com/results?search_query=${enc(q)}`,        script: 'scripts/youtube.js',   dwell: [55, 85], engage: true  },
  reddit:    { url: q => `https://www.reddit.com/search/?q=${enc(q)}`,                    script: 'scripts/reddit.js',    dwell: [45, 75], engage: true  },
  instagram: { url: q => `https://www.instagram.com/explore/search/keyword/?q=${enc(q)}`, script: 'scripts/instagram.js', dwell: [40, 65], engage: false },
  x:         { url: q => `https://x.com/search?q=${enc(q)}&src=typed_query&f=live`,       script: 'scripts/x.js',         dwell: [40, 65], engage: false },
  tiktok:    { url: q => `https://www.tiktok.com/search?q=${enc(q)}`,                     script: 'scripts/tiktok.js',    dwell: [55, 85], engage: true  },
  amazon:    { url: q => `https://www.amazon.com/s?k=${enc(q)}`,                          script: 'scripts/amazon.js',    dwell: [45, 75], engage: true  },
  pinterest: { url: q => `https://www.pinterest.com/search/pins/?q=${enc(q)}`,            script: 'scripts/pinterest.js', dwell: [40, 65], engage: false },
};

// Tile windows so successive popups don't stack on top of each other.
// Assumes a reasonable screen — positions wrap if more than 6 windows are open.
const WINDOW_POSITIONS = [
  { left:    0, top:   40 },
  { left:  500, top:   40 },
  { left: 1000, top:   40 },
  { left:    0, top:  700 },
  { left:  500, top:  700 },
  { left: 1000, top:  700 },
];

// Global slot counter — increments across cycles so overlapping cycles
// place their windows at different positions.
let windowSlot = 0;

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

  if (!enabled) {
    if (iconTimerId) { clearInterval(iconTimerId); iconTimerId = null; }
    try {
      await chrome.action.setIcon({ path: { 16: 'icons/icon16.png', 48: 'icons/icon48.png', 128: 'icons/icon128.png' } });
    } catch (_) {}
    return;
  }

  let progress = 0;
  if (nextSearchAt && lastCycleAt) {
    progress = Math.max(0, Math.min(1, (nextSearchAt - Date.now()) / (nextSearchAt - lastCycleAt)));
  }
  try {
    await chrome.action.setIcon({
      imageData: { 16: drawRingIcon(16, progress, true), 32: drawRingIcon(32, progress, true) },
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
  await chrome.alarms.clear(ALARM_NAME);
  const delayMs = 60000 + Math.random() * 10000;
  const now     = Date.now();
  await chrome.alarms.create(ALARM_NAME, { delayInMinutes: delayMs / 60000 });
  await chrome.storage.local.set({ nextSearchAt: now + delayMs, lastCycleAt: now });
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

// ── Main cycle ────────────────────────────────────────────────
// For engage platforms: injects immediately, then waits 60/numPlatforms seconds
// before opening the next window. For non-engage platforms: opens and moves on
// immediately (search registers on page load alone).

// Incremented only by STOP — lets multiple cycles overlap freely while still
// giving STOP a single lever to abort every in-flight loop at once.
let runGeneration = 0;

async function runCycle({ force = false } = {}) {
  const myGeneration = runGeneration;

  const { enabled, platforms: platformSettings } = await chrome.storage.local.get({
    enabled: false,
    platforms: DEFAULT_PLATFORM_SETTINGS,
  });

  if (!enabled && !force) return;

  const enabledPlatforms = Object.entries(platformSettings)
    .filter(([, on]) => on)
    .map(([name]) => name)
    .filter(name => PLATFORMS[name]);

  if (enabledPlatforms.length === 0) return;

  const userWindow = await chrome.windows.getLastFocused({ windowTypes: ['normal'] }).catch(() => null);
  const term = await fetchRandomTopic();

  await scheduleNext();
  startIconUpdates();
  await closeOverdueTabs();

  // Time budget per engaging platform: split the 60-second cycle evenly.
  const engageSecs = Math.max(5, Math.floor(60 / enabledPlatforms.length));

  // Ping storage every 5 s to keep the service worker alive during engage waits.
  const keepAlive = setInterval(() => chrome.storage.local.get('_ka'), 5000);
  const t0 = Date.now();
  const ts = () => `+${((Date.now() - t0) / 1000).toFixed(1)}s`;

  try {
    for (const platform of enabledPlatforms) {
      if (runGeneration !== myGeneration) return; // STOP was called

      const config = PLATFORMS[platform];
      const pos    = WINDOW_POSITIONS[windowSlot++ % WINDOW_POSITIONS.length];
      let tabId, windowId;

      console.log(`[illeg ${ts()}] opening: ${platform} (engage=${config.engage}, pos=${pos.left},${pos.top})`);
      try {
        const win = await chrome.windows.create({
          url:     config.url(term),
          type:    'popup',
          focused: true,
          width:   480,
          height:  640,
          left:    pos.left,
          top:     pos.top,
        });
        tabId    = win.tabs[0].id;
        windowId = win.id;
      } catch (_) { continue; }

      // Register immediately so the popup updates in real-time and STOP can
      // close this window even while we're still iterating.
      {
        const { tabWindows: tw = {}, noiseTabs: n = [], recentSearches: r = [], searchCount: c = 0, sessionCount: sc = 0 } =
          await chrome.storage.local.get(['tabWindows', 'noiseTabs', 'recentSearches', 'searchCount', 'sessionCount']);
        await chrome.storage.local.set({
          tabWindows:     { ...tw, [tabId]: windowId },
          noiseTabs:      [...new Set([...n, tabId])],
          searchCount:    c + 1,
          sessionCount:   sc + 1,
          recentSearches: [{ term, platform, time: Date.now() }, ...r].slice(0, 2000),
        });
      }

      if (config.engage) {
        // Inject after 5 s (page needs time to reach a scriptable state).
        // Not awaited — script has its own internal waitFor logic.
        setTimeout(() => {
          console.log(`[illeg ${ts()}] injecting: ${platform}`);
          chrome.scripting.executeScript({
            target: { tabId },
            files:  [config.script],
            world:  platform === 'youtube' ? 'MAIN' : 'ISOLATED',
          }).then(() => console.log(`[illeg ${ts()}] inject done: ${platform}`))
            .catch(e => console.log(`[illeg ${ts()}] inject failed: ${platform}: ${e.message}`));
        }, 5000);

        // Hold for the engagement budget before opening the next window.
        console.log(`[illeg ${ts()}] engaging ${platform} for ${engageSecs} s`);
        await new Promise(r => setTimeout(r, engageSecs * 1000));
        if (runGeneration !== myGeneration) return;
        console.log(`[illeg ${ts()}] done: ${platform}`);
      } else {
        // Non-engage: search registers on page load. Move on immediately,
        // but still inject in the background for extra realism.
        console.log(`[illeg ${ts()}] skipping engage wait: ${platform}`);
        setTimeout(() => {
          chrome.scripting.executeScript({
            target: { tabId },
            files:  [config.script],
            world:  'ISOLATED',
          }).catch(() => {});
        }, 5000);
      }

      // Schedule this tab's closure.
      const [minDwell, maxDwell] = config.dwell;
      const dwellMs = (minDwell + Math.random() * (maxDwell - minDwell)) * 1000;
      setTimeout(() => closeNoiseTab(tabId), dwellMs);
      const { tabCloseTimes: tc = {} } = await chrome.storage.local.get('tabCloseTimes');
      await chrome.storage.local.set({ tabCloseTimes: { ...tc, [tabId]: Date.now() + dwellMs } });
    }
  } finally {
    clearInterval(keepAlive);
  }

  if (runGeneration !== myGeneration) return;
  if (userWindow) try { await chrome.windows.update(userWindow.id, { focused: true }); } catch (_) {}
}

// ── Alarm + message handlers ──────────────────────────────────

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) runCycle();
});

chrome.runtime.onMessage.addListener((msg, _sender, respond) => {
  if (msg.type === 'START') {
    chrome.power.requestKeepAwake('system');
    chrome.storage.local.set({ enabled: true, sessionCount: 0 }).then(() => {
      runCycle(); // fire and forget — cycles can now overlap
      respond({ ok: true });
    });
    return true;
  }

  if (msg.type === 'STOP') {
    runGeneration++;                  // abort every in-progress runCycle loop
    chrome.power.releaseKeepAwake();
    (async () => {
      await chrome.alarms.clearAll();
      const { noiseTabs = [], sessionCount = 0 } = await chrome.storage.local.get(['noiseTabs', 'sessionCount']);
      await Promise.all(noiseTabs.map(closeNoiseTab));
      await chrome.storage.local.set({
        enabled: false, nextSearchAt: null, lastCycleAt: null,
        lastSessionCount: sessionCount, sessionCount: 0,
      });
      updateIcon();
      respond({ ok: true });
    })();
    return true;
  }

  if (msg.type === 'SEARCH_NOW') {
    runCycle({ force: true });
    respond({ ok: true });
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
