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

  await waitFor('[data-component-type="s-search-result"]');
  await delay(rand(1500, 2500));

  // Scroll through results before clicking (simulates comparison browsing)
  for (let i = 0; i < 3; i++) {
    window.scrollBy({ top: rand(200, 350), behavior: 'smooth' });
    await delay(rand(1500, 3000));
  }

  // Click into first product — product page dwell + scroll depth are Amazon's key signals
  const product = document.querySelector(
    '[data-component-type="s-search-result"] h2 a.a-link-normal, .s-result-item h2 a'
  );
  if (product) {
    await delay(rand(600, 1200));
    product.click();

    await waitFor('#productTitle, #dp-container');
    await delay(rand(1500, 2500));

    // Scroll through product details, reviews section
    for (let i = 0; i < 6; i++) {
      window.scrollBy({ top: rand(200, 400), behavior: 'smooth' });
      await delay(rand(2000, 4000));
    }
  }
})();
