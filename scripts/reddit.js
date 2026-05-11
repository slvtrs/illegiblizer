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

  const tryClick = (selector) => {
    const el = document.querySelector(selector);
    if (el) { el.click(); return true; }
    return false;
  };

  // Reddit SPA — wait for posts to hydrate
  await waitFor('[data-testid="post-container"], shreddit-post');
  await delay(rand(1500, 2500));

  // Scroll through search results
  for (let i = 0; i < 3; i++) {
    window.scrollBy({ top: rand(200, 350), behavior: 'smooth' });
    await delay(rand(1500, 3000));
  }

  // Click into the first post
  const post = document.querySelector(
    '[data-testid="post-container"] a[data-click-id="body"], shreddit-post a[slot="full-post-link"]'
  );
  if (!post) return;

  await delay(rand(500, 1200));
  post.click();

  // Wait for the post page to load
  await waitFor('[data-testid="comment-top-meta"], shreddit-comment, .Comment');
  await delay(rand(1000, 2000));

  // Click "View answers" by text — more reliable than data-testid which Reddit changes often
  const viewAnswersBtn = [...document.querySelectorAll('button, a')].find(
    el => el.textContent.trim().toLowerCase() === 'view answers'
  );
  if (viewAnswersBtn) {
    viewAnswersBtn.click();
    await delay(rand(800, 1500));
  }

  // Scroll through comments
  for (let i = 0; i < 5; i++) {
    window.scrollBy({ top: rand(200, 380), behavior: 'smooth' });
    await delay(rand(2000, 4000));
  }

  // Expand "load more comments" if present
  tryClick('button[data-testid="comments-page-link-num-comments"], #load-more-comments button');
})();
