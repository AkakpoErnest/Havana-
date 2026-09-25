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
