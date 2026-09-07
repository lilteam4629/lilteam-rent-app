const fs = require('fs');
const path = require('path');
const express = require('express');
const session = require('express-session');
const flash = require('connect-flash');
const multer = require('multer');
const FormData = require('form-data');
const mainApi = require('./lib/mainApi');
const settings = require('./lib/settings');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', 1);

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(settings.UPLOADS_DIR));

// This app holds no sensitive data of its own — every real fact (users,
// shops, wallet balance) lives behind the internal API on the main app.
// A simple in-memory session store is enough; there's nothing here that
// needs to survive a restart beyond "please log in again".
app.use(session({
  secret: process.env.SESSION_SECRET || 'rent-app-dev-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 1000 * 60 * 60 * 24 * 7 },
}));
app.use(flash());

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

app.use((req, res, next) => {
  res.locals.messages = { success: req.flash('success'), error: req.flash('error') };
  res.locals.currentUser = req.session.user || null;
  res.locals.isAdmin = !!req.session.isAdmin;
  next();
});

function requireLogin(req, res, next) {
  if (!req.session.userId) {
    req.flash('error', 'กรุณาเข้าสู่ระบบก่อน');
    return res.redirect('/login');
  }
  next();
}

// Keeps req.session.user (wallet balance especially) reasonably fresh —
// cheap enough to call on every protected page since it's one small GET.
async function refreshSessionUser(req) {
  if (!req.session.userId) return null;
  const result = await mainApi.me(req.session.userId);
  if (!result.ok) return req.session.user || null;
  req.session.user = result.body.user;
  return result.body;
}

