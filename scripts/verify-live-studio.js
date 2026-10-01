const { chromium } = require('playwright-core');
const path = require('path');
const assert = require('assert');
(async () => {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    const response = await page.goto('https://rent.lilteam.site/', { waitUntil: 'networkidle', timeout: 60000 });
    assert.equal(response.status(), 200);
    assert.equal(await page.locator('[data-screen-tab]').count(), 7, 'New deployment must have seven screenshots');
    assert.equal(await page.locator('link[href="/css/cloud-studio-v2.css?v=studio3"]').count(), 1, 'Updated image layout stylesheet');
    await page.waitForTimeout(1100);
    const word = await page.locator('.cloud-stage-word').boundingBox();
    const hero = await page.locator('.hero-browser').boundingBox();
    assert(word.y + word.height < hero.y, 'Hero title must be fully visible');
    await page.screenshot({ path: path.resolve(__dirname, '../outputs/live-home-preview.png') });
    if (await page.locator('.cloud-extra-gallery').count()) {
      await page.locator('.cloud-extra-gallery').scrollIntoViewIfNeeded();
      await page.waitForFunction(() => [...document.querySelectorAll('.cloud-extra-gallery img')].every(img => img.complete && img.naturalWidth > 0));
      assert(await page.locator('.cloud-extra-gallery img').evaluateAll(images => images.every(img => Math.abs(img.clientWidth / img.clientHeight - img.naturalWidth / img.naturalHeight) < .02)), 'Full image proportions');
      await page.locator('.cloud-extra-gallery').screenshot({ path: path.resolve(__dirname, '../outputs/live-gallery-full.png') });
    }
    await page.locator('[data-screen-tab]').nth(5).click();
    await page.locator('[data-screen-panel]:visible [data-expand-screen]').click();
    assert(await page.locator('dialog').isVisible()); await page.keyboard.press('Escape');
    await page.locator('[data-cloud-theme]').click(); assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
    await page.locator('[data-cloud-theme]').click();
    await page.setViewportSize({ width: 390, height: 844 }); await page.goto('https://rent.lilteam.site/', { waitUntil: 'networkidle' });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2));
    for (const route of ['/login', '/register', '/admin/login']) { const r = await page.goto('https://rent.lilteam.site' + route, { waitUntil: 'networkidle' }); assert.equal(r.status(), 200); }
    assert.deepEqual(errors, []);
    console.log('Live verified: new assets, seven-screen gallery, zoom, theme, mobile viewport and authentication pages. No live account/payment writes.');
  } finally { await browser.close(); }
})().catch(e => { console.error(e.message); process.exitCode = 1; });
