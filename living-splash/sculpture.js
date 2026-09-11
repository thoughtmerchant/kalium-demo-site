import * as THREE from 'three';
import { createDrawnSculpture } from './emergence/drawn-sculpture.js';
import { imagePointFromClient } from './emergence/view-coordinates.js';
import { loadSetup } from './setup-store.js';

const stage = document.querySelector('#sculpture-stage');
const hint = document.querySelector('#sculpture-hint');
const preference = matchMedia('(prefers-reduced-motion: reduce)');
let renderer, sculpture, observer, visibilityObserver, channel, disposed = false;
let movement = 50, revision = null, refreshing = false;
let pointer = null, paused = preference.matches, visible = true, elapsed = 0, previous = performance.now();
const target = new THREE.Vector3();
const camera = new THREE.OrthographicCamera(-6.4, 6.4, 4.27, -4.27, .1, 80);
camera.position.set(0, 0, 18); camera.lookAt(target);
function resize() {
  const rect = stage.getBoundingClientRect(); if (!rect.width || !rect.height) return;
  const height = Math.max(8.3, 12.45 / (rect.width / rect.height));
  camera.top = height / 2; camera.bottom = -height / 2; camera.left = -height * rect.width / rect.height / 2; camera.right = -camera.left;
  camera.updateProjectionMatrix(); renderer.setSize(rect.width, rect.height);
}
function move(event) { if (event.pointerType !== 'touch' && event.buttons === 0) pointer = [event.clientX, event.clientY]; }
function leave() { pointer = null; }
function preferenceChange(event) { paused = event.matches; }
async function refreshSetup() {
  if (!sculpture || disposed || refreshing || document.hidden) return;
  refreshing = true;
  try {
    const saved = await loadSetup();
    if (disposed) return;
    if (saved.revision !== revision) {
      sculpture.setRigs(saved.setup.rigs); movement = saved.setup.movement;
      revision = saved.revision; elapsed = 0;
    }
  } catch (error) { console.error('Could not refresh the motion setup', error); }
  finally { refreshing = false; }
}
function keyboard(event) {
  const offset = { ArrowLeft: [-.8,0], ArrowRight: [.8,0], ArrowUp: [0,-.8], ArrowDown: [0,.8], Escape: [0,0] }[event.key];
  if (!offset) return; event.preventDefault(); const r = stage.getBoundingClientRect();
  pointer = [r.left + r.width * (.5 + offset[0] / 2), r.top + r.height * (.5 + offset[1] / 2)];
}
function dispose() {
  if (disposed) return; disposed = true;
  renderer?.setAnimationLoop(null); observer?.disconnect(); visibilityObserver?.disconnect(); sculpture?.dispose(); renderer?.dispose();
  window.removeEventListener('pointermove', move); window.removeEventListener('blur', leave); document.documentElement.removeEventListener('pointerleave', leave);
  stage.removeEventListener('keydown', keyboard); preference.removeEventListener('change', preferenceChange);
  window.removeEventListener('focus', refreshSetup); window.removeEventListener('pageshow', refreshSetup);
  document.removeEventListener('visibilitychange', refreshSetup); channel?.close();
}
async function start() {
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setClearColor(0xfdfdfd);
    renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.NoToneMapping;
    const canvas = renderer.domElement; canvas.setAttribute('aria-hidden','true'); stage.append(canvas);
    resize();
    const scene = new THREE.Scene();
    const [loaded, saved] = await Promise.all([createDrawnSculpture(new URL('./emergence/', import.meta.url)), loadSetup()]);
    sculpture = loaded;
    sculpture.setRigs(saved.setup.rigs); scene.add(sculpture.group);
    movement = saved.setup.movement; revision = saved.revision;
    sculpture.group.traverse(object => { if (object.material?.map) object.material.map.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy()); });
    observer = new ResizeObserver(resize); observer.observe(stage);
    visibilityObserver = new IntersectionObserver(entries => { visible = entries[0].isIntersecting; previous = performance.now(); }); visibilityObserver.observe(stage);
    window.addEventListener('pointermove', move, { passive:true }); window.addEventListener('blur', leave);
    document.documentElement.addEventListener('pointerleave', leave); stage.addEventListener('keydown', keyboard);
    preference.addEventListener('change', preferenceChange);
    window.addEventListener('focus', refreshSetup); window.addEventListener('pageshow', refreshSetup);
    document.addEventListener('visibilitychange', refreshSetup);
    if (typeof BroadcastChannel !== 'undefined') { channel = new BroadcastChannel('kalium-motion'); channel.onmessage = refreshSetup; }
    sculpture.update(0, true, movement); renderer.compile(scene, camera); renderer.render(scene, camera); stage.classList.add('ready');
    renderer.setAnimationLoop(now => {
      const dt = Math.max(0,Math.min(.1,(now-previous)/1000)); previous = now;
      if (document.hidden || !visible) return;
      const r = stage.getBoundingClientRect();
      if (!paused) elapsed += dt;
      const within = pointer && pointer[0]>=r.left && pointer[0]<=r.right && pointer[1]>=r.top && pointer[1]<=r.bottom;
      const point = within ? imagePointFromClient(camera,r,...pointer) : null;
      sculpture.update(elapsed,false,movement,{point,radius:0.28,dt,paused});
      renderer.render(scene,camera);
    });
    canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); stage.classList.remove('ready'); hint.textContent = 'Emergence'; dispose(); });
  } catch(error) { console.error('Unable to start Emergence',error); stage.classList.remove('ready'); hint.textContent = 'Motion unavailable. Open Edit motion to retry.'; dispose(); }
}
window.addEventListener('pagehide', event => { if (!event.persisted) dispose(); });
start();
