(async () => {
  const delay = ms => new Promise(r => setTimeout(r, ms));
  const rand  = (a, b) => a + Math.random() * (b - a);

  const waitFor = async (selector, timeout = 10000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      const el = document.querySelector(selector);
      if (el) return el;
      await delay(400);
    }
    return null;
  };

  // TikTok's algorithm is almost entirely watch-time based
  // Getting a video to autoplay is the most important action
  await waitFor('[data-e2e="search-video-card"], .css-1soki6-DivItemContainer');
  await delay(rand(1500, 2500));

  // Click the first video result — this navigates to the video player where it autoplays
  const video = document.querySelector(
    '[data-e2e="search-video-card"] a, .css-1soki6-DivItemContainer a[href*="/video/"]'
  );
  if (video) {
    video.click();
    // The dwell timer gives the video 55-85 seconds to play
    // TikTok counts completion rate, so letting it run is the signal

    // If we end up on the video page, try to unmute (videos often start muted)
    await delay(3000);
    const muteBtn = document.querySelector('[data-e2e="video-player-volume-button"], button[aria-label*="mute"]');
    if (muteBtn) muteBtn.click();

  } else {
    // Fallback: scroll through search results
    for (let i = 0; i < 4; i++) {
      window.scrollBy({ top: rand(300, 500), behavior: 'smooth' });
      await delay(rand(2000, 4000));
    }
  }
})();
