import { BEAK, headPoint, prepareHeadPoses } from './hummingbird-preview/head-motion.js';
const clamp=(v,min=0,max=1)=>Math.min(max,Math.max(min,v));
const mix=(a,b,t)=>a+(b-a)*t;
const ease=t=>t*t*(3-2*t);
export const BIRD_SCALE=.3;
export const VISIT_DURATION=2.28;
export async function createBirdRenderer(){
 const assets=new URL('./assets/hummingbird/',import.meta.url);
 const frames=await Promise.all(['wing-up','wing-middle','wing-down','wing-return'].map(name=>new Promise((resolve,reject)=>{
  const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(new Error('Hummingbird frame could not load'));image.src=new URL(name+'.png',assets).href;
 })));
 const headPoses=await prepareHeadPoses(frames);
 const blend=document.createElement('canvas');blend.width=blend.height=512;
 const blendCtx=blend.getContext('2d');
 function wingImage(dip=0,wingTime=0,frame=null){
 const phase=wingTime*8.5%4;
 const index=frame ?? Math.floor(phase);
 const next=(index+1)%4;
 const amount=frame===null ? phase-Math.floor(phase) : 0;
 const pose=clamp(dip)*(headPoses.length-1),low=Math.floor(pose),high=Math.min(low+1,headPoses.length-1),fraction=pose-low;
 blendCtx.clearRect(0,0,512,512);
 // Add weighted frames so the body stays opaque through wing and head transitions.
 blendCtx.globalCompositeOperation='lighter';
 for(const [p,weight] of [[low,1-fraction],[high,fraction]])for(const [f,w] of [[index,1-amount],[next,amount]]){
   if(weight*w){blendCtx.globalAlpha=weight*w;blendCtx.drawImage(headPoses[p][f],0,0);}
 }
 blendCtx.globalAlpha=1;blendCtx.globalCompositeOperation='source-over';return blend;
}
function bird(ctx,x,y,size,dip=0,opacity=1,wingTime=0,frame=null){
 ctx.save();ctx.translate(x,y);
 // The bird faces left for the whole visit. This orientation never animates.
 ctx.scale(-1,1);ctx.globalAlpha=opacity;
 ctx.drawImage(wingImage(dip,wingTime,frame),-size*BEAK.x,-size*BEAK.y,size,size);ctx.restore();
}

 return bird;
}
export function visitPose(t,flower,size,width){
 const loweredBeak=headPoint(BEAK.x,BEAK.y,1);
 // Hover just above the bloom; the neck rotation brings the beak onto its center.
 const rest={x:flower.x+(loweredBeak.x-BEAK.x)*size,y:flower.y-(loweredBeak.y-BEAK.y)*size};
 const cycle=t,back=size*.28;
 let x=rest.x,y=rest.y,dip=0,opacity=1,phase='arriving';
 if(cycle<.58){
   const u=cycle/.58,e=1-Math.pow(1-u,3);
   x=mix(width+size,rest.x,e);y=mix(rest.y-size*.65,rest.y,e)-Math.sin(u*Math.PI)*size*.12;
 }else if(cycle<.7){phase='hovering';}
 else if(cycle<.98){dip=ease((cycle-.7)/.28);phase='dipping';}
 else if(cycle<1.38){dip=1;phase='sipping';}
 else if(cycle<1.58){dip=1-ease((cycle-1.38)/.2);phase='lifting';}
 else if(cycle<1.74){phase='pausing';}
 else if(cycle<1.86){const u=ease((cycle-1.74)/.12);x+=back*u;y-=size*.04*u;phase='backing-away';}
 else if(cycle<VISIT_DURATION){
   const u=(cycle-1.86)/.42,e=u*u;
   x=mix(rest.x+back,-size*1.5,e);y=mix(rest.y-size*.04,rest.y-size*.8,e);phase='leaving';
 }else{opacity=0;phase='waiting';}
 // Keep the beak still while it meets the flower; only a tiny hover remains after lifting.
 if(cycle>=1.58&&cycle<1.74)y+=Math.sin((cycle-1.58)/.16*Math.PI*2)*size*.006;

 return {x,y,dip,opacity,phase};
}
