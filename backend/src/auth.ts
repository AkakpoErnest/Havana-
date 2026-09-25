import { BadRequestException, CanActivate, ExecutionContext, HttpException, Injectable, UnauthorizedException, ServiceUnavailableException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { isEmail } from 'class-validator';
import { Request } from 'express';
import { Db } from './db';
import { OtpDto, VerifyDto } from './dto';
import { coded } from './errors';
export type AuthedRequest = Request & { userId: string };
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
    const code=randomInt(0,1000000).toString().padStart(6,'0');
    const challenge=await this.db.otpChallenge.create({data:{type:dto.type,value,hash:this.hash(value,code),linkUserId,expiresAt:new Date(Date.now()+5*60_000)}});
    if(process.env.DEV_OTP==='true') console.log(`[DEV OTP] ${value}: ${code}`);
    else {
      try {
        const response=await fetch(process.env.OTP_WEBHOOK_URL!,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${process.env.OTP_WEBHOOK_TOKEN}`},body:JSON.stringify({type:dto.type,value,code}),signal:AbortSignal.timeout(10000)});
        if(!response.ok) throw new Error('Delivery failed');
      } catch {
        await this.db.otpChallenge.delete({where:{id:challenge.id}});
        throw new ServiceUnavailableException(coded('OTP_DELIVERY_FAILED','Could not send your code. Try again shortly.'));
      }
    }
    return {challengeId:challenge.id,expiresIn:300,...(process.env.DEV_OTP==='true'?{devCode:code}:{})};
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
