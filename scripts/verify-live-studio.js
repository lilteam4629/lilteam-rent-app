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
    await page.screenshot({ path: path.resolve(__dirname, '../outputs/live-home-preview.png') });
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
