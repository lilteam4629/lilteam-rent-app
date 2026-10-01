const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright-core');
const root = path.join(__dirname, '..');
const mainRoot = path.resolve(root, '../gacha-live-release');
const output = path.join(root, 'public/images/showcase');
fs.mkdirSync(output, { recursive: true });
const dataFile = path.join(os.tmpdir(), `showcase-main-${process.pid}.json`);
const child = spawn(process.execPath, ['src/app.js'], { cwd: mainRoot,
  env: { ...process.env, PORT: '3297', NODE_ENV: 'test', TEST_DB_PATH: dataFile, MONGODB_URI: '', DISCORD_BOT_TOKEN: '', LICENSE_GATE: 'off' }, stdio: 'ignore' });
(async () => {
  let browser;
  try {
    for (let i = 0; i < 80; i++) {
      try { if ((await fetch('http://127.0.0.1:3297/health')).ok) break; } catch {}
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 1 });
    await page.addInitScript(() => localStorage.setItem('lilteam_theme', 'light'));
    for (const [name, url] of [['home', 'https://lilteam.site/'], ['catalog', 'https://lilteam.site/products'], ['help', 'https://lilteam.site/how-to-buy']]) {
      const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      if (!response.ok() && name === 'help') continue;
      const consent = page.getByRole('button', { name: 'จำเป็นเท่านั้น', exact: true });
      if (await consent.count()) await consent.first().click();
      await page.waitForTimeout(1800);
      await page.screenshot({ path: path.join(output, `${name}.jpg`), type: 'jpeg', quality: 82 });
      console.log(`Captured public ${name}`);
    }
    const productLink = await page.goto('https://lilteam.site/products', { waitUntil: 'domcontentloaded' }).then(() => page.locator('a[href^="/game/"]').first().getAttribute('href'));
    await page.goto('https://lilteam.site' + productLink, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(output, 'product.jpg'), type: 'jpeg', quality: 82 });
    const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, baseURL: 'http://127.0.0.1:3297' });
    await context.request.post('/login', { form: { username: 'admin', password: 'admin1234' } });
    const admin = await context.newPage();
    for (const [name, url] of [['dashboard', '/admin'], ['inventory', '/admin/products'], ['stock', '/admin/products/' + JSON.parse(fs.readFileSync(dataFile, 'utf8')).products[0].id + '/stock'], ['orders', '/admin/orders']]) {
      await admin.goto(url, { waitUntil: 'domcontentloaded' });
      await admin.waitForTimeout(800);
      await admin.screenshot({ path: path.join(output, `${name}.jpg`), type: 'jpeg', quality: 82 });
      console.log(`Captured demo ${name}`);
    }
    fs.writeFileSync(path.join(root, 'docs/showcase-provenance.md'), '# Website screenshot provenance\n\nCaptured ' + new Date().toISOString() + '\n\n- home.jpg, catalog.jpg, product.jpg: public LilTeam site pages; actual screen captures. Necessary-only cookie consent selected; light theme.\n- dashboard.jpg, inventory.jpg, stock.jpg, orders.jpg: current main-shop code rendered against a local seeded demo dataset; no customer records or production credentials. Labelled demo in the gallery.\n- Browser viewport 1440 × 960; JPEG quality 82.\n');
  } finally {
    if (browser) await browser.close();
    child.kill();
    try { fs.unlinkSync(dataFile); } catch {}
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
