import { createBirdRenderer, visitPose, VISIT_DURATION, BIRD_SCALE } from './hummingbird-motion.js';

const image = document.querySelector('.home-page .botanical-image');
const sculpture = image.closest('.sculpture');
const trigger = sculpture.querySelector('.flower-invite');
const canvas = document.querySelector('.hummingbird-flight');
const ctx = canvas.getContext('2d');
const status = document.querySelector('.flower-status');
let renderer, loading, pending = false, running = false, frameId;
let width, height, ratio, flower, birdSize, elapsed = 0, previous;

function layout() {
  const rect = image.getBoundingClientRect();
  const parent = sculpture.getBoundingClientRect();
  if (!image.naturalWidth || !rect.width || !rect.height) return;
  // Account for the empty space introduced by object-fit: contain.
  const scale = Math.min(rect.width / image.naturalWidth, rect.height / image.naturalHeight);
  const artWidth = image.naturalWidth * scale;
  const artHeight = image.naturalHeight * scale;
  flower = {
    x: rect.left + (rect.width - artWidth) / 2 + artWidth * .385,
    y: rect.top + (rect.height - artHeight) / 2 + artHeight * .128
  };
  birdSize = Math.min(146, Math.max(85, artWidth * .17)) * BIRD_SCALE;
  trigger.style.left = `${flower.x - parent.left}px`;
  trigger.style.top = `${flower.y - parent.top}px`;
  trigger.hidden = false;
}

function resize() {
  width = document.documentElement.clientWidth;
  height = window.innerHeight;
  ratio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  layout();
  if (running) draw();
}

async function ready() {
  if (renderer) return;
  if (!loading) {
    loading = createBirdRenderer().then(value => { renderer = value; });
    loading.catch(() => { loading = null; });
  }
  await loading;
}

function draw() {
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, width, height);
  const pose = visitPose(elapsed, flower, birdSize, width);
  renderer(ctx, pose.x, pose.y, birdSize, pose.dip, pose.opacity, elapsed);
  canvas.dataset.phase = pose.phase;
}

function finish() {
  running = false;
  cancelAnimationFrame(frameId);
  canvas.hidden = true;
  canvas.dataset.phase = 'idle';
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

function animate(now) {
  if (!running) return;
  if (previous !== undefined && !document.hidden) elapsed += Math.min((now - previous) / 1000, .05);
  previous = now;
  if (elapsed >= VISIT_DURATION) { finish(); return; }
  draw();
  frameId = requestAnimationFrame(animate);
}

async function invite() {
  // A first tap waits for the frames, then plays; it is never discarded while loading.
  if (pending || running) return;
  pending = true;
  trigger.setAttribute('aria-busy', 'true');
  status.textContent = '';
  try {
    await ready();
    resize();
    elapsed = 0;
    previous = undefined;
    running = true;
    canvas.hidden = false;
    draw();
    frameId = requestAnimationFrame(animate);
  } catch (error) {
    status.textContent = 'The hummingbird could not load. Tap the flower to try again.';
    console.error(error);
  } finally {
    pending = false;
    trigger.removeAttribute('aria-busy');
  }
}

trigger.addEventListener('click', invite);
trigger.addEventListener('contextmenu', event => { event.preventDefault(); invite(); });
trigger.addEventListener('pointerenter', () => { ready().catch(() => {}); });
trigger.addEventListener('focus', () => { ready().catch(() => {}); });
image.addEventListener('load', resize);
new ResizeObserver(resize).observe(sculpture);
window.addEventListener('resize', resize);
window.addEventListener('scroll', layout, { passive: true });
window.addEventListener('pagehide', finish);
document.addEventListener('visibilitychange', () => { previous = undefined; });
resize();
// Preparing the wing/head frames is expensive on phones; leave the entrance clear.
function warmFrames() {
  if ('requestIdleCallback' in window) requestIdleCallback(() => { ready().catch(() => {}); }, { timeout: 2000 });
  else setTimeout(() => { ready().catch(() => {}); }, 1000);
}
if (document.documentElement.matches('.home-intro-pending,.home-intro-playing')) {
  window.addEventListener('kalium:intro-complete', warmFrames, { once: true });
} else warmFrames();
