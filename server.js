const path = require('path');
const express = require('express');
const session = require('express-session');
const flash = require('connect-flash');
const multer = require('multer');
const FormData = require('form-data');
const mainApi = require('./lib/mainApi');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', 1);

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

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
const SHOP_NAME = process.env.SHOP_NAME || 'LilTeam Shop';
const LOGO_IMAGE = process.env.LOGO_IMAGE || null;

app.use((req, res, next) => {
  res.locals.mainDomain = MAIN_DOMAIN;
  res.locals.mainSiteUrl = MAIN_SITE_URL;
  res.locals.shopName = SHOP_NAME;
  res.locals.logoImage = LOGO_IMAGE;
  next();
});

// ---------- Landing ----------
app.get('/', async (req, res) => {
  const plansRes = await mainApi.plans();
  res.render('home', { title: `เช่าเว็บร้านค้าออนไลน์ | ${SHOP_NAME} Cloud`, plans: plansRes.ok ? plansRes.body.plans : [] });
});

// ---------- Auth ----------
app.get('/login', (req, res) => res.render('login', { title: 'เข้าสู่ระบบ' }));

app.post('/login', async (req, res) => {
  const result = await mainApi.login(req.body.username, req.body.password);
  if (!result.ok) {
    req.flash('error', (result.body && result.body.error) || 'เข้าสู่ระบบไม่สำเร็จ');
    return res.redirect('/login');
  }
  req.session.userId = result.body.user.id;
  req.session.user = result.body.user;
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
  req.flash('success', `สมัครสมาชิกสำเร็จ! ยินดีต้อนรับสู่ ${SHOP_NAME} Cloud`);
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
