'use strict';
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'rent-wallet-safety-'));
process.env.DATA_DIR=directory;
const inject=(file,exports)=>{const id=require.resolve(file);require.cache[id]={id,filename:id,loaded:true,exports};};
let resolveVerification,verificationStarted;
const started=new Promise(resolve=>verificationStarted=resolve);
inject('../lib/payment',{verify:()=>{verificationStarted();return new Promise(resolve=>resolveVerification=resolve);}});
inject('../lib/mainApi',{claimSlip:async()=>({ok:true})});
const store=require('../lib/cloud-store'),wallet=require('../lib/wallet');
async function run(){
  try {
    await store.transact(data=>{data.users.push({id:'owner',walletBalance:0});});
    const created=await wallet.create('owner',100,'bank_transfer');
    const attach=wallet.attach('owner',created.item.id,{originalname:'receipt.png',mimetype:'image/png',buffer:Buffer.from('fixture')});
    await started;
    assert.equal((await wallet.review(created.item.id,true)).ok,false, 'Unverified requests cannot bypass the cross-site receipt guard');
    resolveVerification({checked:true,verified:true,raw:{transRef:'fixture-unique'}});await attach;
    assert.equal(store.user('owner').walletBalance,100);
    assert.equal(store.data.walletTransactions.filter(t=>t.topupId===created.item.id).length,1);
    const saved=JSON.parse(fs.readFileSync(store.FILE,'utf8'));
    await assert.rejects(store.transact(data=>{data.users[0].walletBalance=999;throw new Error('failed operation');}),/failed operation/);
    assert.equal(store.user('owner').walletBalance,100);
    assert.deepEqual(JSON.parse(fs.readFileSync(store.FILE,'utf8')),saved);
    const rename=fs.renameSync;
    fs.renameSync=(a,b)=>{if(b===store.FILE)throw new Error('disk full');return rename(a,b);};
    try{await assert.rejects(store.transact(data=>data.users[0].walletBalance=999),/disk full/);}finally{fs.renameSync=rename;}
    assert.equal(store.user('owner').walletBalance,100);
    console.log('Wallet safety passed: concurrent admin/provider credits once; failed operations and writes retain balance');
  } finally {fs.rmSync(directory,{recursive:true,force:true});}
}
run().catch(error=>{console.error(error);process.exitCode=1;});
