// Isolated browser coverage. Never submits a payment or changes a production shop.
const fs = require('fs'), os = require('os'), path = require('path'), http = require('http');
const { spawn } = require('child_process');
const assert = require('assert');
const { chromium } = require('playwright-core');
const root = path.join(__dirname, '..');
const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'cloud-studio-'));
const output = path.join(root, 'outputs');
fs.mkdirSync(output, { recursive: true });
const plans = [{ id: 'month', days: 30, price: 179, promo: false }, { id: 'quarter', days: 90, price: 499, promo: false }];
const shops = [{ id: 'demo', name: 'ร้านตัวอย่าง', shopName: 'ร้านตัวอย่าง', slug: 'demo', url: 'https://demo.example', managementUrl: 'https://demo.example/admin', expiresAt: Date.now() + 86400000 * 20 }];
const mock = http.createServer((req, res) => {
  const route = req.url.split('?')[0];
  let data = {};
  if (route.endsWith('/plans') || route.endsWith('/license-plans')) data = { plans };
  if (route.endsWith('/shops')) data = { shops };
  if (route.endsWith('/payments/config')) data = { payment: { sharedPayment: true, automaticSlipCheck: true, slipProvider: 'xepht', bankName: 'ธนาคารตัวอย่าง', bankAccountNumber: '0000000000', bankAccountName: 'ข้อมูลทดสอบ', truemoneyEnabled: false } };
  if (route.endsWith('/admin/rentals')) data = { rentedShops: shops, featureCatalog: [], featureReleases: [], transactions: [], sales: [], discordSettings: {}, discordConfigured: false, discordReady: false };
  if (route.endsWith('/sales')) data = { sales: [] };
  res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data));
});
let child, browser;
(async () => {
  await new Promise(resolve => mock.listen(0, '127.0.0.1', resolve));
  const upstream = `http://127.0.0.1:${mock.address().port}`;
  fs.writeFileSync(path.join(fixture, 'cloud-data.json'), JSON.stringify({ users: [{ id: 'demo-user', username: 'demo', email: 'demo@example.test', passwordHash: await require('bcryptjs').hash('fixture-only', 4), walletBalance: 999, status: 'active' }] }));
  fs.writeFileSync(path.join(fixture, 'settings.json'), JSON.stringify({ showcaseImages: ['/images/showcase/home.jpg', '/images/showcase/product.jpg', '/images/showcase/catalog.jpg', '/images/showcase/stock.jpg'] }));
  child = spawn(process.execPath, ['server.js'], { cwd: root, env: { ...process.env, PORT: '3298', NODE_ENV: 'test', DATA_DIR: fixture, MAIN_API_BASE_URL: upstream, MAIN_SITE_URL: upstream, ADMIN_USERNAME: 'fixture-admin', ADMIN_PASSWORD: 'fixture-only', SESSION_SECRET: 'isolated-browser-fixture-session-only' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; child.stderr.on('data', chunk => log += chunk);
  for (let i = 0; i < 60; i++) { try { if ((await fetch('http://127.0.0.1:3298/health')).ok) break; } catch {} await new Promise(r => setTimeout(r, 200)); }
  browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  async function visit(route) {
    const response = await page.goto('http://127.0.0.1:3298' + route, { waitUntil: 'networkidle' });
    assert.equal(response.status(), 200, route + ': ' + log);
    assert(!await page.locator('body').innerText().then(t => /ReferenceError|SyntaxError|Internal Server Error/.test(t)), route);
    console.log('OK', route);
  }
  await visit('/');
  assert.equal(await page.locator('[data-screen-tab]').count(), 7);
  async function heroDoesNotOverlap() {
    await page.waitForTimeout(1100);
    const title = await page.locator('.cloud-stage-word').boundingBox();
    const image = await page.locator('.hero-browser').boundingBox();
    assert(title.y + title.height < image.y, 'Hero image must not overlap YOUR STORE');
  }
  await heroDoesNotOverlap();
  assert.equal(await page.locator('html').evaluate(el => getComputedStyle(el).getPropertyValue('--gold').trim()), '#4f70a4', 'Main storefront light accent');
  await page.locator('[data-store-engine]').scrollIntoViewIfNeeded();
  await page.locator('[data-engine-select="0"]').click();
  await page.waitForFunction(() => document.querySelector('[data-store-engine]').dataset.engineStep === '1');
  await page.locator('[data-motion-toggle]').click();
  assert.equal(await page.locator('[data-motion-toggle]').getAttribute('aria-pressed'), 'true');
  const pausedStep = await page.locator('[data-store-engine]').getAttribute('data-engine-step');
  await page.waitForTimeout(2800);
  assert.equal(await page.locator('[data-store-engine]').getAttribute('data-engine-step'), pausedStep, 'Pause stops simulation');
  await page.locator('[data-engine-select="2"]').click();
  assert.equal(await page.locator('[data-engine-delivery]').innerText(), 'ข้อมูลพร้อมส่งมอบ');
  await page.locator('[data-store-engine]').screenshot({ path: path.join(output, 'system-motion-desktop.png') });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  assert.equal(await page.locator('.engine-hub-orbit').evaluate(el => getComputedStyle(el).animationName), 'none', 'Reduced motion disables orbit');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.locator('.cloud-extra-gallery').scrollIntoViewIfNeeded();
  await page.waitForFunction(() => [...document.querySelectorAll('.cloud-extra-gallery img')].every(img => img.complete && img.naturalWidth > 0));
  assert(await page.locator('.cloud-extra-gallery img').evaluateAll(images => images.every(img => Math.abs(img.clientWidth / img.clientHeight - img.naturalWidth / img.naturalHeight) < .02)), 'Additional images must keep their full original proportions');
  await page.locator('.cloud-extra-gallery').screenshot({ path: path.join(output, 'gallery-full-images.png') });
  await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
  await page.screenshot({ path: path.join(output, 'home-desktop.png'), fullPage: true });
  await page.screenshot({ path: path.join(output, 'home-preview.png') });
  await page.locator('[data-screen-tab]').nth(3).click();
  assert.equal(await page.locator('[data-screen-panel]:visible').count(), 1);
  await page.locator('[data-screen-panel]:visible [data-expand-screen]').click();
  assert(await page.locator('dialog').isVisible()); await page.keyboard.press('Escape');
  await page.locator('[data-screen-tab]').nth(3).focus(); await page.keyboard.press('ArrowRight');
  assert.equal(await page.locator('[data-screen-tab]').nth(4).getAttribute('aria-selected'), 'true');
  await page.locator('[data-cloud-theme]').click();
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
  assert.equal(await page.locator('html').evaluate(el => getComputedStyle(el).getPropertyValue('--gold').trim()), '#9aa1ac', 'Main storefront dark accent');
  await page.locator('[data-cloud-theme]').click();
  for (const route of ['/login', '/register', '/admin/login']) await visit(route);
  await visit('/login'); await page.locator('[name=username]').fill('demo'); await page.locator('[name=password]').fill('fixture-only');
  await Promise.all([page.waitForURL(url => !url.pathname.includes('login')), page.locator('form[action="/login"] button').click()]);
  for (const route of ['/my-shops', '/start', '/wallet', '/sales']) await visit(route);
  await visit('/admin'); assert.equal(new URL(page.url()).pathname, '/admin/login', 'Member must not access owner dashboard');
  await visit('/my-shops'); await page.screenshot({ path: path.join(output, 'shops-desktop.png'), fullPage: true });
  await visit('/start'); await page.locator('label').filter({ has: page.locator('[data-cloud-plan-price]') }).last().click();
  assert((await page.locator('[data-cloud-setup-summary]').innerText()).includes('499'));
  await visit('/admin/login'); await page.locator('[name=username]').fill('fixture-admin'); await page.locator('[name=password]').fill('fixture-only');
  await Promise.all([page.waitForURL('**/admin'), page.locator('form[action="/admin/login"] button').click()]);
  await visit('/admin/login'); assert.equal(new URL(page.url()).pathname, '/admin', 'Signed-in owner skips login page');
  await visit('/'); assert.equal(await page.locator('.cloud-header-actions a[href="/admin"]').innerText(), 'จัดการเว็บเช่า');
  assert.equal(await page.locator('.cloud-footer a[href="/admin"]').count(), 1);
  await page.request.post('http://127.0.0.1:3298/admin/logout');
  await visit('/login'); await page.locator('[name=username]').fill('fixture-admin'); await page.locator('[name=password]').fill('fixture-only');
  await Promise.all([page.waitForURL('**/admin'), page.locator('form[action="/login"] button').click()]);
  for (const route of ['/admin', '/admin/plans', '/admin/rentals', '/admin/topups', '/admin/users', '/admin/payment']) await visit(route);
  await visit('/admin'); await page.screenshot({ path: path.join(output, 'admin-desktop.png'), fullPage: true });
  await page.screenshot({ path: path.join(output, 'admin-preview.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('[data-cloud-admin-menu]').click(); assert.equal(await page.locator('[data-cloud-admin-menu]').getAttribute('aria-expanded'), 'true');
  for (const route of ['/', '/my-shops', '/start', '/wallet', '/admin', '/admin/plans', '/admin/rentals', '/admin/topups', '/admin/users', '/admin/payment']) {
    await visit(route);
    if (route === '/') {
      await heroDoesNotOverlap();
      await page.locator('[data-store-engine]').scrollIntoViewIfNeeded();
      await page.locator('[data-store-engine]').screenshot({ path: path.join(output, 'system-motion-mobile.png') });
    }
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2), route + ' overflows mobile viewport');
  }
  await visit('/'); await page.screenshot({ path: path.join(output, 'home-mobile.png'), fullPage: true });
  const images = await page.locator('img').evaluateAll(nodes => nodes.filter(n => n.complete && n.naturalWidth === 0).map(n => n.src));
  assert.deepEqual(images, [], 'broken images'); assert.deepEqual(errors, [], 'browser runtime errors');
  console.log('Cloud Studio: gallery, keyboard, modal, setup totals, 13 routes, mobile overflow and runtime checks passed');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { await browser?.close(); child?.kill(); mock.close(); fs.rmSync(fixture, { recursive: true, force: true }); });
