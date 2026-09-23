import 'dotenv/config';
import { PrismaClient, Category, Condition } from '@prisma/client';
const db=new PrismaClient();
// Each demo seller can log in with the phone or the email (DEV_OTP shows the code).
const sellers=[
  {name:'Ama Mensah',phone:'+233241000001',email:'ama@havana.demo',area:'Osu',latitude:5.556,longitude:-0.182},
  {name:'Kofi Asante',phone:'+233241000002',email:'kofi@havana.demo',area:'Madina',latitude:5.668,longitude:-0.164},
  {name:'Esi Owusu',phone:'+233241000003',email:'esi@havana.demo',area:'East Legon',latitude:5.635,longitude:-0.157},
  {name:'Yaw Boateng',phone:'+233241000004',email:'yaw@havana.demo',area:'Labone',latitude:5.563,longitude:-0.170},
  {name:'Akosua Darko',phone:'+233241000005',email:'akosua@havana.demo',area:'Spintex',latitude:5.628,longitude:-0.105},
  {name:'Kwame Mensah',phone:'+233241000006',email:'kwame@havana.demo',area:'Kaneshie',latitude:5.570,longitude:-0.235},
];
type Seed={title:string;category:Category;condition:Condition;price:number|null;swapValue:number|null;photo:string;owner:number;description?:string};
const items:Seed[]=[
  {title:'Vintage denim jacket',category:'CLOTHES',condition:'GOOD',price:150,swapValue:150,photo:'photo-1551028719-00167b16eac5',owner:0},
  {title:'Everyday white sneakers',category:'SHOES',condition:'GOOD',price:220,swapValue:220,photo:'photo-1549298916-b41d501d3772',owner:1},
  {title:'Little weekend bag',category:'BAGS',condition:'LIKE_NEW',price:120,swapValue:120,photo:'photo-1553062407-98eeb64c6a62',owner:2},
  {title:'Your new reading chair',category:'FURNITURE',condition:'GOOD',price:450,swapValue:450,photo:'photo-1567538096630-e0c55bd6374c',owner:0},
  {title:'Headphones, big sound',category:'ELECTRONICS',condition:'LIKE_NEW',price:300,swapValue:300,photo:'photo-1505740420928-5e560c06d30e',owner:1},
  {title:'A little green for your room',category:'HOUSEHOLD',condition:'NEW',price:65,swapValue:65,photo:'photo-1485955900006-10f4d324d411',owner:2},
  {title:'The everyday camera',category:'ELECTRONICS',condition:'GOOD',price:850,swapValue:850,photo:'photo-1516035069371-29a1b244cc32',owner:0},
  {title:'Fresh kicks, second life',category:'SHOES',condition:'FAIR',price:180,swapValue:180,photo:'photo-1542291026-7eec264c27ff',owner:1},
  {title:'Easy Sunday tee',category:'CLOTHES',condition:'LIKE_NEW',price:70,swapValue:70,photo:'photo-1521572163474-6864f9cf17ab',owner:2},
  {title:'Knit beach poncho',category:'CLOTHES',condition:'LIKE_NEW',price:null,swapValue:90,photo:'photo-1434389677669-e08b4cac3105',owner:3,description:'Perfect for Labadi weekends. Swap only. Show me your closet!'},
  {title:'Portable speaker, loud loud',category:'ELECTRONICS',condition:'GOOD',price:380,swapValue:400,photo:'photo-1608043152269-423dbba4e7e1',owner:4},
  {title:'Orange woven handbag',category:'BAGS',condition:'LIKE_NEW',price:260,swapValue:null,photo:'photo-1590874103328-eac38a683ce7',owner:5,description:'Bought in Kumasi, used twice. Sale only, cash on pickup at Kaneshie market.'},
  {title:'Smartwatch with charger',category:'ELECTRONICS',condition:'GOOD',price:700,swapValue:750,photo:'photo-1546868871-7041f2a55e12',owner:3},
  {title:'Brown leather tote',category:'BAGS',condition:'GOOD',price:null,swapValue:200,photo:'photo-1548036328-c9fa89d128fa',owner:4,description:'Roomy and strong. Looking to swap for shoes or a small speaker.'},
  {title:'Grey 3-seater sofa',category:'FURNITURE',condition:'GOOD',price:2500,swapValue:null,photo:'photo-1555041469-a586c61ea9bc',owner:5,description:'Moving out. Buyer arranges transport (trotro will not do 😅).'},
  {title:'Wooden side chair',category:'FURNITURE',condition:'LIKE_NEW',price:350,swapValue:350,photo:'photo-1503602642458-232111445657',owner:1},
  {title:'Smartphone, clean screen',category:'ELECTRONICS',condition:'GOOD',price:1200,swapValue:null,photo:'photo-1511707171634-5f897ff02aa9',owner:2},
  {title:'Laptop for school and work',category:'ELECTRONICS',condition:'FAIR',price:3200,swapValue:3000,photo:'photo-1496181133206-80ce9b88a853',owner:3},
  {title:'Classic wristwatch',category:'OTHER',condition:'LIKE_NEW',price:450,swapValue:450,photo:'photo-1523275335684-37898b6baf30',owner:5},
  {title:'Running sneakers',category:'SHOES',condition:'GOOD',price:300,swapValue:300,photo:'photo-1491553895911-0055eca6402d',owner:3},
  {title:'Leather handbag',category:'BAGS',condition:'GOOD',price:320,swapValue:null,photo:'photo-1584917865442-de89df76afd3',owner:2},
];
// Swap right-swipes made in advance so a match can be triggered in one tap:
// log in as Ama and swap-right any Kofi item, or as Yaw and swap-right any Esi item.
const swapRights:[number,number][]=[[1,1],[2,13]]; // [seller index, item number]
const itemId=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
async function main() {
  const userIds:string[]=[];
  for(const {name,phone,email,...profile} of sellers) {
    const existing=await db.authIdentity.findUnique({where:{value:email}});
    const user=existing?await db.user.update({where:{id:existing.userId},data:{name,...profile}}):await db.user.create({data:{name,...profile,identities:{create:{type:'EMAIL',value:email}}}});
    await db.authIdentity.upsert({where:{value:phone},update:{},create:{userId:user.id,type:'PHONE',value:phone}});
    userIds.push(user.id);
  }
  for(const [i,{photo,owner,description,...item}] of items.entries()) {
    const seller=sellers[owner];
    const data={...item,ownerId:userIds[owner],sell:item.price!=null,swap:item.swapValue!=null,description:description??'Well loved, well looked after. Ready for a new home in Accra. Message me and let’s make a deal!',photos:[`https://images.unsplash.com/${photo}?auto=format&fit=crop&w=900&q=75`],area:seller.area,latitude:seller.latitude,longitude:seller.longitude};
    await db.item.upsert({where:{id:itemId(i+1)},update:data,create:{id:itemId(i+1),...data}});
  }
  for(const [seller,n] of swapRights) await db.swipe.upsert({where:{userId_itemId_mode:{userId:userIds[seller],itemId:itemId(n),mode:'SWAP'}},update:{direction:'RIGHT'},create:{userId:userIds[seller],itemId:itemId(n),mode:'SWAP',direction:'RIGHT'}});
  console.log(`Seeded ${sellers.length} sellers and ${items.length} items around Accra.`);
  console.log('Log in with 0241000001–0241000006 or ama/kofi/esi/yaw/akosua/kwame@havana.demo.');
  console.log('Match demo: as Ama (0241000001), Swap mode, swipe right on any Kofi item.');
}
main().finally(()=>db.$disconnect());
