const assert = require('assert/strict');
(async () => {
  for (const site of ['https://lilteam.site', 'https://rent.lilteam.site']) {
    const response = await fetch(site + '/health', { signal: AbortSignal.timeout(15000) });
    assert(response.ok, `${site} health`); const status = await response.json();
    assert.equal(status.sharedPaymentGatewayVersion, 1, `${site} updated gateway`);
    console.log(site, 'gateway v1 healthy', status.commit || '');
  }
  const response = await fetch('https://rent.lilteam.site/health/payment', { signal: AbortSignal.timeout(20000) });
  const status = await response.json(); assert(response.ok && status.ok, 'Cloud-to-main payment configuration connection');
  assert(status.slipReady || status.trueMoneyReady, 'At least one configured payment channel');
  console.log('Shared connection:', JSON.stringify(status));
  const denied = await fetch('https://lilteam.site/internal/api/payments/config', { signal: AbortSignal.timeout(15000) });
  assert.equal(denied.status, 403, 'Public visitors cannot read private internal config');
  console.log('PASS live shared payment versions, server connection and internal API isolation; no money consumed');
})().catch(error => { console.error(error.message); process.exitCode = 1; });
