// Thin wrapper around the main app's internal API. This is the ONLY way
// this app ever touches real data — no MongoDB connection lives here at
// all. Every call attaches the shared secret; the main app rejects
// anything without it (see src/routes/internal-api.js on the main app).
const axios = require('axios');

const BASE_URL = (process.env.MAIN_API_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const SECRET = process.env.INTERNAL_API_SECRET || '';

const client = axios.create({
  baseURL: `${BASE_URL}/internal/api`,
  timeout: 20000,
  headers: { 'X-Internal-Secret': SECRET },
  validateStatus: () => true, // we handle non-2xx ourselves, never throw
});

async function request(config) {
  try {
    const res = await client.request(config);
    return { status: res.status, ok: res.status >= 200 && res.status < 300, body: res.data };
  } catch (err) {
    // Network failure / main app unreachable — never let this crash a
    // request to the rent-app itself.
    return { status: 0, ok: false, body: { error: 'ไม่สามารถเชื่อมต่อระบบหลักได้ กรุณาลองใหม่อีกครั้ง' } };
  }
}

module.exports = {
  login: (username, password) => request({ method: 'post', url: '/auth/login', data: { username, password } }),
  register: (username, email, password, recaptchaResponse) =>
    request({ method: 'post', url: '/auth/register', data: { username, email, password, recaptchaResponse } }),
  me: (userId) => request({ method: 'get', url: '/me', params: { userId } }),
  config: () => request({ method: 'get', url: '/config' }),
  plans: () => request({ method: 'get', url: '/plans' }),
  createShop: (payload) => request({ method: 'post', url: '/shops', data: payload }),
  myShops: (userId) => request({ method: 'get', url: '/shops', params: { userId } }),
  renewShop: (shopId, payload) => request({ method: 'post', url: `/shops/${shopId}/renew`, data: payload }),
  walletTopups: (userId) => request({ method: 'get', url: '/wallet/topups', params: { userId } }),
  // Multipart form — data must be a FormData instance (see routes using this).
  topup: (formData) => request({
    method: 'post', url: '/wallet/topup', data: formData,
    headers: formData.getHeaders ? formData.getHeaders() : undefined,
  }),
};
