(async () => {
  const delay = ms => new Promise(r => setTimeout(r, ms));
  const rand  = (a, b) => a + Math.random() * (b - a);

  const waitFor = async (selector, timeout = 6000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      const el = document.querySelector(selector);
      if (el) return el;
      await delay(300);
    }
    return null;
  };

  // Wait for results to render
  await waitFor('#search');
  await delay(rand(1500, 3000));

  // Slow scroll through search results
  for (let i = 0; i < 4; i++) {
    window.scrollBy({ top: rand(180, 320), behavior: 'smooth' });
    await delay(rand(1800, 3500));
  }

  // Click first organic (non-ad) result — this is Google's most valued signal
  const result = await waitFor('#rso .g a[href]:not([href^="/search"]):not([href*="google.com"])');
  if (result) {
    await delay(rand(800, 1800));
    result.click(); // tab navigates to result; dwell timer closes it later
  }
})();
