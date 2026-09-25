import 'reflect-metadata';
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { NestExpressApplication } from '@nestjs/platform-express';
import sharp from 'sharp';
import { Db } from '../src/db';
import { createApp } from '../src/app';
import { OtpRateGuard, normalize } from '../src/auth';
import { FULL_MAX_BYTES, thumbOf } from '../src/photos';
import { EXPO_PUSH_URL } from '../src/push';
import { stat } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
process.env.NODE_ENV='test';
process.env.DEV_OTP='true';
process.env.JWT_SECRET='test-secret-with-at-least-32-characters';
let app:NestExpressApplication;
let db:Db;
let http:ReturnType<typeof request>;
type Account={id:string;token:string};
const accounts:Account[]=[];
let itemA:string,itemB:string,shop:string,match:string;
const base={title:'Nice denim jacket',description:'Good condition, ready for a new home.',category:'CLOTHES',condition:'GOOD',sell:true,swap:true,price:100,swapValue:100,area:'Osu',latitude:5.56,longitude:-0.18};
function as(user:Account) { return {Authorization:`Bearer ${user.token}`}; }
async function login(value:string):Promise<Account> {
  const c=await http.post('/auth/request').send({type:'EMAIL',value}).expect(201);
  assert.match(c.body.devCode,/^\d{6}$/);
  const v=await http.post('/auth/verify').send({challengeId:c.body.challengeId,code:c.body.devCode}).expect(201);
  return {id:v.body.user.id,token:v.body.token};
}
async function listing(user:Account,extra:Record<string,unknown>={}) {
  const photo=await sharp({create:{width:8,height:8,channels:3,background:'#FFB020'}}).jpeg().toBuffer();
  const upload=await http.post('/uploads').set(as(user)).attach('photos',photo,'item.jpg').expect(201);
  const result=await http.post('/items').set(as(user)).send({...base,photos:upload.body.photos,...extra}).expect(201);
  return result.body.id as string;
}
before(async()=>{
  if(!process.env.DATABASE_URL?.includes('havana_test')) throw new Error('Tests require a dedicated database URL containing havana_test.');
  // Listen once: otherwise supertest opens and closes a server per request, and parallel requests can reset each other.
  app=await createApp();await app.listen(0,'127.0.0.1');db=app.get(Db);http=request(app.getHttpServer());
  await db.$executeRawUnsafe('TRUNCATE TABLE "users" CASCADE');
  await db.otpChallenge.deleteMany();
});
after(async()=>{await app?.close();});
test('health, normalization, authentication, validation and OTP replay protection',async()=>{
  await http.get('/health').expect(200);
  await http.get('/me').expect(401);
  assert.equal(normalize('PHONE','054 123 4567'),'+233541234567');
  await http.post('/auth/request').send({type:'PHONE',value:'wrong'}).expect(400);
  const c=await http.post('/auth/request').send({type:'PHONE',value:'0541234567'}).expect(201);
  await http.post('/auth/verify').send({challengeId:c.body.challengeId,code:c.body.devCode==='000000'?'111111':'000000'}).expect(401);
  const v=await http.post('/auth/verify').send({challengeId:c.body.challengeId,code:c.body.devCode}).expect(201);
  accounts.push({id:v.body.user.id,token:v.body.token});
  await http.post('/auth/verify').send({challengeId:c.body.challengeId,code:c.body.devCode}).expect(401);
  for(const email of ['b@test.com','c@test.com','d@test.com']) accounts.push(await login(email));
  const me=await http.get('/me').set(as(accounts[0])).expect(200);
  assert.equal(me.body.identities[0].value,'+233541234567');
  await http.patch('/me').set(as(accounts[0])).send({name:'Ama'}).expect(200);
});
test('backup identity proves ownership and signs into the same account',async()=>{
  const a=accounts[0];
  const c=await http.post('/auth/link/request').set(as(a)).send({type:'EMAIL',value:'backup@test.com'}).expect(201);
  await http.post('/auth/verify').send({challengeId:c.body.challengeId,code:c.body.devCode}).expect(401);
  const linked=await http.post('/auth/link/verify').set(as(a)).send({challengeId:c.body.challengeId,code:c.body.devCode}).expect(201);
  assert.equal(linked.body.user.id,a.id);
  const again=await login('backup@test.com');assert.equal(again.id,a.id);
  await http.post('/auth/link/request').set(as(accounts[1])).send({type:'EMAIL',value:'backup@test.com'}).expect(400);
});
test('photo upload, listing ownership, feed filters, saving and mode separation',async()=>{
  const [a,b,c]=accounts;
  await http.post('/items').set(as(a)).send({...base,photos:['/uploads/not-mine.jpg']}).expect(400);
  itemA=await listing(a);itemB=await listing(b,{title:'Kofi jacket'});
  await http.patch(`/items/${itemA}/status`).set(as(b)).send({status:'SOLD'}).expect(403);
  const feed=await http.get('/feed?mode=SHOP&category=CLOTHES').set(as(a)).expect(200);
  assert.equal(feed.body.items.length,1);assert.equal(feed.body.items[0].id,itemB);
  await http.get(`/items/${itemB}`).set(as(a)).expect(200);
  await http.post('/swipes').set(as(c)).send({itemId:itemB,mode:'SWAP',direction:'RIGHT'}).expect(400);
  await http.post('/swipes').set(as(a)).send({itemId:itemB,mode:'SHOP',direction:'RIGHT'}).expect(201);
  assert.equal((await http.get('/saved').set(as(a))).body.length,1);
  assert.equal((await http.get('/feed?mode=SHOP').set(as(a))).body.items.length,0);
  assert.equal((await http.get('/feed?mode=SWAP').set(as(a))).body.items.length,1);
  await http.post('/items').set(as(a)).send({...base,price:1.5,photos:['x']}).expect(400);
});
test('reciprocal concurrent swipes create exactly one match and require two confirmations',async()=>{
  const [a,b,c]=accounts;
  const responses=await Promise.all([http.post('/swipes').set(as(a)).send({itemId:itemB,mode:'SWAP',direction:'RIGHT'}),http.post('/swipes').set(as(b)).send({itemId:itemA,mode:'SWAP',direction:'RIGHT'})]);
  responses.forEach(r=>assert.equal(r.status,201));
  const matches=await db.conversation.findMany({where:{swapItemId:{not:null}}});assert.equal(matches.length,1);match=matches[0].id;
  await http.get(`/conversations/${match}/messages`).set(as(c)).expect(403);
  await http.post(`/conversations/${match}/swap`).set(as(a)).send({action:'DONE'}).expect(400);
  for(const u of [a,b]) await http.post(`/conversations/${match}/swap`).set(as(u)).send({action:'AGREE'}).expect(201);
  await http.post(`/conversations/${match}/swap`).set(as(a)).send({action:'DONE'}).expect(201);
  assert.equal((await db.item.findUniqueOrThrow({where:{id:itemA}})).status,'LIVE');
  await http.post(`/conversations/${match}/swap`).set(as(b)).send({action:'DONE'}).expect(201);
  assert.equal((await db.item.findUniqueOrThrow({where:{id:itemA}})).status,'SWAPPED');
  assert.equal((await db.item.findUniqueOrThrow({where:{id:itemB}})).status,'SWAPPED');
  await http.post(`/conversations/${match}/swap`).set(as(b)).send({action:'DONE'}).expect(201);
});
test('chat, counteroffers, recipient-only acceptance and competing reservations',async()=>{
  const [a,b,c]=accounts;
  const sale=await listing(b,{swap:false});
  shop=(await http.post('/conversations').set(as(a)).send({itemId:sale}).expect(201)).body.id;
  const again=await http.post('/conversations').set(as(a)).send({itemId:sale}).expect(201);assert.equal(again.body.id,shop);
  await http.post(`/conversations/${shop}/messages`).set(as(a)).send({text:'Hi, still available?'}).expect(201);
  await http.post(`/conversations/${shop}/messages`).set(as(b)).send({text:'Yes!'}).expect(201);
  const old=await http.post(`/conversations/${shop}/offers`).set(as(a)).send({amount:70}).expect(201);
  const counter=await http.post(`/conversations/${shop}/offers`).set(as(b)).send({amount:90}).expect(201);
  assert.equal((await db.message.findUniqueOrThrow({where:{id:old.body.id}})).offerStatus,'COUNTERED');
  await http.post(`/conversations/${shop}/offers/${counter.body.id}`).set(as(b)).send({action:'ACCEPT'}).expect(400);
  const second=(await http.post('/conversations').set(as(c)).send({itemId:sale})).body.id;
  const other=await http.post(`/conversations/${second}/offers`).set(as(c)).send({amount:95}).expect(201);
  const results=await Promise.all([http.post(`/conversations/${shop}/offers/${counter.body.id}`).set(as(a)).send({action:'ACCEPT'}),http.post(`/conversations/${second}/offers/${other.body.id}`).set(as(b)).send({action:'ACCEPT'})]);
  assert.deepEqual(results.map(r=>r.status).sort(),[201,400]);
  assert.equal((await db.item.findUniqueOrThrow({where:{id:sale}})).status,'RESERVED');
  await http.get(`/conversations/${shop}/messages`).set(as(a)).expect(200);
  await http.get('/conversations').set(as(a)).expect(200);
  await http.patch(`/items/${sale}/status`).set(as(b)).send({status:'SOLD'}).expect(200);
});
test('ratings need a two-way chat and reports count distinct reporters',async()=>{
  const [a,b,c,d]=accounts;
  await http.post('/ratings').set(as(c)).send({toId:a.id,stars:5}).expect(403);
  await http.post('/ratings').set(as(a)).send({toId:b.id,stars:5}).expect(201);
  await http.post('/ratings').set(as(a)).send({toId:b.id,stars:4}).expect(201);
  const me=await http.get('/me').set(as(b));assert.equal(me.body.rating,4);assert.equal(me.body.ratingCount,1);
  const target=await listing(b);
  for(const u of [a,a,c]) await http.post(`/items/${target}/report`).set(as(u)).send({reason:'Misleading listing details'}).expect(201);
  assert.equal((await db.item.findUniqueOrThrow({where:{id:target}})).hidden,false);
  await http.post(`/items/${target}/report`).set(as(d)).send({reason:'Misleading listing details'}).expect(201);
  await http.get(`/items/${target}`).set(as(a)).expect(404);
});
test('profile location, empty-closet pass, unsave, incremental polling and inbox match flags',async()=>{
  const [,b,c,d]=accounts;
  await http.patch('/me').set(as(d)).send({latitude:5.668}).expect(400);
  const me=await http.patch('/me').set(as(d)).send({area:'Madina',latitude:5.668,longitude:-0.164}).expect(200);
  assert.equal(me.body.area,'Madina');
  const x=await listing(b,{title:'Polling test item'});
  // Saved Madina location is the feed default (Osu item is ~12 km away, central Accra would be ~5 km).
  const feed=await http.get('/feed?mode=SHOP').set(as(d)).expect(200);
  assert.ok(feed.body.items.find((i:{id:string})=>i.id===x).distanceKm>10);
  await http.post('/swipes').set(as(d)).send({itemId:x,mode:'SWAP',direction:'RIGHT'}).expect(400);
  await http.post('/swipes').set(as(d)).send({itemId:x,mode:'SWAP',direction:'LEFT'}).expect(201);
  await http.post('/swipes').set(as(d)).send({itemId:x,mode:'SHOP',direction:'RIGHT'}).expect(201);
  assert.equal((await http.get('/saved').set(as(d))).body.length,1);
  await http.delete(`/saved/${x}`).set(as(d)).expect(200);
  assert.equal((await http.get('/saved').set(as(d))).body.length,0);
  const chat=(await http.post('/conversations').set(as(d)).send({itemId:x}).expect(201)).body.id;
  const backdate=()=>db.$executeRaw`UPDATE "Message" SET "createdAt"=now()-interval '1 minute',"updatedAt"=now()-interval '1 minute' WHERE "conversationId"=${chat}`;
  const poll=async()=>{
    const first=await http.get(`/conversations/${chat}/messages`).set(as(d)).expect(200);
    return async()=>(await http.get(`/conversations/${chat}/messages`).set(as(d)).query({since:first.body.cursor}).expect(200)).body.messages as {id:string;offerStatus:string}[];
  };
  const offer=(await http.post(`/conversations/${chat}/offers`).set(as(d)).send({amount:50}).expect(201)).body.id;
  await backdate();
  let next=await poll();
  assert.equal((await next()).length,0);
  await http.post(`/conversations/${chat}/offers/${offer}`).set(as(b)).send({action:'DECLINE'}).expect(201);
  assert.deepEqual((await next()).map(m=>[m.id,m.offerStatus]),[[offer,'DECLINED']]);
  const second=(await http.post(`/conversations/${chat}/offers`).set(as(d)).send({amount:60}).expect(201)).body.id;
  await backdate(); next=await poll();
  const counter=(await http.post(`/conversations/${chat}/offers`).set(as(b)).send({amount:70}).expect(201)).body.id;
  const changed=await next();
  assert.equal(changed.find(m=>m.id===second)?.offerStatus,'COUNTERED');
  assert.equal(changed.find(m=>m.id===counter)?.offerStatus,'PENDING');
  await http.get(`/conversations/${chat}/messages?since=nope`).set(as(d)).expect(400);
  const y=await listing(c,{title:'Match flag item'});
  await http.post('/swipes').set(as(b)).send({itemId:y,mode:'SWAP',direction:'RIGHT'}).expect(201);
  const matched=await http.post('/swipes').set(as(c)).send({itemId:x,mode:'SWAP',direction:'RIGHT'}).expect(201);
  const matchId=matched.body.match.id;
  type Row={id:string;hasChatted:boolean;isNewMatch:boolean};
  const inbox=async()=>((await http.get('/conversations').set(as(c)).expect(200)).body as Row[]).find(r=>r.id===matchId)!;
  assert.deepEqual(await inbox(),{...await inbox(),hasChatted:false,isNewMatch:true});
  await http.post(`/conversations/${matchId}/messages`).set(as(c)).send({text:'Deal?'}).expect(201);
  assert.equal((await inbox()).isNewMatch,false);
  assert.equal(((await http.get('/conversations').set(as(d))).body as Row[]).find(r=>r.id===chat)!.hasChatted,true);
});
test('uploads become WebP under the size cap with a small preview',async()=>{
  const [a]=accounts;
  // Random noise is the worst case for compression.
  const noisy=await sharp(randomBytes(1600*1600*3),{raw:{width:1600,height:1600,channels:3}}).jpeg({quality:80}).toBuffer();
  assert.ok(noisy.length<5*1024*1024);
  const res=await http.post('/uploads').set(as(a)).attach('photos',noisy,'big.jpg').expect(201);
  const path:string=res.body.photos[0];
  assert.match(path,/^\/uploads\/[0-9a-f-]+\.webp$/);
  const dir=process.env.UPLOAD_DIR??'uploads';
  const full=await stat(resolve(dir,path.replace('/uploads/','')));
  const thumb=await stat(resolve(dir,thumbOf(path).replace('/uploads/','')));
  assert.ok(full.size<=FULL_MAX_BYTES,`full photo is ${full.size} bytes`);
  assert.ok(thumb.size<full.size/3,`preview is ${thumb.size} bytes`);
  await http.get(thumbOf(path)).expect(200).expect('Content-Type',/image\/webp/);
  assert.equal(thumbOf('https://images.unsplash.com/photo-1?w=900'),'https://images.unsplash.com/photo-1?w=900');
});
test('errors carry stable codes and chats remember my rating',async()=>{
  const [a,b,,d]=accounts;
  // The per-IP /auth limit (20/min) is shared by the whole suite; start this test with a fresh window.
  (app.get(OtpRateGuard) as unknown as {buckets:Map<string,unknown>}).buckets.clear();
  const code=(r:{body:{code:string}})=>r.body.code;
  assert.equal(code(await http.post('/auth/request').send({type:'PHONE',value:'12345'}).expect(400)),'INVALID_IDENTIFIER');
  assert.equal(code(await http.post('/auth/request').send({type:'NOPE',value:'x'}).expect(400)),'VALIDATION_ERROR');
  assert.equal(code(await http.get('/me').expect(401)),'UNAUTHORIZED');
  assert.equal(code(await http.get('/no-such-route').set(as(a)).expect(404)),'NOT_FOUND');
  const c=await http.post('/auth/request').send({type:'EMAIL',value:'codes@test.com'}).expect(201);
  const wrong=await http.post('/auth/verify').send({challengeId:c.body.challengeId,code:c.body.devCode==='000000'?'111111':'000000'}).expect(401);
  assert.equal(code(wrong),'OTP_INVALID');assert.match(wrong.body.message,/Incorrect or expired code/);
  assert.equal(code(await http.post('/auth/request').send({type:'EMAIL',value:'codes@test.com'}).expect(429)),'OTP_RATE_LIMITED');
  const fresh=await login('closetless@test.com');
  const target=await listing(b,{title:'Code test item'});
  const empty=await http.post('/swipes').set(as(fresh)).send({itemId:target,mode:'SWAP',direction:'RIGHT'}).expect(400);
  assert.equal(code(empty),'CLOSET_EMPTY');assert.equal(empty.body.message,'List something in your Swap Closet first.');
  await http.patch(`/items/${target}/status`).set(as(b)).send({status:'SOLD'}).expect(200);
  const gone=await http.post('/swipes').set(as(d)).send({itemId:target,mode:'SHOP',direction:'RIGHT'}).expect(400);
  assert.equal(code(gone),'LISTING_UNAVAILABLE');assert.equal(gone.body.message,'This item is unavailable in this mode.');
  assert.equal(code(await http.post('/ratings').set(as(fresh)).send({toId:a.id,stars:5}).expect(403)),'CANNOT_RATE');
  // a and b chatted in the sale test and a rated b 4 stars in the ratings test.
  const chat=(await http.get('/conversations').set(as(a))).body.find((x:{buyerId:string;sellerId:string;swapItemId:string|null})=>x.swapItemId===null&&[x.buyerId,x.sellerId].includes(b.id));
  assert.equal((await http.get(`/conversations/${chat.id}/messages`).set(as(a)).expect(200)).body.conversation.myRating,4);
  assert.equal((await http.get(`/conversations/${chat.id}/messages`).set(as(b)).expect(200)).body.conversation.myRating,null);
});
test('email codes go out through Brevo and phone login is switched off without SMS',async()=>{
  (app.get(OtpRateGuard) as unknown as {buckets:Map<string,unknown>}).buckets.clear();
  const saved={DEV_OTP:process.env.DEV_OTP,BREVO_API_KEY:process.env.BREVO_API_KEY,OTP_EMAIL_FROM:process.env.OTP_EMAIL_FROM};
  const realFetch=globalThis.fetch;
  const sent:{headers:Record<string,string>;body:{to:{email:string}[];subject:string;sender:{email:string};htmlContent:string}}[]=[];
  let brevoStatus=201;
  globalThis.fetch=(async(input:string|URL|Request,init?:RequestInit)=>{
    if(String(input).startsWith('https://api.brevo.com/')) {
      sent.push({headers:init!.headers as Record<string,string>,body:JSON.parse(String(init!.body))});
      return new Response(brevoStatus===201?'{"messageId":"m1"}':'{"message":"Key not found"}',{status:brevoStatus});
    }
    return realFetch(input,init);
  }) as typeof fetch;
  try {
    delete process.env.DEV_OTP; process.env.BREVO_API_KEY='test-brevo-key'; process.env.OTP_EMAIL_FROM='hello@havana.test';
    assert.deepEqual((await http.get('/auth/methods').expect(200)).body,{email:true,phone:false});
    const req=await http.post('/auth/request').send({type:'EMAIL',value:'Brevo.User@Test.com'}).expect(201);
    assert.equal(req.body.devCode,undefined);
    assert.equal(sent.length,1);
    assert.equal(sent[0].headers['api-key'],'test-brevo-key');
    assert.deepEqual(sent[0].body.to,[{email:'brevo.user@test.com'}]);
    assert.equal(sent[0].body.sender.email,'hello@havana.test');
    const emailed=sent[0].body.subject.match(/^(\d{6}) is your Havana code$/)![1];
    assert.ok(sent[0].body.htmlContent.includes(emailed));
    const v=await http.post('/auth/verify').send({challengeId:req.body.challengeId,code:emailed}).expect(201);
    assert.ok(v.body.token);
    const phone=await http.post('/auth/request').send({type:'PHONE',value:'0541112222'}).expect(503);
    assert.equal(phone.body.code,'PHONE_LOGIN_UNAVAILABLE');
    brevoStatus=401;
    const failed=await http.post('/auth/request').send({type:'EMAIL',value:'bounce@test.com'}).expect(503);
    assert.equal(failed.body.code,'OTP_DELIVERY_FAILED');
    // The failed challenge is discarded, so the user can retry straight away instead of waiting a minute.
    brevoStatus=201;
    await http.post('/auth/request').send({type:'EMAIL',value:'bounce@test.com'}).expect(201);
  } finally {
    globalThis.fetch=realFetch;
    for(const [k,v] of Object.entries(saved)) if(v===undefined) delete process.env[k]; else process.env[k]=v;
  }
  assert.deepEqual((await http.get('/auth/methods').expect(200)).body,{email:true,phone:true});
});
test('push notifications reach the other person and per-user limits stop floods',async()=>{
  (app.get(OtpRateGuard) as unknown as {buckets:Map<string,unknown>}).buckets.clear();
  const [x,y]=[await login('push-buyer@test.com'),await login('push-seller@test.com')];
  await http.patch('/me').set(as(x)).send({name:'Abena'}).expect(200);
  await http.patch('/me').set(as(y)).send({name:'Kojo'}).expect(200);
  const item=await listing(y,{title:'Push test radio',swap:false});
  const chat=(await http.post('/conversations').set(as(x)).send({itemId:item}).expect(201)).body.id;
  assert.equal((await http.post('/me/push-token').set(as(y)).send({token:'not-a-token-at-all'}).expect(400)).body.code,'INVALID_PUSH_TOKEN');
  await http.post('/me/push-token').set(as(y)).send({token:'ExponentPushToken[seller-phone]'}).expect(201);
  await http.post('/me/push-token').set(as(x)).send({token:'ExponentPushToken[buyer-phone]'}).expect(201);
  const realFetch=globalThis.fetch;
  const pushes:{to:string;title:string;body:string;data:{conversationId:string;kind:string}}[]=[];
  let ticket:object={status:'ok'};
  globalThis.fetch=(async(input:string|URL|Request,init?:RequestInit)=>{
    if(String(input)===EXPO_PUSH_URL) { const msgs=JSON.parse(String(init!.body)); pushes.push(...msgs); return new Response(JSON.stringify({data:msgs.map(()=>ticket)}),{status:200}); }
    return realFetch(input,init);
  }) as typeof fetch;
  const until=async(check:()=>boolean)=>{ for(let i=0;i<100;i++){ if(check()) return; await new Promise(r=>setTimeout(r,20)); } throw new Error('push not sent'); };
  try {
    await http.post(`/conversations/${chat}/messages`).set(as(x)).send({text:'Hi, is the radio still available?'}).expect(201);
    await until(()=>pushes.length===1);
    assert.deepEqual(pushes[0],{...pushes[0],to:'ExponentPushToken[seller-phone]',title:'Abena',body:'Hi, is the radio still available?',data:{conversationId:chat,kind:'message'}});
    const offer=(await http.post(`/conversations/${chat}/offers`).set(as(x)).send({amount:80}).expect(201)).body.id;
    await until(()=>pushes.length===2);
    assert.equal(pushes[1].title,'New offer on Push test radio');assert.match(pushes[1].body,/Abena offered GH₵80/);
    await http.post(`/conversations/${chat}/offers/${offer}`).set(as(y)).send({action:'DECLINE'}).expect(201);
    await until(()=>pushes.length===3);
    assert.equal(pushes[2].to,'ExponentPushToken[buyer-phone]');assert.equal(pushes[2].data.kind,'offer_declined');
    // An uninstalled app is forgotten after Expo reports it.
    ticket={status:'error',details:{error:'DeviceNotRegistered'}};
    await http.post(`/conversations/${chat}/messages`).set(as(x)).send({text:'Hello?'}).expect(201);
    await until(()=>pushes.length===4);
    for(let i=0;i<100&&await db.pushToken.count({where:{token:'ExponentPushToken[seller-phone]'}});i++) await new Promise(r=>setTimeout(r,20));
    assert.equal(await db.pushToken.count({where:{token:'ExponentPushToken[seller-phone]'}}),0);
    // 30 messages a minute is plenty; the 31st is refused. Start early in a minute so the window can't roll over mid-test.
    while(new Date().getSeconds()>40) await new Promise(r=>setTimeout(r,500));
    const window=Math.floor(Date.now()/60000)*60;
    const already=(await db.rateBucket.findUnique({where:{key:`${x.id}:message:60:${window}`}}))?.count??0;
    let status=0,sentNow=already,body:{code?:string;message?:string}={};
    while(sentNow<40) { const res=await http.post(`/conversations/${chat}/messages`).set(as(x)).send({text:`spam ${sentNow}`}); sentNow++; status=res.status; body=res.body; if(status===429) break; }
    assert.equal(status,429);assert.equal(sentNow,31,'the 31st message this minute is the first refused');assert.equal(body.code,'RATE_LIMITED');assert.match(body.message!,/a little fast with messages/);
  } finally { globalThis.fetch=realFetch; }
});
test('moderators review reports and can restore or remove items',async()=>{
  (app.get(OtpRateGuard) as unknown as {buckets:Map<string,unknown>}).buckets.clear();
  const [a,b,c,d]=accounts;
  const saved={ADMIN_EMAILS:process.env.ADMIN_EMAILS,DEV_OTP:process.env.DEV_OTP,BREVO_API_KEY:process.env.BREVO_API_KEY,OTP_EMAIL_FROM:process.env.OTP_EMAIL_FROM};
  const realFetch=globalThis.fetch;
  const emailed:string[]=[];
  // Login where the code is really delivered (stubbed Brevo) instead of returned to the requester.
  const emailLogin=async(email:string):Promise<Account>=>{
    process.env.BREVO_API_KEY='test-brevo-key';process.env.OTP_EMAIL_FROM='hello@havana.test';
    globalThis.fetch=(async(input:string|URL|Request,init?:RequestInit)=>{
      if(String(input).startsWith('https://api.brevo.com/')) { emailed.push(JSON.parse(String(init!.body)).subject.slice(0,6)); return new Response('{}',{status:201}); }
      return realFetch(input,init);
    }) as typeof fetch;
    try {
      const c=await http.post('/auth/request').send({type:'EMAIL',value:email}).expect(201);
      assert.equal(c.body.devCode,undefined);
      const v=await http.post('/auth/verify').send({challengeId:c.body.challengeId,code:emailed.at(-1)}).expect(201);
      return {id:v.body.user.id,token:v.body.token};
    } finally { globalThis.fetch=realFetch; delete process.env.BREVO_API_KEY; delete process.env.OTP_EMAIL_FROM; }
  };
  process.env.ADMIN_EMAILS=' someone@else.com , Mod@Test.com ';
  try {
    // SEC-001: a dev-mode code (returned to whoever asked) must never grant moderator powers, even for a listed email.
    const impostor=await login('mod@test.com');
    assert.equal((await http.get('/me').set(as(impostor)).expect(200)).body.isAdmin,false);
    assert.equal((await http.get('/admin/reports').set(as(impostor)).expect(403)).body.code,'ADMIN_NEEDS_VERIFIED_LOGIN');
    // The real owner signs in with an emailed code: same account, now trusted.
    const mod=await emailLogin('mod@test.com');
    assert.equal(mod.id,impostor.id);
    assert.equal((await http.get('/me').set(as(mod)).expect(200)).body.isAdmin,true);
    // A trusted login alone isn't enough: the email must be listed.
    const regular=await emailLogin('regular@test.com');
    assert.equal((await http.get('/me').set(as(regular)).expect(200)).body.isAdmin,false);
    assert.equal((await http.get('/admin/reports').set(as(regular)).expect(403)).body.code,'NOT_ADMIN');
    assert.equal((await http.get('/admin/reports').set(as(a)).expect(403)).body.code,'ADMIN_NEEDS_VERIFIED_LOGIN');
    // Linking a backup login keeps the session's trust (an untrusted session stays untrusted).
    const untrusted=await login('untrusted-mod@test.com');
    const link=await http.post('/auth/link/request').set(as(untrusted)).send({type:'PHONE',value:'0551239876'}).expect(201);
    const linked=await http.post('/auth/link/verify').set(as(untrusted)).send({challengeId:link.body.challengeId,code:link.body.devCode}).expect(201);
    process.env.ADMIN_EMAILS+=',untrusted-mod@test.com';
    assert.equal((await http.get('/me').set('Authorization',`Bearer ${linked.body.token}`).expect(200)).body.isAdmin,false);
    const item=await listing(b,{title:'Moderation test lamp'});
    for(const u of [a,c,d]) await http.post(`/items/${item}/report`).set(as(u)).send({reason:`Looks fake (${u.id.slice(0,4)})`}).expect(201);
    await http.get(`/items/${item}`).set(as(a)).expect(404);
    const queue=(await http.get('/admin/reports').set(as(mod)).expect(200)).body as {id:string;reportCount:number;hidden:boolean;reports:{reason:string}[];owner:{id:string}}[];
    const entry=queue.find(q=>q.id===item)!;
    assert.equal(entry.reportCount,3);assert.equal(entry.hidden,true);assert.equal(entry.owner.id,b.id);assert.match(entry.reports[0].reason,/Looks fake/);
    await http.post(`/admin/items/${item}/restore`).set(as(mod)).expect(201);
    await http.get(`/items/${item}`).set(as(a)).expect(200);
    assert.equal(((await http.get('/admin/reports').set(as(mod))).body as {id:string}[]).some(q=>q.id===item),false);
    await http.post(`/items/${item}/report`).set(as(a)).send({reason:'Still suspicious'}).expect(201);
    await http.post(`/admin/items/${item}/remove`).set(as(mod)).expect(201);
    await http.get(`/items/${item}`).set(as(a)).expect(404);
    assert.equal((await db.item.findUniqueOrThrow({where:{id:item}})).status,'REMOVED');
    await http.post('/admin/items/00000000-0000-4000-8000-999999999999/remove').set(as(mod)).expect(404);
  } finally {
    globalThis.fetch=realFetch;
    for(const [k,v] of Object.entries(saved)) if(v===undefined) delete process.env[k]; else process.env[k]=v;
  }
});
test('a phone can drop its push token without a session (expired or offline logout)',async()=>{
  const [a]=accounts;
  await http.post('/me/push-token').set(as(a)).send({token:'ExponentPushToken[expired-session-phone]'}).expect(201);
  assert.equal(await db.pushToken.count({where:{token:'ExponentPushToken[expired-session-phone]'}}),1);
  await http.post('/push-token/unregister').send({token:'ExponentPushToken[expired-session-phone]'}).expect(201);
  assert.equal(await db.pushToken.count({where:{token:'ExponentPushToken[expired-session-phone]'}}),0);
  await http.post('/push-token/unregister').send({token:'ExponentPushToken[unknown]'}).expect(201);
});
test('deleting an account removes personal data, ends sessions and keeps the other side of chats readable',async()=>{
  (app.get(OtpRateGuard) as unknown as {buckets:Map<string,unknown>}).buckets.clear();
  const [,b]=accounts;
  const leaver=await login('leaving@test.com');
  await http.patch('/me').set(as(leaver)).send({name:'Esi Leaves',area:'Osu',latitude:5.55,longitude:-0.18}).expect(200);
  const upload=await http.post('/uploads').set(as(leaver)).attach('photos',await sharp({create:{width:8,height:8,channels:3,background:'#23206B'}}).jpeg().toBuffer(),'x.jpg').expect(201);
  const photo:string=upload.body.photos[0];
  const item=(await http.post('/items').set(as(leaver)).send({...base,title:'Leaving soon chair',photos:[photo]}).expect(201)).body.id;
  const target=await listing(b,{title:'Chat target',swap:false});
  const chat=(await http.post('/conversations').set(as(leaver)).send({itemId:target}).expect(201)).body.id;
  await http.post(`/conversations/${chat}/messages`).set(as(leaver)).send({text:'My number is 0240000000, call me'}).expect(201);
  await http.post('/me/push-token').set(as(leaver)).send({token:'ExponentPushToken[leaver-phone]'}).expect(201);
  const dir=process.env.UPLOAD_DIR??'uploads';
  await stat(resolve(dir,photo.replace('/uploads/','')));
  assert.equal((await http.delete('/me').set(as(leaver)).send({}).expect(400)).body.code,'VALIDATION_ERROR');
  assert.deepEqual((await http.delete('/me').set(as(leaver)).send({confirm:'DELETE'}).expect(200)).body,{deleted:true});
  // Every existing session ends immediately.
  assert.equal((await http.get('/me').set(as(leaver)).expect(401)).body.code,'ACCOUNT_DELETED');
  // Photos are gone from storage; the listing is down.
  await assert.rejects(stat(resolve(dir,photo.replace('/uploads/',''))));
  await assert.rejects(stat(resolve(dir,thumbOf(photo).replace('/uploads/',''))));
  await http.get(`/items/${item}`).set(as(b)).expect(404);
  assert.equal(await db.pushToken.count({where:{token:'ExponentPushToken[leaver-phone]'}}),0);
  const gone=await db.user.findUniqueOrThrow({where:{id:leaver.id}});
  assert.deepEqual([gone.name,gone.area,gone.latitude],['Deleted user',null,null]);
  // The other person's thread still loads, without the leaver's words or name.
  const thread=(await http.get(`/conversations/${chat}/messages`).set(as(b)).expect(200)).body;
  assert.equal(thread.conversation.buyer.name,'Deleted user');
  assert.ok(thread.messages.some((m:{text:string})=>m.text==='Message deleted'));
  assert.ok(!JSON.stringify(thread).includes('0240000000'));
  // The email is free again: signing up creates a brand-new account.
  const again=await login('leaving@test.com');
  assert.notEqual(again.id,leaver.id);
  const page=await http.get('/account-deletion').expect(200).expect('Content-Type',/text\/html/);
  assert.match(page.text,/Delete your account/);
});
