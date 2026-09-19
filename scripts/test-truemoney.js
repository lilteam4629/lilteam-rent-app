const http = require('http');
const assert = require('assert');

function serverFor(handler) {
  const server = http.createServer(handler);
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

function urlFor(server) {
  return `http://127.0.0.1:${server.address().port}`;
}

(async () => {
  let calls = 0;
  const unavailable = await serverFor((req, res) => {
    calls += 1;
    res.writeHead(503, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ status: { code: 'SERVICE_UNAVAILABLE', message: 'test outage' }, data: null }));
  });
  const healthy = await serverFor((req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ success: true, status: 200, message: 'รับเงินสำเร็จ', data: { amount: '12.50', name: 'ผู้ทดสอบ' } }));
  });
  process.env.TRUEMONEY_API_PROVIDERS = `${urlFor(unavailable)},${urlFor(healthy)}`;
  const service = require('../services/truemoney');
  assert.strictEqual(service.extractVoucherCode('https://gift.truemoney.com/campaign/?v=abc_123'), 'abc_123');
  assert.strictEqual(service.normalizePhone('+66 80-123-4567'), '0801234567');
  const result = await service.redeemAngpao('https://gift.truemoney.com/campaign/?v=abc_123', '0801234567');
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.amount, 12.5);
  assert.strictEqual(result.senderName, 'ผู้ทดสอบ');
  assert.strictEqual(calls, 1, 'the first provider should be tried before the fallback');
  unavailable.close();
  healthy.close();
  console.log('TrueMoney provider checks passed: legacy response parsing and outage failover');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
