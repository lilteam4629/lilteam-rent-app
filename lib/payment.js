const path = require('path');
const store = require('./cloud-store');
const easyslip = require('../services/easyslip');
const slipok = require('../services/slipok');
const slipcheck = require('../services/slipcheck');
const rdcw = require('../services/rdcw-slip');
const slip2go = require('../services/slip2go');
const byshop = require('../services/byshop');
const PROVIDERS = new Set(['none','byshop','easyslip','slipok','slipcheck','rdcw','slip2go']);
function expected(p){return {expectedReceiverNames:[p.promptpayName,p.bankAccountName].filter(Boolean),expectedReceiverNumbers:[p.promptpayId,p.bankAccountNumber].filter(Boolean)}}
async function verify(buffer,amount,file={}){const p=store.payment(),common=expected(p);switch(p.slipProvider){
  case 'byshop': return byshop.verifySlip(buffer,amount,file,{apiKey:p.byshopApiKey,endpoint:p.byshopEndpoint,...common});
  case 'easyslip': return easyslip.verifySlip(buffer,amount,file,common.expectedReceiverNumbers,p.easyslipApiKey||undefined);
  case 'slipok': return slipok.verifySlip(buffer,amount,file,{branchId:p.slipokBranchId,apiKey:p.slipokApiKey,...common});
  case 'slipcheck': return slipcheck.verifySlip(buffer,amount,file,{apiKey:p.slipcheckApiKey,endpoint:p.slipcheckEndpoint,...common});
  case 'rdcw': return rdcw.verifySlip(buffer,amount,file,{clientId:p.rdcwClientId,clientSecret:p.rdcwClientSecret,endpoint:p.rdcwEndpoint,...common});
  case 'slip2go': return slip2go.verifySlip(buffer,amount,file,{apiKey:p.slip2goApiKey,endpoint:p.slip2goEndpoint,...common});
  default:return {checked:false,verified:false,message:'รอแอดมินตรวจสอบ'};
}}
async function test(provider,body){if(!PROVIDERS.has(provider))return{ok:false,message:'ผู้ให้บริการไม่ถูกต้อง'};try{
  if(provider==='byshop')return byshop.checkBalance(body.byshopApiKey,body.byshopEndpoint);
  if(provider==='easyslip')return easyslip.getAccountInfo(body.easyslipApiKey);
  if(provider==='slipok')return slipok.testConnection({branchId:body.slipokBranchId,apiKey:body.slipokApiKey});
  if(provider==='slipcheck')return slipcheck.getAccountInfo(body.slipcheckApiKey,body.slipcheckEndpoint);
  if(provider==='rdcw')return rdcw.validateCredentials(body.rdcwClientId,body.rdcwClientSecret);
  if(provider==='slip2go')return slip2go.checkBalance(body.slip2goApiKey,body.slip2goEndpoint);
  return{ok:true,message:'ตรวจสลิปด้วยแอดมิน'};
}catch(e){return{ok:false,message:e.message}}}
module.exports={PROVIDERS,verify,test};
