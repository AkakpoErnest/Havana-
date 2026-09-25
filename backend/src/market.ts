import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Db } from './db';
import { FeedDto, ListingDto, ProfileDto, SwipeDto } from './dto';
import { coded } from './errors';
const ownerSelect={id:true,name:true} as const;
export const conversationInclude={item:true,swapItem:true,buyer:{select:ownerSelect},seller:{select:ownerSelect}} as const;
export function distance(lat1:number,lon1:number,lat2:number,lon2:number) {
  const r=Math.PI/180; const a=Math.sin((lat2-lat1)*r/2)**2+Math.cos(lat1*r)*Math.cos(lat2*r)*Math.sin((lon2-lon1)*r/2)**2;
  return 6371*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}
@Injectable()
export class Market {
  constructor(private db:Db) {}
  async me(userId:string) {
    const [user,ratings]=await Promise.all([this.db.user.findUniqueOrThrow({where:{id:userId},include:{identities:{select:{type:true,value:true,verifiedAt:true}},items:{orderBy:{createdAt:'desc'}}}}),this.db.rating.aggregate({where:{toId:userId},_avg:{stars:true},_count:true})]);
    return {...user,rating:ratings._avg.stars,ratingCount:ratings._count};
  }
  async profile(userId:string,d:ProfileDto) {
    if((d.latitude==null)!==(d.longitude==null)) throw new BadRequestException('Both location coordinates are required.');
    await this.db.user.update({where:{id:userId},data:d});
    return this.me(userId);
  }
  async create(userId:string,d:ListingDto) {
    if(!d.sell&&!d.swap) throw new BadRequestException('Choose selling, swapping, or both.');
    if(d.sell&&!d.price || d.swap&&!d.swapValue) throw new BadRequestException('Add a whole-cedi price or swap value.');
    if((d.latitude==null)!==(d.longitude==null)) throw new BadRequestException('Both location coordinates are required.');
    const paths=[...new Set(d.photos)];
    if(paths.length!==d.photos.length || await this.db.upload.count({where:{userId,path:{in:paths}}})!==paths.length) throw new BadRequestException(coded('PHOTOS_NOT_OWNED','Upload your own photos first.'));
    return this.db.item.create({data:{...d,price:d.sell?d.price:null,swapValue:d.swap?d.swapValue:null,ownerId:userId}});
  }
  async item(id:string,userId:string) {
    const item=await this.db.item.findUnique({where:{id},include:{owner:{select:ownerSelect}}});
    if(!item || ((item.hidden||item.status==='REMOVED')&&item.ownerId!==userId)) throw new NotFoundException(coded('LISTING_UNAVAILABLE','This item is no longer available.'));
    const rating=await this.db.rating.aggregate({where:{toId:item.ownerId},_avg:{stars:true},_count:true});
    return {...item,owner:{...item.owner,rating:rating._avg.stars,ratingCount:rating._count}};
  }
  async feed(userId:string,q:FeedDto) {
    const [closet,user]=await Promise.all([this.db.item.findMany({where:{ownerId:userId,swap:true,status:'LIVE',hidden:false},select:{swapValue:true}}),this.db.user.findUniqueOrThrow({where:{id:userId},select:{latitude:true,longitude:true}})]);
    const items=await this.db.item.findMany({where:{ownerId:{not:userId},status:'LIVE',hidden:false,kind:'ITEM',...(q.mode==='SWAP'?{swap:true}:{sell:true}),category:q.category,swipes:{none:{userId,mode:q.mode}}},include:{owner:{select:ownerSelect}},orderBy:{createdAt:'desc'},take:500});
    // Request location, then saved profile location, then central Accra.
    const [lat,lon]=q.latitude!=null&&q.longitude!=null?[q.latitude,q.longitude]:user.latitude!=null&&user.longitude!=null?[user.latitude,user.longitude]:[5.6037,-0.187];
    const ranked=items.map(item=>{
      const km=item.latitude!=null&&item.longitude!=null?distance(lat,lon,item.latitude,item.longitude):null;
      const days=(Date.now()-item.createdAt.getTime())/86400000;
      const gap=q.mode==='SWAP'&&closet.length?Math.min(...closet.map(c=>Math.abs((item.swapValue??0)-(c.swapValue??0))/Math.max(c.swapValue??1,1))):0;
      return {...item,distanceKm:km,score:(km??30)+Math.min(days,60)*0.35+gap*12};
    }).sort((a,b)=>a.score-b.score).slice(0,30);
    return {items:ranked,needsCloset:q.mode==='SWAP'&&!closet.length};
  }
  async status(userId:string,id:string,status:'LIVE'|'RESERVED'|'SOLD'|'SWAPPED'|'REMOVED') {
    return this.db.atomic(async tx=>{
      const item=await tx.item.findUnique({where:{id}});
      if(!item||item.ownerId!==userId) throw new ForbiddenException('Only the owner can update this item.');
      if(status==='SWAPPED') throw new BadRequestException('Complete swaps together in the match chat.');
      const active=await tx.conversation.findFirst({where:{OR:[{itemId:id},{swapItemId:id}],completedAt:null,messages:{some:{type:'OFFER',offerStatus:'ACCEPTED'}}}});
      if(active&&status==='LIVE') throw new BadRequestException('This item has an accepted offer. Mark it sold or removed.');
      if(item.status==='SWAPPED'&&status!=='REMOVED') throw new BadRequestException('A completed swap cannot be relisted.');
      return tx.item.update({where:{id},data:{status}});
    });
  }
  async saved(userId:string) {
    return this.db.item.findMany({where:{hidden:false,status:{not:'REMOVED'},swipes:{some:{userId,mode:'SHOP',direction:'RIGHT'}}},include:{owner:{select:ownerSelect}},orderBy:{createdAt:'desc'}});
  }
  async unsave(userId:string,itemId:string) {
    await this.db.swipe.updateMany({where:{userId,itemId,mode:'SHOP',direction:'RIGHT'},data:{direction:'LEFT'}});
    return {saved:false};
  }
  async swipe(userId:string,d:SwipeDto) {
    return this.db.atomic(async tx=>{
      const item=await tx.item.findUnique({where:{id:d.itemId}});
      if(!item||item.ownerId===userId||item.hidden||item.status!=='LIVE'||(d.mode==='SHOP'?!item.sell:!item.swap)) throw new BadRequestException(coded('LISTING_UNAVAILABLE','This item is unavailable in this mode.'));
      if(d.mode==='SWAP'&&d.direction==='UP') throw new BadRequestException('Offers are available in Shop mode.');
      const closet=d.mode==='SWAP'&&d.direction==='RIGHT'?await tx.item.findMany({where:{ownerId:userId,swap:true,hidden:false,status:'LIVE'}}):[];
      if(d.mode==='SWAP'&&d.direction==='RIGHT'&&!closet.length) throw new BadRequestException(coded('CLOSET_EMPTY','List something in your Swap Closet first.'));
      await tx.swipe.upsert({where:{userId_itemId_mode:{userId,itemId:item.id,mode:d.mode}},create:{userId,...d},update:{}});
      if(d.mode==='SHOP'&&d.direction==='UP') return {conversation:await this.shopConversation(tx,userId,item.id)};
      if(d.mode==='SWAP'&&d.direction==='RIGHT') {
        const ownSwipe=await tx.swipe.findUniqueOrThrow({where:{userId_itemId_mode:{userId,itemId:item.id,mode:'SWAP'}}});
        if(ownSwipe.direction!=='RIGHT') return {saved:false};
        const other=await tx.swipe.findFirst({where:{userId:item.ownerId,itemId:{in:closet.map(c=>c.id)},mode:'SWAP',direction:'RIGHT'},orderBy:{createdAt:'desc'}});
        if(other) {
          const matchKey=[item.id,other.itemId].sort().join(':');
          const match=await tx.conversation.upsert({where:{matchKey},update:{},create:{buyerId:userId,sellerId:item.ownerId,itemId:item.id,swapItemId:other.itemId,matchKey,messages:{create:{type:'SYSTEM',text:"It's a Havana Match! Chat, agree, and meet somewhere public."}}},include:conversationInclude});
          return {match};
        }
      }
      return {saved:d.direction==='RIGHT'};
    });
  }
  async shopConversation(tx:Prisma.TransactionClient,userId:string,itemId:string) {
    const item=await tx.item.findUnique({where:{id:itemId}});
    if(!item||!item.sell||item.hidden||item.status!=='LIVE'||item.ownerId===userId) throw new BadRequestException(coded('LISTING_UNAVAILABLE','This item is unavailable for buying.'));
    const matchKey=`shop:${userId}:${itemId}`;
    return tx.conversation.upsert({where:{matchKey},update:{},create:{buyerId:userId,sellerId:item.ownerId,itemId,matchKey,messages:{create:{type:'SYSTEM',text:'Meet in public. Check the item before paying. Pay directly by MoMo or cash on pickup; Havana never collects payment.'}}},include:conversationInclude});
  }
  async report(userId:string,itemId:string,reason:string) {
    return this.db.atomic(async tx=>{
      const item=await tx.item.findUnique({where:{id:itemId}});
      if(!item) throw new NotFoundException();
      if(item.ownerId===userId) throw new BadRequestException('You cannot report your own item.');
      await tx.report.upsert({where:{userId_itemId:{userId,itemId}},update:{reason},create:{userId,itemId,reason}});
      const count=await tx.report.count({where:{itemId}});
      if(count>=3) await tx.item.update({where:{id:itemId},data:{hidden:true}});
      return {reported:true};
    });
  }
  async rate(fromId:string,toId:string,stars:number) {
    if(fromId===toId) throw new BadRequestException('You cannot rate yourself.');
    const chat=await this.db.conversation.findFirst({where:{OR:[{buyerId:fromId,sellerId:toId},{buyerId:toId,sellerId:fromId}],AND:[{messages:{some:{senderId:fromId,type:{in:['TEXT','OFFER']}}}},{messages:{some:{senderId:toId,type:{in:['TEXT','OFFER']}}}}]}});
    if(!chat) throw new ForbiddenException(coded('CANNOT_RATE','You can rate someone after you have both chatted.'));
    return this.db.rating.upsert({where:{fromId_toId:{fromId,toId}},update:{stars},create:{fromId,toId,stars}});
  }
}
