import { createBirdRenderer, visitPose, VISIT_DURATION, BIRD_SCALE } from '../hummingbird-motion.js';
const stage = document.querySelector('.stage');
const canvas = document.querySelector('#bird-canvas');
const ctx = canvas.getContext('2d');
const playButton = document.querySelector('#play');
const slowButton = document.querySelector('#slow');
const flowerButton = document.querySelector('#flower-target');
const replayButton = document.querySelector('#replay');
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const assets = new URL('../assets/', import.meta.url);
const load = name => new Promise((resolve, reject) => {const image = new Image();image.onload = () => resolve(image);image.onerror = reject;image.src = new URL(name, assets).href;});
const state = {mode:'visit', playing:!reduced.matches, slow:false, time:0, wingTime:0, frame:null, ready:false};
let renderBird, botanical, width, height, ratio, lastTime;
const clamp = (v, min=0, max=1) => Math.min(max,Math.max(min,v));
function resize(){const r=stage.getBoundingClientRect();width=r.width;height=r.height;ratio=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(width*ratio);canvas.height=Math.round(height*ratio);draw();}
function bird(x,y,size,dip=0,opacity=1){renderBird(ctx,x,y,size,dip,opacity,state.wingTime,state.frame);}
function flowerLayout(){const w=Math.min(width*.98,860,height*1.5);const h=w*2/3;return {x:(width-w)/2,y:(height-h)/2+28,w,h};}
function visit(t){
 const box=flowerLayout();ctx.drawImage(botanical,box.x,box.y,box.w,box.h);
 const flower={x:box.x+box.w*.385,y:box.y+box.h*.128};
 flowerButton.style.left=flower.x+'px';flowerButton.style.top=flower.y+'px';
 const size=clamp(box.w*.17,85,146)*BIRD_SCALE;
 const {x,y,dip,opacity,phase}=visitPose(t%(VISIT_DURATION+1.55),flower,size,width);
 bird(x,y,size,dip,opacity);
 stage.dataset.phase=phase;stage.dataset.headDip=dip.toFixed(3);stage.dataset.birdSize=size.toFixed(2);
}
function draw(){
 if(!state.ready||!width)return;
 ctx.setTransform(ratio,0,0,ratio,0,0);ctx.clearRect(0,0,width,height);stage.dataset.mode=state.mode;
 if(state.mode==='visit')visit(state.time);
 else{
   const size=Math.min(width*.86,height*.96,470)*BIRD_SCALE,t=state.time;
   bird(width/2-size*.43+Math.sin(t*1.3),height/2-size*.21+Math.sin(t*2.6),size);
 }
 stage.dataset.frame=String(state.frame ?? Math.floor(state.wingTime*8.5%4));
}
function updateControls(){playButton.textContent=state.playing?'Pause':'Play';slowButton.setAttribute('aria-pressed',String(state.slow));document.querySelectorAll('[data-frame]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.frame)===state.frame)));}
function animate(now){if(lastTime!==undefined&&state.ready&&state.playing&&!document.hidden){const dt=Math.min((now-lastTime)/1000,.05);const speed=state.slow?.12:1;state.time+=dt*speed;state.wingTime+=dt*speed;draw();}lastTime=now;requestAnimationFrame(animate);}
function replay(){state.time=0;state.frame=null;state.playing=true;updateControls();draw();}
playButton.addEventListener('click',()=>{state.playing=!state.playing;if(state.playing)state.frame=null;updateControls();});
slowButton.addEventListener('click',()=>{state.slow=!state.slow;state.frame=null;state.playing=true;updateControls();});
replayButton.addEventListener('click',replay);flowerButton.addEventListener('click',replay);
document.querySelectorAll('[data-view]').forEach(button=>button.addEventListener('click',()=>{state.mode=button.dataset.view;state.time=0;state.frame=null;state.playing=true;document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));flowerButton.hidden=replayButton.hidden=state.mode!=='visit';document.querySelector('#view-note').textContent=state.mode==='visit'?'Tap the red flower to invite it back.':'Four wing positions. One gentle hover.';canvas.setAttribute('aria-label',state.mode==='visit'?'A small hummingbird arrives from the right, lowers its head to sip, lifts its head, pauses, backs away slightly, then continues left.':'A green hummingbird hovering with softly beating wings.');resize();updateControls();}));
document.querySelectorAll('[data-frame]').forEach(button=>button.addEventListener('click',()=>{if(!state.ready)return;state.frame=Number(button.dataset.frame);state.playing=false;if(state.mode==='visit')state.time=1.8;updateControls();draw();}));
new ResizeObserver(resize).observe(stage);
Promise.all([createBirdRenderer(),load('botanicals/home-transparent.png')]).then(([renderer,art])=>{renderBird=renderer;botanical=art;state.ready=true;playButton.disabled=false;document.querySelector('#loading').hidden=true;updateControls();resize();requestAnimationFrame(animate);}).catch(()=>{document.querySelector('#loading').textContent='The preview could not load. Please refresh to try again.';});
