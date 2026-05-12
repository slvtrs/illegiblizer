(async () => {
  const delay = ms => new Promise(r => setTimeout(r, ms));
  const rand  = (a, b) => a + Math.random() * (b - a);

  const proto    = HTMLMediaElement.prototype;
  const setMuted  = Object.getOwnPropertyDescriptor(proto, 'muted').set;
  const setVolume = Object.getOwnPropertyDescriptor(proto, 'volume').set;
  const setDefaultMuted = Object.getOwnPropertyDescriptor(proto, 'defaultMuted')?.set;

  // ── Prong 1: Prototype setter override ───────────────────────────────
  // Runs in MAIN world — intercepts every future assignment to
  // video.muted / video.volume / video.defaultMuted in YouTube's own JS.
  Object.defineProperty(proto, 'muted',  {
    ...Object.getOwnPropertyDescriptor(proto, 'muted'),
    set(v) { setMuted.call(this, true); },
  });
  Object.defineProperty(proto, 'volume', {
    ...Object.getOwnPropertyDescriptor(proto, 'volume'),
    set(v) { setVolume.call(this, 0); },
  });
  if (setDefaultMuted) {
    Object.defineProperty(proto, 'defaultMuted', {
      ...Object.getOwnPropertyDescriptor(proto, 'defaultMuted'),
      set(v) { setDefaultMuted.call(this, true); },
    });
  }

  // ── Prong 2: Direct native-setter silencing ───────────────────────────
  // Uses the captured original setters — bypasses any wrapper YouTube may
  // have built around the prototype before our injection.
  const silence = el => {
    setMuted.call(el, true);
    setVolume.call(el, 0);
    if (setDefaultMuted) setDefaultMuted.call(el, true);
  };
  document.querySelectorAll('video').forEach(silence);

  // ── Prong 3: MutationObserver — catch new video elements instantly ────
  // Filters to added nodes only — avoids querySelectorAll on every one of
  // YouTube's hundreds of DOM mutations per second.
  new MutationObserver(mutations => {
    for (const { addedNodes } of mutations) {
      for (const node of addedNodes) {
        if (node.nodeType !== 1) continue;
        if (node.tagName === 'VIDEO') silence(node);
        node.querySelectorAll?.('video').forEach(silence);
      }
    }
  }).observe(document.documentElement, { childList: true, subtree: true });

  // ── Prong 4: Simulate the "m" key via YouTube's own mute stack ────────
  // Reads YouTube's mute-button title to determine internal player state —
  // NOT video.muted, which we've already overridden and which can't see
  // into YouTube's Web Audio API routing.
  // Button title: "Mute (m)" = currently unmuted  |  "Unmute (m)" = muted
  const pressM = () => {
    const btn = document.querySelector('.ytp-mute-button');
    if (!btn) return; // player not ready — skip rather than blindly toggling
    const ytIsMuted = btn.title.includes('Unmute');
    if (!ytIsMuted) {
      const opts = { key: 'm', code: 'KeyM', keyCode: 77, which: 77, bubbles: true };
      document.dispatchEvent(new KeyboardEvent('keydown', opts));
      document.dispatchEvent(new KeyboardEvent('keyup',   opts));
    }
    // Always direct-silence regardless — belt-and-suspenders
    document.querySelectorAll('video').forEach(silence);
  };

  // ── Click first search result ─────────────────────────────────────────
  const waitFor = async (sel, timeout = 10000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      const el = document.querySelector(sel);
      if (el) return el;
      await delay(300);
    }
    return null;
  };

  await waitFor('ytd-video-renderer');
  await delay(rand(1200, 2500));
  const link = await waitFor('ytd-video-renderer a#video-title');
  if (!link) return;
  await delay(rand(500, 1200));
  link.click();

  // Timers are now relative to the click (= watch-page navigation),
  // not to injection time — so they fire as the player is actually loading.
  for (const ms of [1000, 2500, 4000, 6500, 10000]) {
    setTimeout(pressM, ms);
  }
})();
