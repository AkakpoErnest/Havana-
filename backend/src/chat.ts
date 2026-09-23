import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Db } from './db';
import { conversationInclude } from './market';
import { MessagesDto } from './dto';
// Poll cursors overlap by this much so rows from transactions that committed late are not missed.
const CURSOR_OVERLAP_MS=5000;
@Injectable()
export class Chat {
  constructor(private db:Db) {}
  async member(tx:Prisma.TransactionClient,id:string,userId:string) {
    const c=await tx.conversation.findUnique({where:{id},include:conversationInclude});
    if(!c) throw new NotFoundException('Chat not found.');
    if(c.buyerId!==userId&&c.sellerId!==userId) throw new ForbiddenException('This chat is private.');
    return c;
  }
  async inbox(userId:string) {
    const conversations=await this.db.conversation.findMany({where:{OR:[{buyerId:userId},{sellerId:userId}]},include:{...conversationInclude,messages:{orderBy:{createdAt:'desc'},take:1},_count:{select:{messages:{where:{type:{in:['TEXT','OFFER']}}}}}},orderBy:{updatedAt:'desc'},take:100});
    return conversations.map(({_count,...c})=>{
      const hasChatted=_count.messages>0;
      return {...c,hasChatted,isNewMatch:c.swapItemId!=null&&!hasChatted&&!c.completedAt};
    });
  }
  async messages(id:string,userId:string,q:MessagesDto) {
    const cursor=new Date(Date.now()-CURSOR_OVERLAP_MS).toISOString();
    const conversation=await this.member(this.db,id,userId);
    const parse=(value?:string)=>{
      const date=value?new Date(value):undefined;
      if(date&&isNaN(date.getTime())) throw new BadRequestException('Invalid message cursor.');
      return date;
    };
    const since=parse(q.since);
    if(since) {
      // New messages plus older offers whose status changed (accepted, countered, declined).
      const messages=await this.db.message.findMany({where:{conversationId:id,updatedAt:{gt:since}},orderBy:[{createdAt:'asc'},{id:'asc'}],take:200});
      return {conversation,messages,hasMore:false,cursor};
    }
    const before=parse(q.before);
    const messages=await this.db.message.findMany({where:{conversationId:id,...(before?{createdAt:{lt:before}}:{})},orderBy:[{createdAt:'desc'},{id:'desc'}],take:100});
    return {conversation,messages:messages.reverse(),hasMore:messages.length===100,cursor};
  }
  async text(id:string,userId:string,text:string) {
    if(!text.trim()) throw new BadRequestException('Write a message first.');
    return this.db.atomic(async tx=>{
      await this.member(tx,id,userId);
      const message=await tx.message.create({data:{conversationId:id,senderId:userId,type:'TEXT',text:text.trim()}});
      await tx.conversation.update({where:{id},data:{updatedAt:new Date()}}); return message;
    });
  }
  async offer(id:string,userId:string,amount:number) {
    return this.db.atomic(async tx=>{
      const c=await this.member(tx,id,userId);
      if(c.swapItemId||!c.item.sell||c.item.status!=='LIVE'||c.item.hidden) throw new BadRequestException('Offers are only available on live sale items.');
      await tx.message.updateMany({where:{conversationId:id,offerStatus:'PENDING'},data:{offerStatus:'COUNTERED'}});
      const message=await tx.message.create({data:{conversationId:id,senderId:userId,type:'OFFER',amount,offerStatus:'PENDING'}});
      await tx.conversation.update({where:{id},data:{updatedAt:new Date()}}); return message;
    });
  }
  async respond(id:string,messageId:string,userId:string,action:'ACCEPT'|'DECLINE') {
    return this.db.atomic(async tx=>{
      const c=await this.member(tx,id,userId);
      const offer=await tx.message.findUnique({where:{id:messageId}});
      if(!offer||offer.conversationId!==id||offer.type!=='OFFER'||offer.offerStatus!=='PENDING'||offer.senderId===userId) throw new BadRequestException('Only the recipient can respond to a pending offer.');
      if(c.item.status!=='LIVE'||c.item.hidden) throw new BadRequestException('This item is no longer available.');
      // Lock the shared item before individual offers to keep lock ordering consistent.
      if(action==='ACCEPT') await tx.item.update({where:{id:c.itemId},data:{status:'RESERVED'}});
      await tx.message.update({where:{id:messageId},data:{offerStatus:action==='ACCEPT'?'ACCEPTED':'DECLINED'}});
      if(action==='ACCEPT') {
        await tx.message.updateMany({where:{conversation:{itemId:c.itemId},offerStatus:'PENDING'},data:{offerStatus:'DECLINED'}});
        await tx.message.create({data:{conversationId:id,type:'SYSTEM',text:`Offer accepted: GH₵${offer.amount}. Item reserved. Meet in public and check before paying.`}});
      }
      await tx.conversation.update({where:{id},data:{updatedAt:new Date()}});
      return {ok:true};
    });
  }
  async swap(id:string,userId:string,action:'AGREE'|'DONE') {
    return this.db.atomic(async tx=>{
      const c=await this.member(tx,id,userId);
      if(!c.swapItemId||!c.swapItem) throw new BadRequestException('This is not a swap match.');
      if(c.completedAt) return c;
      if(c.item.hidden||c.swapItem.hidden||c.item.status!=='LIVE'||c.swapItem.status!=='LIVE') throw new BadRequestException('One of these items is no longer available to swap.');
      if(action==='DONE'&&(!c.buyerAgreed||!c.sellerAgreed)) throw new BadRequestException('Both people must tap We agreed before completing a swap.');
      const field=action==='AGREE'?(userId===c.buyerId?'buyerAgreed':'sellerAgreed'):(userId===c.buyerId?'buyerDone':'sellerDone');
      if(c[field]) return c;
      const next=await tx.conversation.update({where:{id},data:{[field]:true}});
      await tx.message.create({data:{conversationId:id,type:'SYSTEM',text:`${userId===c.buyerId?c.buyer.name:c.seller.name} ${action==='AGREE'?'agreed to the swap.':'confirmed the handover.'}`}});
      if(next.buyerDone&&next.sellerDone) {
        await tx.item.updateMany({where:{id:{in:[c.itemId,c.swapItemId]}},data:{status:'SWAPPED'}});
        await tx.conversation.update({where:{id},data:{completedAt:new Date()}});
        await tx.message.create({data:{conversationId:id,type:'SYSTEM',text:'Swap done! Both items have a new home. Leave each other a rating.'}});
      }
      return tx.conversation.findUniqueOrThrow({where:{id},include:conversationInclude});
    });
  }
}
