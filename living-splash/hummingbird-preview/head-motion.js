// A small neck joint moves the head independently of the body and wings.
export const BEAK = {x:.944, y:.302};
const NECK = {x:.635, y:.47};
const DIP_ANGLE = .38;
const POSES = 9;
const SIZE = 512;
const smooth = (a,b,v) => {const t=Math.min(1,Math.max(0,(v-a)/(b-a)));return t*t*(3-2*t);};
export function headPoint(x,y,dip){
  const weight=smooth(.54,.66,x)*(1-smooth(.43,.58,y));
  const angle=DIP_ANGLE*dip*weight;
  const dx=x-NECK.x,dy=y-NECK.y;
  return {x:NECK.x+dx*Math.cos(angle)-dy*Math.sin(angle),y:NECK.y+dx*Math.sin(angle)+dy*Math.cos(angle)};
}
function triangle(ctx,image,s,d){
  const sx1=s[1].x-s[0].x,sy1=s[1].y-s[0].y,sx2=s[2].x-s[0].x,sy2=s[2].y-s[0].y;
  const dx1=d[1].x-d[0].x,dy1=d[1].y-d[0].y,dx2=d[2].x-d[0].x,dy2=d[2].y-d[0].y;
  const det=sx1*sy2-sx2*sy1;
  const a=(dx1*sy2-dx2*sy1)/det,b=(dy1*sy2-dy2*sy1)/det,c=(dx2*sx1-dx1*sx2)/det,e=(dy2*sx1-dy1*sx2)/det;
  const cx=(d[0].x+d[1].x+d[2].x)/3,cy=(d[0].y+d[1].y+d[2].y)/3;
  ctx.save();ctx.beginPath();
  d.forEach((p,i)=>{const length=Math.hypot(p.x-cx,p.y-cy);const x=p.x+(p.x-cx)*.45/length,y=p.y+(p.y-cy)*.45/length;i?ctx.lineTo(x,y):ctx.moveTo(x,y);});
  ctx.closePath();ctx.clip();
  ctx.transform(a,b,c,e,d[0].x-a*s[0].x-c*s[0].y,d[0].y-b*s[0].x-e*s[0].y);
  ctx.drawImage(image,0,0,SIZE,SIZE);ctx.restore();
}
export async function prepareHeadPoses(images){
  const poses=[];
  for(let p=0;p<POSES;p++){
    const dip=p/(POSES-1);
    poses[p]=images.map(image=>{
      const canvas=document.createElement('canvas');canvas.width=canvas.height=SIZE;const ctx=canvas.getContext('2d');
      if(!p){ctx.drawImage(image,0,0,SIZE,SIZE);return canvas;}
      const divisions=24;
      for(let y=0;y<divisions;y++)for(let x=0;x<divisions;x++){
        const points=[[x,y],[x+1,y],[x+1,y+1],[x,y+1]].map(([px,py])=>({x:px/divisions,y:py/divisions}));
        const source=points.map(v=>({x:v.x*SIZE,y:v.y*SIZE}));
        const dest=points.map(v=>headPoint(v.x,v.y,dip)).map(v=>({x:v.x*SIZE,y:v.y*SIZE}));
        for(const ids of [[0,1,2],[0,2,3]])triangle(ctx,image,ids.map(i=>source[i]),ids.map(i=>dest[i]));
      }
      return canvas;
    });
    await new Promise(resolve=>setTimeout(resolve,0));
  }
  return poses;
}
