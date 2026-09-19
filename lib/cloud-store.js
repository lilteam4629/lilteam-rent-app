const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const settings = require('./settings');
const FILE = path.join(settings.DATA_DIR, 'cloud-data.json');
const defaults = () => ({ users: [], walletTransactions: [], topups: [], usedSlipRefs: [], truemoneyRedemptions: [], payment: {
  slipProvider: 'easyslip', easyslipApiKey: '', slipokBranchId: '', slipokApiKey: '', slipcheckApiKey: '', slipcheckEndpoint: '', rdcwClientId: '', rdcwClientSecret: '', rdcwEndpoint: '', slip2goApiKey: '', slip2goEndpoint: '',
  promptpayId: '', promptpayName: '', promptpayQrImage: '', bankName: '', bankAccountNumber: '', bankAccountName: '', bankQrImage: '',
  truemoneyEnabled: false, truemoneyPhone: ''
} });
function load() {
  try {
    const saved = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    const base = defaults();
    return {
      ...base,
      ...saved,
      users: Array.isArray(saved.users) ? saved.users : base.users,
      walletTransactions: Array.isArray(saved.walletTransactions) ? saved.walletTransactions : base.walletTransactions,
      topups: Array.isArray(saved.topups) ? saved.topups : base.topups,
      usedSlipRefs: Array.isArray(saved.usedSlipRefs) ? saved.usedSlipRefs : base.usedSlipRefs,
      truemoneyRedemptions: Array.isArray(saved.truemoneyRedemptions) ? saved.truemoneyRedemptions : base.truemoneyRedemptions,
      payment: { ...base.payment, ...(saved.payment || {}) },
    };
  } catch { return defaults(); }
}
let data = load(), chain = Promise.resolve();
function save() { const temp=FILE+'.tmp'; fs.writeFileSync(temp,JSON.stringify(data,null,2),{mode:0o600}); fs.renameSync(temp,FILE); }
function transact(fn) { const run=async()=>{const out=await fn(data);save();return out}; const task=chain.then(run,run);chain=task.catch(()=>{});return task; }
function id(bytes=8){return crypto.randomBytes(bytes).toString('hex')}
function user(id){return data.users.find(u=>u.id===id&&u.status!=='banned')||null}
function publicUser(u){return u&&{id:u.id,username:u.username,email:u.email,walletBalance:Number(u.walletBalance)||0,status:u.status,createdAt:u.createdAt,migratedFromMain:Boolean(u.migratedFromMain)}}
function payment(){data.payment={...defaults().payment,...data.payment};return data.payment}
module.exports={get data(){return data},transact,id,user,publicUser,payment,save,FILE};
