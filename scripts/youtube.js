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

  // Grab the real native setters before defining our interceptors
  const proto     = HTMLMediaElement.prototype;
  const setMuted  = Object.getOwnPropertyDescriptor(proto, 'muted').set;
  const setVolume = Object.getOwnPropertyDescriptor(proto, 'volume').set;

  const silenceVideo = (video) => {
    // Actually mute via the native setter
    setMuted.call(video, true);
    setVolume.call(video, 0);
    // Override the instance's own property so any future JS assignment
    // (including YouTube's player) is silently redirected back to silence
    try {
      Object.defineProperty(video, 'muted',  { get: () => true, set: () => setMuted.call(video, true),  configurable: true });
      Object.defineProperty(video, 'volume', { get: () => 0,    set: () => setVolume.call(video, 0),    configurable: true });
    } catch (_) {}
  };

  const forceMute = (video) => {
    video.defaultMuted = true;
    silenceVideo(video);
    video.play().catch(() => {
      chrome.runtime.sendMessage({ type: 'FOREGROUND_TAB' });
    });
  };

  // Belt-and-suspenders: re-silence at 1 s and 4 s for late player init
  for (const ms of [1000, 4000]) {
    setTimeout(() => document.querySelectorAll('video').forEach(silenceVideo), ms);
  }

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
