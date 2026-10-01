const mainApi = require('./mainApi');
async function configuration() {
  const response = await mainApi.sharedPaymentConfig();
  if (!response.ok || !response.body.payment) return { sharedPayment: true, unavailable: true, automaticSlipCheck: false, truemoneyEnabled: false, error: 'เชื่อมต่อระบบเติมเงินของเว็บหลักไม่ได้ กรุณาลองใหม่' };
  return response.body.payment;
}
async function verify(buffer, amount, file, context) {
  const response = await mainApi.verifySharedSlip(buffer, amount, file, context);
  if (!response.ok) return { checked: false, verified: false, retryable: response.status !== 409, message: response.body?.error || 'เชื่อมต่อระบบตรวจสลิปไม่ได้ กรุณาลองใหม่', raw: null };
  return response.body.check;
}
async function test() { const payment = await configuration(); return { ok: !payment.unavailable && payment.automaticSlipCheck, message: payment.unavailable ? payment.error : payment.automaticSlipCheck ? 'เชื่อมต่อระบบตรวจสลิปชุดเดียวกับเว็บหลักแล้ว' : 'เว็บหลักยังไม่ได้ตั้งค่าระบบตรวจสลิป' }; }
const configured = payment => Boolean(payment?.automaticSlipCheck);
module.exports = { configuration, verify, test, configured };