const MAIN_SITE_URL = process.env.MAIN_SITE_URL || 'https://lilteam.site';
const MAIN_DOMAIN = MAIN_SITE_URL.replace(/^https?:\/\//, '');
const DEFAULT_SHOP_NAME = process.env.SHOP_NAME || 'LilTeam Shop';
const DEFAULT_LOGO_IMAGE = process.env.LOGO_IMAGE || null;
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || null;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || null;
const DEFAULT_HERO_TITLE = 'เปิดร้านค้าออนไลน์ของคุณ\nใน 1 นาที';
const DEFAULT_HERO_SUBTITLE = 'เช่าเว็บร้านค้าพร้อมระบบขายอัตโนมัติ จัดการสต็อก กระเป๋าเงิน มินิเกมลุ้นรางวัล และตรวจสลิปอัตโนมัติ 24 ชั่วโมง — ติดตั้งพร้อมใช้งานทันทีหลังชำระเงิน ไม่ต้องเขียนโค้ดสักบรรทัด';

function currentShopName() {
  return settings.get().shopName || DEFAULT_SHOP_NAME;
}
function currentLogoImage() {
  return settings.get().logoImage || DEFAULT_LOGO_IMAGE;
}
function currentHeroTitle() {
  return settings.get().heroTitle || DEFAULT_HERO_TITLE;
}
function currentHeroSubtitle() {
  return settings.get().heroSubtitle || DEFAULT_HERO_SUBTITLE;
}
function isHeroTitleCustomized() {
  return !!settings.get().heroTitle;
}

app.use((req, res, next) => {
  res.locals.mainDomain = MAIN_DOMAIN;
  res.locals.mainSiteUrl = MAIN_SITE_URL;
  res.locals.shopName = currentShopName();
  res.locals.logoImage = currentLogoImage();
  res.locals.heroTitle = currentHeroTitle();
  res.locals.heroSubtitle = currentHeroSubtitle();
  res.locals.heroCustomized = isHeroTitleCustomized();
  res.locals.siteEffects = {
    snowEnabled: settings.get().snowEnabled === true,
    musicEnabled: settings.get().musicEnabled === true,
    musicUrl: settings.get().musicUrl || '',
    musicVolume: Math.max(0, Math.min(100, Number(settings.get().musicVolume) || 35)),
  };
  next();
});

function requireAdmin(req, res, next) {
  if (!req.session.isAdmin) {
    req.flash('error', 'กรุณาเข้าสู่ระบบผู้ดูแลก่อน');
    return res.redirect('/admin/login');
  }
  next();
}

app.get('/admin/login', (req, res) => res.render('admin-login', { title: 'เข้าสู่ระบบผู้ดูแล' }));

app.post('/admin/login', (req, res) => {
  if (!ADMIN_USERNAME || !ADMIN_PASSWORD) {
    req.flash('error', 'เซิร์ฟเวอร์ยังไม่ได้ตั้งค่า ADMIN_USERNAME/ADMIN_PASSWORD');
    return res.redirect('/admin/login');
  }
  if (req.body.username !== ADMIN_USERNAME || req.body.password !== ADMIN_PASSWORD) {
    req.flash('error', 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
    return res.redirect('/admin/login');
  }
  req.session.isAdmin = true;
  res.redirect('/admin');
});

app.post('/admin/logout', (req, res) => {
  req.session.isAdmin = false;
  res.redirect(req.query.next === '/' ? '/' : '/admin/login');
});

app.get('/admin', requireAdmin, async (req, res) => {
  res.render('admin', {
    title: 'จัดการเว็บเช่าร้าน',
    showcaseImages: settings.get().showcaseImages || [],
    showcaseIsCustom: !!(settings.get().showcaseImages && settings.get().showcaseImages.length),
  });
});

app.post('/admin/settings', requireAdmin, (req, res) => {
  settings.update({
    shopName: (req.body.shopName || '').trim() || undefined,
    snowEnabled: req.body.snowEnabled === 'on',
    musicEnabled: req.body.musicEnabled === 'on',
    musicUrl: (req.body.musicUrl || '').trim(),
    musicVolume: Math.max(0, Math.min(100, Number(req.body.musicVolume) || 35)),
  });
  req.flash('success', 'บันทึกการตั้งค่าแล้ว');
  res.redirect('/admin');
});

app.post('/admin/hero', requireAdmin, (req, res) => {
  settings.update({
    heroTitle: (req.body.heroTitle || '').trim() || undefined,
    heroSubtitle: (req.body.heroSubtitle || '').trim() || undefined,
  });
  req.flash('success', 'บันทึกข้อความหัวเว็บแล้ว');
  res.redirect('/admin');
});

app.post('/admin/hero/reset', requireAdmin, (req, res) => {
  settings.update({ heroTitle: undefined, heroSubtitle: undefined });
  req.flash('success', 'รีเซ็ตข้อความหัวเว็บเป็นค่าเริ่มต้นแล้ว');
  res.redirect('/admin');
});

app.post('/admin/showcase-images', requireAdmin, upload.single('image'), (req, res) => {
  if (!req.file) {
    req.flash('error', 'กรุณาเลือกไฟล์รูปภาพ');
    return res.redirect('/admin');
  }
  const ext = path.extname(req.file.originalname) || '.jpg';
  const filename = `showcase-${Date.now()}${ext}`;
  fs.writeFileSync(path.join(settings.UPLOADS_DIR, filename), req.file.buffer);
  const current = settings.get().showcaseImages || [];
  settings.update({ showcaseImages: [...current, `/uploads/${filename}`].slice(-4) });
  req.flash('success', 'เพิ่มรูปตัวอย่างร้านค้าแล้ว');
  res.redirect('/admin');
});

app.post('/admin/showcase-images/:index/remove', requireAdmin, (req, res) => {
  const current = settings.get().showcaseImages || [];
  const next = current.filter((_, i) => i !== Number(req.params.index));
  settings.update({ showcaseImages: next });
  req.flash('success', 'ลบรูปแล้ว');
  res.redirect('/admin');
});

app.post('/admin/showcase-images/reset', requireAdmin, (req, res) => {
  settings.update({ showcaseImages: [] });
  req.flash('success', 'เปลี่ยนกลับเป็นดึงรูปอัตโนมัติจากเว็บหลักแล้ว');
  res.redirect('/admin');
});

app.post('/admin/logo', requireAdmin, upload.single('logo'), (req, res) => {
  if (!req.file) {
    req.flash('error', 'กรุณาเลือกไฟล์รูปภาพ');
    return res.redirect('/admin');
  }
  const ext = path.extname(req.file.originalname) || '.png';
  const filename = `logo-${Date.now()}${ext}`;
  fs.writeFileSync(path.join(settings.UPLOADS_DIR, filename), req.file.buffer);
  settings.update({ logoImage: `/uploads/${filename}` });
  req.flash('success', 'อัปโหลดโลโก้ใหม่แล้ว');
  res.redirect('/admin');
});

// ---------- Admin: plans (proxies the main site's own plan store) ----------
app.get('/admin/plans', requireAdmin, async (req, res) => {
  const result = await mainApi.adminListPlans();
  if (!result.ok) {
    req.flash('error', (result.body && result.body.error) || 'โหลดแพ็กเกจไม่สำเร็จ');
    return res.render('admin-plans', { title: 'แพ็กเกจราคา', plans: [] });
  }
  res.render('admin-plans', { title: 'แพ็กเกจราคา', plans: result.body.plans });
});

app.post('/admin/plans', requireAdmin, async (req, res) => {
  const result = await mainApi.adminCreatePlan(req.body);
  if (!result.ok) req.flash('error', (result.body && result.body.error) || 'เพิ่มแพ็กเกจไม่สำเร็จ');
  else req.flash('success', 'เพิ่มแพ็กเกจแล้ว');
  res.redirect('/admin/plans');
});

app.post('/admin/plans/:id', requireAdmin, async (req, res) => {
  const result = await mainApi.adminEditPlan(req.params.id, req.body);
  if (!result.ok) req.flash('error', (result.body && result.body.error) || 'แก้ไขแพ็กเกจไม่สำเร็จ');
  else req.flash('success', 'บันทึกแพ็กเกจแล้ว');
  res.redirect('/admin/plans');
});

app.post('/admin/plans/:id/toggle', requireAdmin, async (req, res) => {
  await mainApi.adminTogglePlan(req.params.id);
  res.redirect('/admin/plans');
});

app.post('/admin/plans/:id/delete', requireAdmin, async (req, res) => {
  const result = await mainApi.adminDeletePlan(req.params.id);
  if (!result.ok) req.flash('error', (result.body && result.body.error) || 'ลบแพ็กเกจไม่สำเร็จ');
  else req.flash('success', 'ลบแพ็กเกจแล้ว');
  res.redirect('/admin/plans');
});

// ---------- Admin: topups / slip review ----------
app.get('/admin/topups', requireAdmin, async (req, res) => {
  const status = ['pending', 'approved', 'rejected'].includes(req.query.status) ? req.query.status : '';
  const q = String(req.query.q || '');
  const result = await mainApi.adminListTopups({ status, q });
  res.render('admin-topups', {
    title: 'เติมเงิน/สลิป',
    requests: result.ok ? result.body.requests : [],
    status,
    q,
  });
});

app.get('/admin/topups/:id/slip', requireAdmin, async (req, res) => {
  try {
    const upstream = await mainApi.adminSlipStream(req.params.id);
    res.setHeader('Content-Type', upstream.headers['content-type'] || 'application/octet-stream');
    upstream.data.pipe(res);
  } catch {
    res.sendStatus(404);
  }
});

app.post('/admin/topups/:id/approve', requireAdmin, async (req, res) => {
  const result = await mainApi.adminApproveTopup(req.params.id);
  if (!result.ok) req.flash('error', (result.body && result.body.error) || 'อนุมัติไม่สำเร็จ');
  else req.flash('success', 'อนุมัติคำขอเติมเงินแล้ว');
  res.redirect('/admin/topups');
});

app.post('/admin/topups/:id/reject', requireAdmin, async (req, res) => {
  const result = await mainApi.adminRejectTopup(req.params.id, req.body.reviewNote);
  if (!result.ok) req.flash('error', (result.body && result.body.error) || 'ปฏิเสธไม่สำเร็จ');
  else req.flash('success', 'ปฏิเสธคำขอแล้ว');
  res.redirect('/admin/topups');
});

// ---------- Admin: users ----------
app.get('/admin/users', requireAdmin, async (req, res) => {
  const q = String(req.query.q || '');
  const result = await mainApi.adminListUsers({ q });
  res.render('admin-users', {
    title: 'บัญชีผู้ใช้',
    users: result.ok ? result.body.users : [],
    q,
  });
});

// ---------- Landing ----------
// Pulls a few real product image URLs straight from the live main site's
// homepage HTML so the "real shop" showcase never shows fake/mockup images.
// Cached briefly since it's just decorative and the main site is on a
// separate box — no need to hit it on every single landing-page view.
let showcaseImagesCache = { images: [], fetchedAt: 0 };
async function getShowcaseImages() {
  const custom = settings.get().showcaseImages;
  if (custom && custom.length) return custom;

  const CACHE_MS = 10 * 60 * 1000;
  if (Date.now() - showcaseImagesCache.fetchedAt < CACHE_MS) return showcaseImagesCache.images;
  try {
    const axios = require('axios');
    const res = await axios.get(MAIN_SITE_URL, { timeout: 5000 });
    const html = res.data;
    // Only real product photos (class="latest-order-image"), never the site logo.
    const imgTags = html.match(/<img[^>]+>/g) || [];
    const productSrcs = imgTags
      .filter((tag) => tag.includes('latest-order-image'))
      .map((tag) => (tag.match(/src="([^"]+)"/) || [])[1])
      .filter(Boolean);
    const unique = [...new Set(productSrcs)].slice(0, 4);
    if (unique.length) showcaseImagesCache = { images: unique, fetchedAt: Date.now() };
  } catch {
    // Keep serving whatever's cached (or empty) — the page still works fine without it.
  }
  return showcaseImagesCache.images;
}

app.get('/', async (req, res) => {
  const [plansRes, showcaseImages] = await Promise.all([mainApi.plans(), getShowcaseImages()]);
  res.render('home', {
    title: `เช่าเว็บร้านค้าออนไลน์ | ${currentShopName()} Cloud`,
    plans: plansRes.ok ? plansRes.body.plans : [],
    showcaseImages,
  });
});

// ---------- Auth ----------
app.get('/login', (req, res) => res.render('login', { title: 'เข้าสู่ระบบ' }));

app.post('/login', async (req, res) => {
  const loginUsername = String(req.body.username || '').trim();
  const loginPassword = String(req.body.password || '');
  if (ADMIN_USERNAME && ADMIN_PASSWORD && loginUsername === ADMIN_USERNAME.trim() && loginPassword === ADMIN_PASSWORD) {
    req.session.isAdmin = true;
    delete req.session.userId;
    delete req.session.user;
    req.flash('success', `ยินดีต้อนรับผู้ดูแล ${ADMIN_USERNAME}`);
    return req.session.save((error) => {
      if (error) return res.status(500).send('ไม่สามารถบันทึกสถานะเข้าสู่ระบบได้');
      res.redirect('/');
    });
  }
  const result = await mainApi.login(loginUsername, loginPassword);
  if (!result.ok) {
    req.flash('error', (result.body && result.body.error) || 'เข้าสู่ระบบไม่สำเร็จ');
    return res.redirect('/login');
  }
  req.session.userId = result.body.user.id;
  req.session.user = result.body.user;
  req.session.isAdmin = false;
  req.flash('success', `ยินดีต้อนรับ ${result.body.user.username}`);
  res.redirect(req.query.next && req.query.next.startsWith('/') ? req.query.next : '/my-shops');
});

app.get('/register', async (req, res) => {
  // Site key is public by design (embedded in the widget) — fetched from
  // the main app so both apps always show the same recaptcha config.
  const configRes = await mainApi.config();
  res.render('register', { title: 'สมัครสมาชิก', recaptchaSiteKey: (configRes.body && configRes.body.recaptchaSiteKey) || '' });
});

app.post('/register', async (req, res) => {
  const { username, email, password, confirmPassword } = req.body;
  if (!username || !email || !password) {
    req.flash('error', 'กรุณากรอกข้อมูลให้ครบถ้วน');
    return res.redirect('/register');
  }
  if (password !== confirmPassword) {
    req.flash('error', 'รหัสผ่านไม่ตรงกัน');
    return res.redirect('/register');
  }
  const result = await mainApi.register(username, email, password, req.body['g-recaptcha-response']);
  if (!result.ok) {
    req.flash('error', (result.body && result.body.error) || 'สมัครสมาชิกไม่สำเร็จ');
    return res.redirect('/register');
  }
  req.session.userId = result.body.user.id;
  req.session.user = result.body.user;
  req.flash('success', `สมัครสมาชิกสำเร็จ! ยินดีต้อนรับสู่ ${currentShopName()} Cloud`);
  res.redirect('/');
});

app.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

// ---------- Start a shop ----------
app.get('/start', requireLogin, async (req, res) => {
  const [plansRes, meRes] = await Promise.all([mainApi.plans(), refreshSessionUser(req)]);
  res.render('start', {
    title: 'เปิดร้านของคุณเอง',
    plans: plansRes.ok ? plansRes.body.plans : [],
    preselectedPlanId: String(req.query.plan || ''),
    recaptchaSiteKey: (meRes && meRes.recaptchaSiteKey) || '',
  });
});

app.post('/start', requireLogin, async (req, res) => {
  const result = await mainApi.createShop({
    userId: req.session.userId,
    planId: req.body.planId,
    shopName: req.body.shopName,
    adminUsername: req.body.adminUsername,
    adminPassword: req.body.adminPassword,
    recaptchaResponse: req.body['g-recaptcha-response'],
  });
  if (!result.ok) {
    req.flash('error', (result.body && result.body.error) || 'เปิดร้านไม่สำเร็จ');
    return res.redirect('/start');
  }
  await refreshSessionUser(req);
  req.flash('success', `เปิดร้าน "${result.body.shopName}" สำเร็จ! เข้าสู่ระบบร้านใหม่ด้วยชื่อผู้ใช้ ${result.body.adminUsername}`);
  res.redirect('/my-shops');
});

// ---------- My shops ----------
app.get('/my-shops', requireLogin, async (req, res) => {
  const [shopsRes, plansRes] = await Promise.all([mainApi.myShops(req.session.userId), mainApi.plans()]);
  res.render('my-shops', {
    title: 'ร้านของฉัน',
    shops: shopsRes.ok ? shopsRes.body.shops : [],
    plans: plansRes.ok ? plansRes.body.plans : [],
  });
});

app.post('/my-shops/:id/renew', requireLogin, async (req, res) => {
  const result = await mainApi.renewShop(req.params.id, { userId: req.session.userId, planId: req.body.planId });
  if (!result.ok) {
    req.flash('error', (result.body && result.body.error) || 'ต่ออายุไม่สำเร็จ');
    return res.redirect('/my-shops');
  }
  await refreshSessionUser(req);
  req.flash('success', `ต่ออายุร้าน "${result.body.shop.name}" สำเร็จ!`);
  res.redirect('/my-shops');
});

// ---------- Wallet / topup ----------
app.get('/wallet', requireLogin, async (req, res) => {
  const [topupsRes] = await Promise.all([mainApi.walletTopups(req.session.userId), refreshSessionUser(req)]);
  res.render('wallet', {
    title: 'เติมเงิน',
    topups: topupsRes.ok ? topupsRes.body.topups : [],
  });
});

app.post('/wallet/topup', requireLogin, upload.single('slip'), async (req, res) => {
  const form = new FormData();
  form.append('userId', req.session.userId);
  form.append('amount', String(req.body.amount || ''));
  form.append('method', req.body.method || 'promptpay');
  if (req.file) {
    form.append('slip', req.file.buffer, { filename: req.file.originalname, contentType: req.file.mimetype });
  }
  const result = await mainApi.topup(form);
  if (!result.ok) {
    req.flash('error', (result.body && result.body.error) || 'เติมเงินไม่สำเร็จ');
    return res.redirect('/wallet');
  }
  req.flash('success', req.file
    ? 'แนบสลิปแล้ว ระบบกำลังตรวจสอบอัตโนมัติเบื้องหลัง — รีเฟรชหน้านี้อีกครั้งในไม่กี่วินาที'
    : 'สร้างคำขอเติมเงินแล้ว');
  res.redirect('/wallet');
});

app.use((req, res) => {
  res.status(404).render('404', { title: 'ไม่พบหน้านี้' });
});

app.listen(PORT, () => console.log(`rent-app running at http://localhost:${PORT}`));
