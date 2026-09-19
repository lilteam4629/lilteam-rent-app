const fs = require('fs');
const path = require('path');
const store = require('./cloud-store');
const paymentService = require('./payment');
const truemoney = require('../services/truemoney');
const mainApi = require('./mainApi');

const locks = new Set();

function ensureData(data) {
  if (!Array.isArray(data.users)) data.users = [];
  if (!Array.isArray(data.topups)) data.topups = [];
  if (!Array.isArray(data.walletTransactions)) data.walletTransactions = [];
  if (!Array.isArray(data.usedSlipRefs)) data.usedSlipRefs = [];
  if (!Array.isArray(data.truemoneyRedemptions)) data.truemoneyRedemptions = [];
}

function list(userId) {
  return (store.data.topups || [])
    .filter(item => item.userId === userId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

async function transactRetry(fn, attempts = 4) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await store.transact(fn);
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise(resolve => setTimeout(resolve, 150 * attempt));
    }
  }
  throw lastError;
}

async function create(userId, amount, method) {
  amount = Number(amount);
  if (!Number.isFinite(amount) || amount < 1) return { ok: false, error: 'จำนวนเงินไม่ถูกต้อง' };
  const item = {
    id: store.id(), userId, amount, method,
    refCode: 'TP' + store.id(3).toUpperCase(), status: 'pending',
    createdAt: new Date().toISOString(),
  };
  await transactRetry(data => { ensureData(data); data.topups.push(item); });
  return { ok: true, item };
}

