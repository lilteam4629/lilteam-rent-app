// Thin wrapper around the main app's internal API. This is the ONLY way
// this app ever touches real data — no MongoDB connection lives here at
// all. Every call attaches the shared secret; the main app rejects
// anything without it (see src/routes/internal-api.js on the main app).
const axios = require('axios');

const BASE_URL = (process.env.MAIN_API_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const FALLBACK_BASE_URL = (process.env.MAIN_SITE_URL || 'https://lilteam.site').replace(/\/$/, '');
const SECRET = process.env.INTERNAL_API_SECRET || '';

function createClient(baseUrl, timeout) {
  return axios.create({
  baseURL: `${baseUrl}/internal/api`,
  timeout: timeout || 8000,
  headers: { 'X-Internal-Secret': SECRET },
  validateStatus: () => true, // we handle non-2xx ourselves, never throw
  });
}

const client = createClient(BASE_URL, 7000);
const fallbackClient = FALLBACK_BASE_URL !== BASE_URL ? createClient(FALLBACK_BASE_URL, 8000) : null;
let plansCache = null;
let plansRequest = null;

async function request(config) {
  try {
    let res = await client.request(config);
    if (fallbackClient && [502, 503, 504].includes(res.status)) res = await fallbackClient.request(config);
    return { status: res.status, ok: res.status >= 200 && res.status < 300, body: res.data };
  } catch (err) {
    if (fallbackClient) {
      try {
        const res = await fallbackClient.request(config);
        return { status: res.status, ok: res.status >= 200 && res.status < 300, body: res.data };
      } catch (_) {}
    }
    return { status: 0, ok: false, body: { error: 'ไม่สามารถเชื่อมต่อระบบหลักได้ กรุณาลองใหม่อีกครั้ง' } };
  }
}

async function cachedPlans() {
  if (plansCache && plansCache.expiresAt > Date.now()) return plansCache.value;
  if (plansRequest) return plansRequest;
  plansRequest = request({ method: 'get', url: '/plans' })
    .then(result => {
      if (result.ok) plansCache = { value: result, expiresAt: Date.now() + 15000 };
      return result;
    })
    .finally(() => { plansRequest = null; });
  return plansRequest;
}

function clearPlansCache() { plansCache = null; }

module.exports = {
  platformAdmin: (username) => request({ method: 'post', url: '/auth/platform-admin', data: { username } }),
  legacyEligibility: (userId) => request({ method: 'get', url: '/legacy-cloud-eligibility', params: { userId } }),
  legacyTruemoneyConfig: () => request({ method: 'get', url: '/legacy-truemoney-config' }),
  legacyPaymentConfig: () => request({ method: 'get', url: '/legacy-payment-config' }),
  rentalOverview: () => request({ method: 'get', url: '/admin/rentals' }),
  deleteShop: (id, confirmName) => request({ method: 'post', url: '/admin/rentals/' + encodeURIComponent(id) + '/delete', data: { confirmName } }),
  discordSettings: (data) => request({ method: 'post', url: '/admin/discord/settings', data }),
  discordPanel: () => request({ method: 'post', url: '/admin/discord/post-ticket-panel' }),
  paymentInfo: () => request({ method: 'get', url: '/payment-info' }),
  directUpload: (filename, contentType) => request({ method: 'post', url: '/media/direct-upload', data: { filename, contentType } }),
  claimSlip: (transRef, requestId) => request({ method: 'post', url: '/slips/claim', data: { transRef, requestId, source: 'shop-cloud' } }),
  redeemTruemoney: (userId, voucherLink) => request({ method: 'post', url: '/wallet/truemoney', data: { userId, voucherLink } }),
  topupDetail: (id, userId) => request({ method: 'get', url: `/wallet/topups/${encodeURIComponent(id)}`, params: { userId } }),
  attachTopupSlip: (id, formData) => request({ method: 'post', url: `/wallet/topups/${encodeURIComponent(id)}/slip`, data: formData, headers: formData.getHeaders() }),
  topupSlipStream: (id, userId) => client.request({ method: 'get', url: `/wallet/topups/${encodeURIComponent(id)}/slip`, params: { userId }, responseType: 'stream' }),
  sales: (userId) => request({ method: 'get', url: '/sales', params: { userId } }),
  sale: (id, userId) => request({ method: 'get', url: '/sales/' + encodeURIComponent(id), params: { userId } }),
  syncSale: (id, userId, railwayToken) => request({ method: 'post', url: '/sales/' + encodeURIComponent(id) + '/sync', data: { userId, railwayToken } }),
  login: (username, password) => request({ method: 'post', url: '/auth/login', data: { username, password } }),
  register: (username, email, password, recaptchaResponse) =>
    request({ method: 'post', url: '/auth/register', data: { username, email, password, recaptchaResponse } }),
  me: (userId) => request({ method: 'get', url: '/me', params: { userId } }),
  config: () => request({ method: 'get', url: '/config' }),
  plans: cachedPlans,
  createShop: (payload) => request({ method: 'post', url: '/shops', data: payload }),
  myShops: (cloudUserId) => request({ method: 'get', url: '/shops', params: { cloudUserId } }),
  renewShop: (shopId, payload) => request({ method: 'post', url: `/shops/${shopId}/renew`, data: payload }),
  walletTopups: (userId) => request({ method: 'get', url: '/wallet/topups', params: { userId } }),
  // Multipart form — data must be a FormData instance (see routes using this).
  topup: (formData) => request({
    method: 'post', url: '/wallet/topup', data: formData,
    headers: formData.getHeaders ? formData.getHeaders() : undefined,
  }),

  // ---------- Admin (rent-app's own /admin, gated by ADMIN_USERNAME/PASSWORD) ----------
  adminListPlans: () => request({ method: 'get', url: '/admin/license-plans' }),
  adminCreatePlan: async (payload) => { const result = await request({ method: 'post', url: '/admin/license-plans', data: payload }); clearPlansCache(); return result; },
  adminEditPlan: async (id, payload) => { const result = await request({ method: 'post', url: `/admin/license-plans/${id}`, data: payload }); clearPlansCache(); return result; },
  adminTogglePlan: async (id) => { const result = await request({ method: 'post', url: `/admin/license-plans/${id}/toggle` }); clearPlansCache(); return result; },
  adminDeletePlan: async (id) => { const result = await request({ method: 'post', url: `/admin/license-plans/${id}/delete` }); clearPlansCache(); return result; },
  adminListTopups: (params) => request({ method: 'get', url: '/admin/topups', params }),
  adminApproveTopup: (id) => request({ method: 'post', url: `/admin/topups/${id}/approve` }),
  adminRejectTopup: (id, reviewNote) => request({ method: 'post', url: `/admin/topups/${id}/reject`, data: { reviewNote } }),
  adminListUsers: (params) => request({ method: 'get', url: '/admin/users', params }),
  // Streams raw bytes — bypasses the request()/axios-json helper above since
  // the admin page needs to pipe this straight through as an image response.
  adminSlipStream: (id) => client.request({ method: 'get', url: `/admin/topups/${id}/slip`, responseType: 'stream' }),
};
