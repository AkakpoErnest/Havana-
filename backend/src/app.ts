import 'reflect-metadata';
import 'dotenv/config';
import { BadRequestException, Body, Controller, Delete, Get, Module, Param, ParseUUIDPipe, Patch, Post, Query, Req, UploadedFiles, UseGuards, UseInterceptors, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { FilesInterceptor, NestExpressApplication } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Auth, AuthedRequest, Guard, OtpRateGuard, loginMethods } from './auth';
import { Db } from './db';
import { Chat } from './chat';
import { Market } from './market';
import { DAY, HOUR, Limit, MINUTE, UserLimits } from './limits';
import { PhotoStore, encodePhoto } from './photos';
import { Push, isExpoPushToken } from './push';
import { AdminGuard, Moderation } from './admin';
import { ConversationDto, FeedDto, ListingDto, MessagesDto, ProfileDto, PushTokenDto, OfferActionDto, OfferDto, OtpDto, RatingDto, ReportDto, StatusDto, SwapActionDto, SwipeDto, TextDto, VerifyDto } from './dto';
import { ErrorCodes, coded } from './errors';
@Controller()
class HealthController {
  @Get('health') health() { return {ok:true,app:'Havana'}; }
  // Which login types this server can deliver codes for; the app hides the rest.
  @Get('auth/methods') methods() { return loginMethods(); }
}
@Controller('auth')
@UseGuards(OtpRateGuard)
class AuthController {
  constructor(private auth:Auth) {}
  @Post('request') request(@Body() d:OtpDto) { return this.auth.request(d); }
  @Post('verify') verify(@Body() d:VerifyDto) { return this.auth.verify(d); }
  @Post('link/request') @UseGuards(Guard) linkRequest(@Req() r:AuthedRequest,@Body() d:OtpDto) { return this.auth.request(d,r.userId); }
  @Post('link/verify') @UseGuards(Guard) linkVerify(@Req() r:AuthedRequest,@Body() d:VerifyDto) { return this.auth.verify(d,r.userId); }
}
@Controller('admin')
@UseGuards(Guard,AdminGuard)
class AdminController {
  constructor(private moderation:Moderation) {}
  @Get('reports') reports() { return this.moderation.reports(); }
  @Post('items/:id/restore') restore(@Param('id',ParseUUIDPipe) id:string) { return this.moderation.restore(id); }
  @Post('items/:id/remove') remove(@Param('id',ParseUUIDPipe) id:string) { return this.moderation.remove(id); }
}
@Controller()
@UseGuards(Guard,UserLimits)
class ApiController {
  constructor(private market:Market,private chat:Chat,private db:Db,private photos:PhotoStore,private push:Push) {}
  @Get('me') me(@Req() r:AuthedRequest) { return this.market.me(r.userId); }
  @Post('me/push-token') pushToken(@Req() r:AuthedRequest,@Body() d:PushTokenDto) {
    if(!isExpoPushToken(d.token)) throw new BadRequestException(coded('INVALID_PUSH_TOKEN','That is not an Expo push token.'));
    return this.push.register(r.userId,d.token);
  }
  @Delete('me/push-token') removePushToken(@Req() r:AuthedRequest,@Body() d:PushTokenDto) { return this.push.unregister(r.userId,d.token); }
  @Patch('me') profile(@Req() r:AuthedRequest,@Body() d:ProfileDto) { return this.market.profile(r.userId,d); }
  @Get('feed') feed(@Req() r:AuthedRequest,@Query() q:FeedDto) { return this.market.feed(r.userId,q); }
  @Get('saved') saved(@Req() r:AuthedRequest) { return this.market.saved(r.userId); }
  @Delete('saved/:itemId') unsave(@Req() r:AuthedRequest,@Param('itemId',ParseUUIDPipe) itemId:string) { return this.market.unsave(r.userId,itemId); }
  @Limit('listing','new listings',{max:10,seconds:HOUR},{max:30,seconds:DAY}) @Post('items') create(@Req() r:AuthedRequest,@Body() d:ListingDto) { return this.market.create(r.userId,d); }
  @Get('items/:id') item(@Req() r:AuthedRequest,@Param('id',ParseUUIDPipe) id:string) { return this.market.item(id,r.userId); }
  @Patch('items/:id/status') status(@Req() r:AuthedRequest,@Param('id',ParseUUIDPipe) id:string,@Body() d:StatusDto) { return this.market.status(r.userId,id,d.status); }
  @Limit('report','reports',{max:10,seconds:HOUR},{max:30,seconds:DAY}) @Post('items/:id/report') report(@Req() r:AuthedRequest,@Param('id',ParseUUIDPipe) id:string,@Body() d:ReportDto) { return this.market.report(r.userId,id,d.reason); }
  @Limit('swipe','swiping',{max:120,seconds:MINUTE},{max:3000,seconds:DAY}) @Post('swipes') swipe(@Req() r:AuthedRequest,@Body() d:SwipeDto) { return this.market.swipe(r.userId,d); }
  @Get('conversations') inbox(@Req() r:AuthedRequest) { return this.chat.inbox(r.userId); }
  @Limit('conversation','new chats',{max:30,seconds:HOUR},{max:200,seconds:DAY}) @Post('conversations') conversation(@Req() r:AuthedRequest,@Body() d:ConversationDto) { return this.db.atomic(tx=>this.market.shopConversation(tx,r.userId,d.itemId)); }
  @Get('conversations/:id/messages') messages(@Req() r:AuthedRequest,@Param('id',ParseUUIDPipe) id:string,@Query() q:MessagesDto) { return this.chat.messages(id,r.userId,q); }
  @Limit('message','messages',{max:30,seconds:MINUTE},{max:500,seconds:DAY}) @Post('conversations/:id/messages') text(@Req() r:AuthedRequest,@Param('id',ParseUUIDPipe) id:string,@Body() d:TextDto) { return this.chat.text(id,r.userId,d.text); }
  @Limit('offer','offers',{max:15,seconds:MINUTE},{max:150,seconds:DAY}) @Post('conversations/:id/offers') offer(@Req() r:AuthedRequest,@Param('id',ParseUUIDPipe) id:string,@Body() d:OfferDto) { return this.chat.offer(id,r.userId,d.amount); }
  @Limit('offer','offers',{max:15,seconds:MINUTE},{max:150,seconds:DAY}) @Post('conversations/:id/offers/:messageId') respond(@Req() r:AuthedRequest,@Param('id',ParseUUIDPipe) id:string,@Param('messageId',ParseUUIDPipe) messageId:string,@Body() d:OfferActionDto) { return this.chat.respond(id,messageId,r.userId,d.action); }
  @Post('conversations/:id/swap') swap(@Req() r:AuthedRequest,@Param('id',ParseUUIDPipe) id:string,@Body() d:SwapActionDto) { return this.chat.swap(id,r.userId,d.action); }
  @Limit('rating','ratings',{max:20,seconds:HOUR},{max:100,seconds:DAY}) @Post('ratings') rate(@Req() r:AuthedRequest,@Body() d:RatingDto) { return this.market.rate(r.userId,d.toId,d.stars); }
  @Post('uploads')
  @Limit('upload','photo uploads',{max:20,seconds:HOUR},{max:60,seconds:DAY})
  @UseInterceptors(FilesInterceptor('photos',6,{storage:memoryStorage(),limits:{fileSize:5*1024*1024},fileFilter:(_req,file,cb)=>cb(null,['image/jpeg','image/png','image/webp'].includes(file.mimetype))}))
  async upload(@Req() r:AuthedRequest,@UploadedFiles() files:Express.Multer.File[]) {
    if(!files?.length) throw new BadRequestException(coded('NO_PHOTOS','Choose up to six JPEG, PNG, or WebP photos (5 MB each).'));
    const paths:string[]=[];
    for(const file of files) {
      let encoded:Awaited<ReturnType<typeof encodePhoto>>;
      try { encoded=await encodePhoto(file.buffer); }
      catch { throw new BadRequestException(coded('PHOTO_UNREADABLE','One photo could not be read. Please choose a different image.')); }
      const path=await this.photos.save(encoded.full,encoded.thumb);
      await this.db.upload.create({data:{userId:r.userId,path}}); paths.push(path);
    }
    return {photos:paths};
  }
}
@Module({imports:[JwtModule.registerAsync({useFactory:()=>({secret:process.env.JWT_SECRET,signOptions:{expiresIn:'30d'}})})],controllers:[HealthController,AuthController,ApiController,AdminController],providers:[Db,Auth,Guard,OtpRateGuard,Market,Chat,PhotoStore,UserLimits,Push,AdminGuard,Moderation]})
class AppModule {}
export async function createApp() {
  if(!process.env.JWT_SECRET||process.env.JWT_SECRET.length<32) throw new Error('JWT_SECRET must contain at least 32 characters.');
  const webhook=process.env.OTP_WEBHOOK_URL;
  if(webhook&&(!webhook.startsWith('https://')||!process.env.OTP_WEBHOOK_TOKEN)) throw new Error('OTP_WEBHOOK_URL must be HTTPS and needs OTP_WEBHOOK_TOKEN.');
  if(process.env.BREVO_API_KEY&&!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(process.env.OTP_EMAIL_FROM??'')) throw new Error('BREVO_API_KEY is set, so OTP_EMAIL_FROM must be the sender email verified in Brevo.');
  if(process.env.DEV_OTP!=='true'&&!webhook&&!process.env.BREVO_API_KEY) throw new Error('No way to send login codes: set BREVO_API_KEY (email), OTP_WEBHOOK_URL (SMS/email), or DEV_OTP=true for local testing.');
  if(process.env.NODE_ENV==='production'&&process.env.DEV_OTP==='true') {
    // Tester phase before SMS exists: codes are returned by the API, so anyone who knows a number can sign in as it.
    if(process.env.ALLOW_DEV_OTP_IN_PRODUCTION!=='true') throw new Error('DEV_OTP must be disabled in production (or set ALLOW_DEV_OTP_IN_PRODUCTION=true for a closed tester build).');
    console.warn('WARNING: DEV_OTP is on in production. Login codes are returned by the API. Testers only; connect SMS before launch.');
  }
  const r2Vars=['R2_ACCOUNT_ID','R2_ACCESS_KEY_ID','R2_SECRET_ACCESS_KEY','R2_BUCKET','R2_PUBLIC_URL'];
  const missingR2=r2Vars.filter(v=>!process.env[v]);
  if(process.env.R2_ACCESS_KEY_ID&&missingR2.length) throw new Error(`Cloudflare R2 is partly configured. Missing: ${missingR2.join(', ')}.`);
  const app=await NestFactory.create<NestExpressApplication>(AppModule,{logger:process.env.NODE_ENV==='test'?false:['log','warn','error']});
  app.useGlobalFilters(new ErrorCodes());
  app.useGlobalPipes(new ValidationPipe({transform:true,whitelist:true,forbidNonWhitelisted:true}));
  app.enableCors();
  await mkdir(resolve(process.env.UPLOAD_DIR??'uploads'),{recursive:true});
  app.useStaticAssets(resolve(process.env.UPLOAD_DIR??'uploads'),{prefix:'/uploads/',maxAge:'7d',setHeaders:res=>res.setHeader('X-Content-Type-Options','nosniff')});
  app.enableShutdownHooks();
  return app;
}
