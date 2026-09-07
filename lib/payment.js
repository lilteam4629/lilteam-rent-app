const path = require('path');
const store = require('./cloud-store');
const easyslip = require('../services/easyslip');
const PROVIDERS = new Set(['easyslip']);
function expected(p){return {expectedReceiverNames:[p.promptpayName,p.bankAccountName].filter(Boolean),expectedReceiverNumbers:[p.promptpayId,p.bankAccountNumber].filter(Boolean)}}
async function verify(buffer,amount,file={}){const p=store.payment(),common=expected(p);switch(p.slipProvider){
  case 'easyslip': return easyslip.verifySlip(buffer,amount,file,common.expectedReceiverNumbers,p.easyslipApiKey||undefined);
  default:return {checked:false,verified:false,message:'รอแอดมินตรวจสอบ'};
}}
async function test(provider,body){provider=String(Array.isArray(provider)?provider.at(-1):provider||'').trim().toLowerCase();if(!PROVIDERS.has(provider))return{ok:false,message:'ผู้ให้บริการไม่ถูกต้อง'};try{
  if(provider==='easyslip')return easyslip.getAccountInfo(body.easyslipApiKey);
  return{ok:false,message:'รองรับ EasySlip เท่านั้น'};
}catch(e){return{ok:false,message:e.message}}}
module.exports={PROVIDERS,verify,test};
