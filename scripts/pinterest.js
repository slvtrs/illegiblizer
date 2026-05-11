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

  await waitFor('[data-test-id="pin"], [data-test-id="pinWrapper"]');
  await delay(rand(1500, 3000));

  // Browse the pin grid before clicking (scrolling through pins is itself a signal)
  for (let i = 0; i < 3; i++) {
    window.scrollBy({ top: rand(250, 450), behavior: 'smooth' });
    await delay(rand(2000, 4000));
  }

  // Click a pin — Pinterest weights saves and click-throughs heavily
  const pin = document.querySelector('[data-test-id="pin"] a, [data-test-id="pinWrapper"] a');
  if (pin) {
    await delay(rand(600, 1200));
    pin.click();

    await waitFor('[data-test-id="pin-closeup-container"], [data-test-id="pin-detail"]');
    await delay(rand(2000, 3500));

    // Scroll through the pin detail and related pins below
    for (let i = 0; i < 4; i++) {
      window.scrollBy({ top: rand(200, 350), behavior: 'smooth' });
      await delay(rand(2000, 3500));
    }
  }
})();
