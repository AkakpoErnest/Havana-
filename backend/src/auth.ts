import { BadRequestException, CanActivate, ExecutionContext, HttpException, Injectable, UnauthorizedException, ServiceUnavailableException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { isEmail } from 'class-validator';
import { Request } from 'express';
import { Db } from './db';
import { OtpDto, VerifyDto } from './dto';
import { coded } from './errors';
export type AuthedRequest = Request & { userId: string };
type OtpChannel='brevo'|'webhook'|'dev';
/** How a login type gets its code: Brevo email, the SMS/email webhook, dev mode (code logged + returned), or null = not offered yet. */
export function otpChannel(type:'EMAIL'|'PHONE'):OtpChannel|null {
  if(type==='EMAIL'&&process.env.BREVO_API_KEY) return 'brevo';
  if(process.env.OTP_WEBHOOK_URL) return 'webhook';
  if(process.env.DEV_OTP==='true') return 'dev';
  return null;
}
export const loginMethods=()=>({email:otpChannel('EMAIL')!==null,phone:otpChannel('PHONE')!==null});
async function sendEmailCode(to:string,code:string) {
  const text=`Your Havana code is ${code}. It expires in 5 minutes.\n\nIf you didn't try to sign in to Havana, you can ignore this email.`;
  const html=`<div style="font-family:Arial,sans-serif;max-width:420px;margin:auto;padding:24px;color:#16152E">
<div style="font-size:30px;font-weight:bold;color:#23206B">havana<span style="color:#F0437B">.</span></div>
<p style="font-size:16px">Here's your code to sign in:</p>
<div style="font-size:36px;font-weight:bold;letter-spacing:8px;background:#FFB020;color:#16152E;display:inline-block;padding:12px 20px;border-radius:12px">${code}</div>
<p style="color:#6B6A86;font-size:14px">It expires in 5 minutes. If you didn't try to sign in to Havana, you can ignore this email.</p>
<p style="color:#1FA774;font-size:13px">Good deals, safe meetups: meet in public and check the item before paying.</p></div>`;
  const response=await fetch('https://api.brevo.com/v3/smtp/email',{method:'POST',headers:{'api-key':process.env.BREVO_API_KEY!,'Content-Type':'application/json',Accept:'application/json'},
    body:JSON.stringify({sender:{name:'Havana',email:process.env.OTP_EMAIL_FROM},to:[{email:to}],subject:`${code} is your Havana code`,textContent:text,htmlContent:html}),signal:AbortSignal.timeout(10000)});
  if(!response.ok) throw new Error(`Brevo responded ${response.status}: ${(await response.text()).slice(0,200)}`);
}
export function normalize(type: 'EMAIL'|'PHONE', raw: string) {
  const value=raw.trim().toLowerCase();
  if (type==='EMAIL') {
    if(!isEmail(value)) throw new BadRequestException(coded('INVALID_IDENTIFIER','Enter a valid email address.'));
    return value;
  }
  let phone=value.replace(/[\s()-]/g,'');
  if(/^0\d{9}$/.test(phone)) phone='+233'+phone.slice(1);
  if(/^233\d{9}$/.test(phone)) phone='+'+phone;
  if(!/^\+233[235]\d{8}$/.test(phone)) throw new BadRequestException(coded('INVALID_IDENTIFIER','Use a Ghana number, for example 0541234567.'));
  return phone;
}
@Injectable()
export class Auth {
  constructor(private db: Db, private jwt: JwtService) {}
  private hash(value:string,code:string) { return createHmac('sha256',process.env.JWT_SECRET!).update(value+':'+code).digest('hex'); }
  async request(dto:OtpDto, linkUserId?:string) {
    const value=normalize(dto.type,dto.value);
    if(linkUserId) {
      const [identity, existing]=await Promise.all([this.db.authIdentity.findUnique({where:{value}}),this.db.authIdentity.findUnique({where:{userId_type:{userId:linkUserId,type:dto.type}}})]);
      if(identity || existing) throw new BadRequestException(coded('IDENTITY_TAKEN','This login method is already attached to an account.'));
    }
    const recent=await this.db.otpChallenge.count({where:{value,createdAt:{gte:new Date(Date.now()-60_000)}}});
    if(recent>=1) throw new HttpException(coded('OTP_RATE_LIMITED','Please wait a minute before requesting another code.'),429);
    const channel=otpChannel(dto.type);
    if(!channel) throw new ServiceUnavailableException(coded(dto.type==='PHONE'?'PHONE_LOGIN_UNAVAILABLE':'EMAIL_LOGIN_UNAVAILABLE',dto.type==='PHONE'?'Phone login is coming soon. Please use your email for now.':'Email login is not available right now. Please try again later.'));
    const code=randomInt(0,1000000).toString().padStart(6,'0');
    const challenge=await this.db.otpChallenge.create({data:{type:dto.type,value,hash:this.hash(value,code),linkUserId,expiresAt:new Date(Date.now()+5*60_000)}});
    if(channel==='dev') console.log(`[DEV OTP] ${value}: ${code}`);
    else {
      try {
        if(channel==='brevo') await sendEmailCode(value,code);
        else {
          const response=await fetch(process.env.OTP_WEBHOOK_URL!,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${process.env.OTP_WEBHOOK_TOKEN}`},body:JSON.stringify({type:dto.type,value,code}),signal:AbortSignal.timeout(10000)});
          if(!response.ok) throw new Error(`Webhook responded ${response.status}`);
        }
      } catch(e) {
        console.error(`OTP delivery via ${channel} failed:`,e instanceof Error?e.message:e);
        await this.db.otpChallenge.delete({where:{id:challenge.id}});
        throw new ServiceUnavailableException(coded('OTP_DELIVERY_FAILED','Could not send your code. Try again shortly.'));
      }
    }
    return {challengeId:challenge.id,expiresIn:300,...(channel==='dev'?{devCode:code}:{})};
  }
  async verify(dto:VerifyDto, linkUserId?:string) {
    const result=await this.db.atomic(async tx=>{
      const challenge=await tx.otpChallenge.findUnique({where:{id:dto.challengeId}});
      if(!challenge || challenge.expiresAt<new Date() || challenge.attempts>=5 || (challenge.linkUserId??undefined)!==linkUserId) return null;
      const valid=timingSafeEqual(Buffer.from(challenge.hash,'hex'),Buffer.from(this.hash(challenge.value,dto.code),'hex'));
      if(!valid) { await tx.otpChallenge.update({where:{id:challenge.id},data:{attempts:{increment:1}}}); return null; }
      let identity=await tx.authIdentity.findUnique({where:{value:challenge.value}});
      if(linkUserId) {
        if(identity || await tx.authIdentity.findUnique({where:{userId_type:{userId:linkUserId,type:challenge.type}}})) throw new BadRequestException(coded('IDENTITY_TAKEN','This login method is already in use.'));
        identity=await tx.authIdentity.create({data:{userId:linkUserId,type:challenge.type,value:challenge.value}});
      } else if(!identity) {
        const user=await tx.user.create({data:{identities:{create:{type:challenge.type,value:challenge.value}}},include:{identities:true}});
        identity=user.identities[0];
      }
      await tx.otpChallenge.deleteMany({where:{value:challenge.value}});
      return tx.user.findUniqueOrThrow({where:{id:identity.userId},select:{id:true,name:true}});
    });
    if(!result) throw new UnauthorizedException(coded('OTP_INVALID','Incorrect or expired code. Request a new code after five attempts.'));
    return {token:this.jwt.sign({sub:result.id}),user:result};
  }
}
@Injectable()
export class Guard implements CanActivate {
  constructor(private jwt:JwtService) {}
  canActivate(context:ExecutionContext) {
    const req=context.switchToHttp().getRequest<AuthedRequest>();
    const token=req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
    try { if(!token) throw new Error(); req.userId=this.jwt.verify<{sub:string}>(token).sub; return true; }
    catch { throw new UnauthorizedException('Please sign in again.'); }
  }
}
@Injectable()
export class OtpRateGuard implements CanActivate {
  private buckets=new Map<string,{count:number;until:number}>();
  canActivate(context:ExecutionContext) {
    const req=context.switchToHttp().getRequest<Request>(); const key=req.ip??'local'; const now=Date.now();
    for(const [ip,b] of this.buckets) if(b.until<now) this.buckets.delete(ip);
    const b=this.buckets.get(key)??{count:0,until:now+60_000};
    if(++b.count>20) throw new HttpException('Too many attempts. Please wait a minute.',429);
    this.buckets.set(key,b); return true;
  }
}
