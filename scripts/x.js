(async () => {
  const delay = ms => new Promise(r => setTimeout(r, ms));
  const rand  = (a, b) => a + Math.random() * (b - a);

  const waitFor = async (selector, timeout = 8000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      const el = document.querySelector(selector);
      if (el) return el;
      await delay(300);
    }
    return null;
  };

  await waitFor('[data-testid="tweet"]');
  await delay(rand(1500, 3000));

  // X tracks linger time per tweet — scroll very slowly, pausing on each tweet
  // This simulates reading, which is the primary signal X uses
  const scrollPauses = Math.floor(rand(6, 10));
  for (let i = 0; i < scrollPauses; i++) {
    // Small scroll increments to stay on each tweet longer
    window.scrollBy({ top: rand(80, 180), behavior: 'smooth' });
    await delay(rand(3000, 6500));
  }

  // Click into one tweet to view thread (signals strong interest)
  const tweet = document.querySelector('[data-testid="tweet"] a[href*="/status/"]');
  if (tweet) {
    await delay(rand(500, 1200));
    tweet.click();
    await delay(rand(3000, 6000));

    // Scroll through the thread replies
    for (let i = 0; i < 3; i++) {
      window.scrollBy({ top: rand(150, 300), behavior: 'smooth' });
      await delay(rand(2000, 4000));
    }
  }
})();
