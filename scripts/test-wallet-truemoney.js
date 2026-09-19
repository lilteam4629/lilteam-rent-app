const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tempData = fs.mkdtempSync(path.join(os.tmpdir(), 'rent-app-wallet-'));
process.env.DATA_DIR = tempData;

(async () => {
  const store = require('../lib/cloud-store');
  const truemoney = require('../services/truemoney');
  const wallet = require('../lib/wallet');
  store.data.users = [{ id: 'user-a', username: 'tester', status: 'active', walletBalance: 0 }];
  store.data.payment.truemoneyEnabled = true;
  store.data.payment.truemoneyPhone = '0801234567';
  store.save();

  let providerCalls = 0;
  truemoney.redeemAngpao = async () => {
    providerCalls += 1;
    return { success: true, amount: 25, senderName: 'ผู้ทดสอบ', code: 'SUCCESS' };
  };
  const link = 'https://gift.truemoney.com/campaign/?v=idempotent-test';
  const first = await wallet.redeem('user-a', link);
  const second = await wallet.redeem('user-a', link);
  assert.strictEqual(first.ok, true);
  assert.strictEqual(second.ok, true);
  assert.strictEqual(providerCalls, 1, 'a retried link must not call TrueMoney twice');
  assert.strictEqual(store.data.users[0].walletBalance, 25);
  assert.strictEqual(store.data.walletTransactions.filter(item => item.voucherCode === 'idempotent-test').length, 1);
  assert.strictEqual(store.data.topups.filter(item => item.voucherCode === 'idempotent-test').length, 1);
  store.data.truemoneyRedemptions.push({ id: 'claim-ready', voucherCode: 'recovery-test', userId: 'user-a', status: 'ready', amount: 12, senderName: 'ผู้ทดสอบ' });
  store.save();
  truemoney.redeemAngpao = async () => { throw new Error('provider must not be called for a journaled claim'); };
  const recovered = await wallet.redeem('user-a', 'https://gift.truemoney.com/campaign/?v=recovery-test');
  assert.strictEqual(recovered.ok, true);
  assert.strictEqual(recovered.recovered, true);
  assert.strictEqual(store.data.users[0].walletBalance, 37);
  assert.strictEqual(store.data.walletTransactions.filter(item => item.voucherCode === 'recovery-test').length, 1);
  console.log('TrueMoney wallet checks passed: durable claim and idempotent credit');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => {
  try { fs.rmSync(tempData, { recursive: true, force: true }); } catch (_) {}
});
