const $ = (id) => document.getElementById(id);

const PLATFORM_ABBR = {
  google: 'G', youtube: 'Y', reddit: 'R',
  instagram: 'I', x: 'X', tiktok: 'T', amazon: 'A', pinterest: 'P',
};

const ALL_PLATFORMS = ['google', 'youtube', 'reddit', 'instagram', 'x', 'tiktok', 'amazon', 'pinterest'];

let countdownTimer = null;

// ── Helpers ───────────────────────────────────────────────────

function formatRelative(ms) {
  const sec = Math.max(0, Math.round(ms / 1000));
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const s = sec % 60;
  return s > 0 ? `${min}m ${s}s` : `${min}m`;
}

function timeAgo(ts) {
  const diff = Date.now() - ts;
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  return `${Math.floor(diff / 3600000)}h ago`;
}

// ── State → UI ────────────────────────────────────────────────

function renderStatus(enabled, nextSearchAt) {
  const card = $('statusCard');
  const label = $('statusLabel');
  const sub = $('statusSub');

  if (!enabled) {
    card.classList.remove('active');
    label.textContent = 'Paused';
    sub.textContent = 'Enable to start scrambling';
    clearInterval(countdownTimer);
    return;
  }

  card.classList.add('active');
  label.textContent = 'Active';

  clearInterval(countdownTimer);
  countdownTimer = setInterval(() => {
    if (!nextSearchAt) {
      sub.textContent = 'Scheduling next search…';
      return;
    }
    const remaining = nextSearchAt - Date.now();
    if (remaining <= 0) {
      sub.textContent = 'Searching now…';
    } else {
      sub.textContent = `Next search in ${formatRelative(remaining)}`;
    }
  }, 500);
}

function renderRecent(recentSearches, searchCount) {
  $('countBadge').textContent = `${searchCount} today`;

  const list = $('recentList');
  if (!recentSearches || recentSearches.length === 0) {
    list.innerHTML = '<li class="empty-state">No searches yet</li>';
    return;
  }

  // Group by term, preserving order of first occurrence
  const groups = new Map();
  for (const { term, platform, time } of recentSearches) {
    if (!groups.has(term)) groups.set(term, { term, platforms: [], time });
    const g = groups.get(term);
    if (!g.platforms.includes(platform)) g.platforms.push(platform);
    if (time > g.time) g.time = time;
  }

  list.innerHTML = [...groups.values()].map(({ term, platforms, time }) => {
    const icons = platforms.map(p =>
      `<span class="recent-platform ${p}" title="${p}">${PLATFORM_ABBR[p] || '?'}</span>`
    ).join('');
    return `
      <li class="recent-item">
        <div class="recent-icons">${icons}</div>
        <span class="recent-term" title="${term}">${term}</span>
        <span class="recent-time">${timeAgo(time)}</span>
      </li>
    `;
  }).join('');
}

function applySettings(settings) {
  const { enabled, platforms, searchCount, recentSearches, nextSearchAt } = settings;

  $('toggle').checked = !!enabled;
  renderStatus(!!enabled, nextSearchAt);

  const defaults = { google: true, youtube: true, reddit: false, instagram: false, x: false, tiktok: false, amazon: false, pinterest: false };
  for (const p of ALL_PLATFORMS) {
    $(`platform-${p}`).checked = platforms?.[p] ?? defaults[p];
  }

  renderRecent(recentSearches ?? [], searchCount ?? 0);
}

// ── Load ──────────────────────────────────────────────────────

async function loadState() {
  const settings = await chrome.storage.local.get({
    enabled: false,
    platforms: { google: true, youtube: true, reddit: false, instagram: false, x: false, tiktok: false, amazon: false, pinterest: false },
    searchCount: 0,
    recentSearches: [],
    nextSearchAt: null,
  });
  applySettings(settings);
}

// ── Events ────────────────────────────────────────────────────

$('toggle').addEventListener('change', async (e) => {
  if (e.target.checked) {
    await chrome.runtime.sendMessage({ type: 'START' });
  } else {
    await chrome.runtime.sendMessage({ type: 'STOP' });
  }
  loadState();
});

ALL_PLATFORMS.forEach((platform) => {
  $(`platform-${platform}`).addEventListener('change', async () => {
    const platforms = Object.fromEntries(ALL_PLATFORMS.map(p => [p, $(`platform-${p}`).checked]));
    await chrome.runtime.sendMessage({ type: 'UPDATE_SETTINGS', payload: { platforms } });
  });
});


$('searchNow').addEventListener('click', async () => {
  $('searchNow').disabled = true;
  $('searchNow').textContent = 'Searching…';
  await chrome.runtime.sendMessage({ type: 'SEARCH_NOW' });
  await loadState();
  $('searchNow').disabled = false;
  $('searchNow').textContent = 'Search now';
});

$('clearCount').addEventListener('click', async () => {
  await chrome.storage.local.set({ searchCount: 0, recentSearches: [] });
  loadState();
});

// ── Live updates from storage ─────────────────────────────────

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;

  const watched = ['enabled', 'nextSearchAt', 'recentSearches', 'searchCount'];
  if (watched.some((k) => k in changes)) loadState();
});

// ── Init ──────────────────────────────────────────────────────

loadState();