async function attach(userId, id, file) {
  const item = store.data.topups.find(topup => topup.id === id && topup.userId === userId);
  if (!item || !['pending', 'verifying'].includes(item.status)) return { ok: false, error: 'ไม่พบคำขอหรือรายการจบแล้ว' };
  const ext = path.extname(file.originalname || '').toLowerCase();
  if (!['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) return { ok: false, error: 'รองรับเฉพาะ JPG, PNG และ WEBP' };
  const name = `slip-${id}-${Date.now()}${ext}`;
  fs.writeFileSync(path.join(require('./settings').UPLOADS_DIR, name), file.buffer, { mode: 0o600 });
  await transactRetry(data => {
    ensureData(data);
    const current = data.topups.find(topup => topup.id === id);
    if (current) {
      current.slipFile = name;
      current.slipPath = `/account/topup/${id}/slip-file`;
      current.status = 'verifying';
    }
  });
  const check = await paymentService.verify(file.buffer, item.amount, { filename: file.originalname, contentType: file.mimetype });
  if (check.verified) {
    const ref = String(check.raw?.transRef || check.raw?.trans_ref || check.raw?.rawSlip?.transRef || '').trim();
    if (!ref) {
      check.verified = false;
      check.message = 'ไม่พบเลขอ้างอิงธุรกรรม — รอแอดมินตรวจสอบ';
    } else {
      const claim = await mainApi.claimSlip(ref, id);
      if (!claim.ok) {
        check.verified = false;
        check.message = claim.status === 409 ? 'สลิปนี้เคยถูกใช้เติมเงินไปแล้ว ไม่สามารถใช้ซ้ำได้' : 'ยังเชื่อมต่อระบบกันสลิปซ้ำไม่ได้ กรุณาลองใหม่อีกครั้ง';
      }
    }
  }
  await transactRetry(data => {
    ensureData(data);
    const current = data.topups.find(topup => topup.id === id);
    if (!current) return;
    current.slipCheck = check;
    if (!check.verified) { current.status = 'pending'; return; }
    const ref = String(check.raw?.transRef || check.raw?.trans_ref || check.raw?.rawSlip?.transRef || '');
    if (ref && !data.usedSlipRefs.includes(ref)) data.usedSlipRefs.push(ref);
    const user = data.users.find(entry => entry.id === userId);
    if (!user) throw new Error('ไม่พบผู้ใช้สำหรับรายการเติมเงิน');
    user.walletBalance = Math.round((Number(user.walletBalance) + current.amount) * 100) / 100;
    current.status = 'approved';
    current.reviewedAt = new Date().toISOString();
    if (!data.walletTransactions.some(transaction => transaction.topupId === current.id)) {
      data.walletTransactions.push({ id: store.id(), topupId: current.id, userId, amount: current.amount, type: 'topup', note: `เติมเงิน ${current.refCode}`, createdAt: new Date().toISOString() });
    }
  });
  return { ok: true, item: store.data.topups.find(topup => topup.id === id) };
}

async function review(id, approve, note = '') {
  const current = store.data.topups.find(topup => topup.id === id);
  if (!current || !['pending', 'verifying'].includes(current.status)) return { ok: false, error: 'รายการถูกดำเนินการแล้ว' };
  if (approve) {
    const ref = String(current.slipCheck?.raw?.transRef || current.slipCheck?.raw?.trans_ref || current.slipCheck?.raw?.rawSlip?.transRef || '').trim();
    if (ref) {
      const claim = await mainApi.claimSlip(ref, id);
      if (!claim.ok) return { ok: false, error: claim.status === 409 ? 'สลิปนี้เคยถูกใช้เติมเงินในอีกเว็บแล้ว' : 'ยังเชื่อมต่อระบบกันสลิปซ้ำไม่ได้ กรุณาลองใหม่' };
    }
  }
  return transactRetry(data => {
    ensureData(data);
    const item = data.topups.find(topup => topup.id === id);
    if (!item || !['pending', 'verifying'].includes(item.status)) return { ok: false, error: 'รายการถูกดำเนินการแล้ว' };
    item.status = approve ? 'approved' : 'rejected';
    item.reviewNote = note;
    item.reviewedAt = new Date().toISOString();
    if (approve) {
      const user = data.users.find(entry => entry.id === item.userId);
      if (!user) throw new Error('ไม่พบผู้ใช้สำหรับรายการเติมเงิน');
      user.walletBalance = Math.round((Number(user.walletBalance) + item.amount) * 100) / 100;
      if (!data.walletTransactions.some(transaction => transaction.topupId === item.id)) {
        data.walletTransactions.push({ id: store.id(), topupId: item.id, userId: user.id, amount: item.amount, type: 'topup', note: `แอดมินอนุมัติ ${item.refCode}`, createdAt: new Date().toISOString() });
      }
    }
    return { ok: true, item };
  });
}

async function reserveTrueMoneyClaim(userId, voucherCode) {
  return transactRetry(data => {
    ensureData(data);
    const transaction = data.walletTransactions.find(item => item.voucherCode === voucherCode);
    if (transaction) {
      if (transaction.userId !== userId) return { state: 'blocked' };
      const item = data.topups.find(topup => topup.id === transaction.topupId || topup.voucherCode === voucherCode);
      return { state: item ? 'credited' : 'repair', item, amount: Number(transaction.amount) || Number(item?.amount) || 0 };
    }
    let claim = data.truemoneyRedemptions.find(item => item.voucherCode === voucherCode);
    if (claim && claim.userId !== userId) return { state: 'blocked' };
    if (!claim) {
      claim = { id: store.id(), voucherCode, userId, status: 'processing', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      data.truemoneyRedemptions.push(claim);
    } else {
      claim.status = claim.status === 'approved' ? 'processing' : claim.status;
      claim.updatedAt = new Date().toISOString();
    }
    const item = claim.topupId ? data.topups.find(topup => topup.id === claim.topupId) : null;
    return { state: item && claim.status === 'approved' ? 'credited' : 'processing', item, amount: Number(claim.amount) || Number(item?.amount) || 0, senderName: claim.senderName || '' };
  });
}

async function finalizeTrueMoneyClaim(userId, voucherCode, amount, senderName = '') {
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) throw new Error('จำนวนเงินจากซองไม่ถูกต้อง');
  return transactRetry(data => {
    ensureData(data);
    const existingTransaction = data.walletTransactions.find(item => item.voucherCode === voucherCode);
    if (existingTransaction && existingTransaction.userId !== userId) return { ok: false, error: 'ซองนี้ถูกผูกกับบัญชีอื่นแล้ว' };
    let claim = data.truemoneyRedemptions.find(item => item.voucherCode === voucherCode);
    if (claim && claim.userId !== userId) return { ok: false, error: 'ซองนี้ถูกผูกกับบัญชีอื่นแล้ว' };
    if (!claim) {
      claim = { id: store.id(), voucherCode, userId, status: 'processing', createdAt: new Date().toISOString() };
      data.truemoneyRedemptions.push(claim);
    }
    if (existingTransaction) {
      claim.status = 'approved';
      claim.amount = Number(existingTransaction.amount) || numericAmount;
      claim.topupId = existingTransaction.topupId || claim.topupId;
      claim.updatedAt = new Date().toISOString();
      let item = data.topups.find(topup => topup.id === claim.topupId || topup.voucherCode === voucherCode);
      if (!item) {
        const now = new Date().toISOString();
        item = { id: store.id(), userId, amount: Number(existingTransaction.amount) || numericAmount, method: 'truemoney_angpao', voucherCode, refCode: 'TM' + store.id(3).toUpperCase(), status: 'approved', createdAt: now, reviewedAt: now, slipCheck: { checked: true, verified: true, provider: 'truemoney_angpao', recovered: true } };
        data.topups.push(item);
        existingTransaction.topupId = item.id;
        claim.topupId = item.id;
      }
      return { ok: true, item, alreadyCredited: true };
    }
    const user = data.users.find(entry => entry.id === userId);
    if (!user) throw new Error('ไม่พบผู้ใช้สำหรับรายการเติมเงิน');
    const now = new Date().toISOString();
    const item = {
      id: store.id(), userId, amount: numericAmount, method: 'truemoney_angpao',
      voucherCode, refCode: 'TM' + store.id(3).toUpperCase(), status: 'approved',
      createdAt: now, reviewedAt: now,
      slipCheck: { checked: true, verified: true, provider: 'truemoney_angpao', senderName: senderName || 'ไม่ระบุชื่อ' },
    };
    user.walletBalance = Math.round((Number(user.walletBalance) + numericAmount) * 100) / 100;
    data.topups.push(item);
    data.walletTransactions.push({ id: store.id(), topupId: item.id, userId, amount: numericAmount, type: 'topup', voucherCode, note: `TrueMoney ${item.refCode}`, createdAt: now });
    claim.status = 'approved';
    claim.amount = numericAmount;
    claim.senderName = senderName || claim.senderName || 'ไม่ระบุชื่อ';
    claim.topupId = item.id;
    claim.updatedAt = now;
    return { ok: true, item };
  });
}

async function redeem(userId, input) {
  const payment = store.payment();
  if (!payment.truemoneyEnabled || !/^0\d{9}$/.test(truemoney.normalizePhone(payment.truemoneyPhone))) return { ok: false, error: 'ระบบ TrueMoney ยังไม่พร้อม' };
  const voucherCode = truemoney.extractVoucherCode(input);
  if (!voucherCode) return { ok: false, error: 'ลิงก์ซองของขวัญไม่ถูกต้อง' };
  if (locks.has(voucherCode)) return { ok: false, error: 'ซองนี้กำลังตรวจสอบ กรุณารอสักครู่แล้วลองใหม่' };
  locks.add(voucherCode);
  try {
    const reservation = await reserveTrueMoneyClaim(userId, voucherCode);
    if (reservation.state === 'blocked') return { ok: false, error: 'ซองนี้ถูกผูกกับบัญชีอื่นแล้ว' };
    if (reservation.state === 'credited') {
      if (reservation.item) return { ok: true, item: reservation.item, recovered: true };
      return { ok: false, recoverable: true, error: 'รายการนี้ถูกบันทึกยอดแล้ว กรุณารีเฟรชหน้าเว็บ' };
    }
    if (reservation.amount > 0) {
      const recovered = await finalizeTrueMoneyClaim(userId, voucherCode, reservation.amount, reservation.senderName);
      if (recovered.ok) return { ...recovered, recovered: true };
    }
    let result;
    try {
      result = await truemoney.redeemAngpao(input, payment.truemoneyPhone);
    } catch (error) {
      console.error('[TrueMoney provider]', error);
      return { ok: false, recoverable: true, error: 'เชื่อมต่อระบบ TrueMoney ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง' };
    }
    if (!result.success) {
      if (result.code === 'TARGET_USER_REDEEMED') return { ok: false, recoverable: true, error: 'ซองถูกรับแล้ว แต่ยังอ่านยอดเงินไม่ครบ ระบบจะไม่หักซ้ำ กรุณาลองลิงก์เดิมอีกครั้ง' };
      return { ok: false, error: result.message || 'ไม่สามารถรับเงินจากซองได้' };
    }
    try {
      const finalized = await finalizeTrueMoneyClaim(userId, voucherCode, result.amount, result.senderName);
      return finalized.ok ? { ...finalized, recovered: Boolean(result.recovered) } : finalized;
    } catch (error) {
      console.error('[TrueMoney persistence]', error);
      return { ok: false, recoverable: true, error: 'รับซองสำเร็จแล้ว แต่กำลังบันทึกยอดเข้าระบบ กรุณาส่งลิงก์เดิมอีกครั้ง ระบบจะไม่หักซ้ำ' };
    }
  } finally {
    locks.delete(voucherCode);
  }
}

module.exports = { list, create, attach, review, redeem };
