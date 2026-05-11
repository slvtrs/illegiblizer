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

  // Instagram's SPA takes a moment to render search results
  await waitFor('article, ._aagv img, [role="main"] img');
  await delay(rand(2000, 4000));

  // Slow scroll simulates browsing the explore grid
  // Scroll speed and pause duration signal genuine interest to IG's algorithm
  for (let i = 0; i < 6; i++) {
    window.scrollBy({ top: rand(150, 280), behavior: 'smooth' });
    await delay(rand(2500, 5000)); // long pauses — IG weights time-on-image heavily
  }

  // Click into the first result if available
  const post = document.querySelector('article a, ._aagv a, [role="main"] a[href*="/p/"]');
  if (post) {
    await delay(rand(800, 1500));
    post.click();
    await delay(rand(3000, 6000)); // view the post/reel
  }
})();
