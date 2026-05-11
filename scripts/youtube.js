(async () => {
  const delay = ms => new Promise(r => setTimeout(r, ms));
  const rand  = (a, b) => a + Math.random() * (b - a);

  const waitFor = async (selector, timeout = 10000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      const el = document.querySelector(selector);
      if (el) return el;
      await delay(300);
    }
    return null;
  };

  const forceMute = (video) => {
    video.defaultMuted = true;
    video.muted  = true;
    video.volume = 0;
    // Re-mute if YouTube's player tries to restore volume
    video.addEventListener('volumechange', () => {
      if (!video.muted) { video.muted = true; video.volume = 0; }
    });
    video.play().catch(() => {
      chrome.runtime.sendMessage({ type: 'FOREGROUND_TAB' });
    });
  };

  // Mute any video element the instant it appears
  const observer = new MutationObserver(() => {
    document.querySelectorAll('video').forEach(v => {
      if (!v.dataset.igMuted) { v.dataset.igMuted = '1'; forceMute(v); }
    });
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  // Also catch anything already on the page
  document.querySelectorAll('video').forEach(v => {
    v.dataset.igMuted = '1';
    forceMute(v);
  });

  // Click first search result to navigate to watch page
  await waitFor('ytd-video-renderer');
  await delay(rand(1200, 2500));

  const link = await waitFor('ytd-video-renderer a#video-title');
  if (!link) return;
  await delay(rand(500, 1200));
  link.click();

  // Keep observer running through SPA navigation so the watch page video is caught
  await delay(15000);
  observer.disconnect();
})();
