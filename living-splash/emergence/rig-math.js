import { sanitizeMask } from './paint-mask.js';
/** Pure world-space math for a 12 × 8 image and small drawn tendril rigs. */
const EPSILON = 1e-6;
const MAX_POINTS = 12;
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const finite = (value, fallback) => Number.isFinite(value) ? value : fallback;
const smoothstep = value => { const t = clamp(value, 0, 1); return t * t * (3 - 2 * t); };

function cleanPoints(input, constrain = false) {
  if (!Array.isArray(input)) return [];
  const points = [];
  let lastValid = null;
  for (const point of input) {
    if (!Array.isArray(point) || !Number.isFinite(point[0]) || !Number.isFinite(point[1])) continue;
    const next = constrain
      ? [clamp(point[0], -6, 6), clamp(point[1], -4, 4)]
      : [point[0], point[1]];
    lastValid = next;
    const previous = points[points.length - 1];
    if (!previous || Math.hypot(next[0] - previous[0], next[1] - previous[1]) > EPSILON) points.push(next);
  }
  // Preserve the actual final endpoint when a trailing near-duplicate was skipped.
  if (points.length > 1 && lastValid) points[points.length - 1] = lastValid;
  return points;
}

function pathLength(points) {
  let length = 0;
  for (let i = 1; i < points.length; i++) length += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
  return length;
}

/** Even arc-length samples; returns no more samples than input or maxPoints.
 * Nondegenerate strokes preserve both endpoints. Degenerate strokes collapse.
 */
export function resampleStroke(input, maxPoints = 10) {
  const points = cleanPoints(input);
  if (points.length < 2) return points;
  const count = Math.min(points.length, clamp(Math.floor(finite(maxPoints, 10)), 2, MAX_POINTS));
  const lengths = [0];
  for (let i = 1; i < points.length; i++) lengths.push(lengths[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]));
  const length = lengths[lengths.length - 1];
  if (!(length > EPSILON) || !Number.isFinite(length)) return [points[0]];
  const result = [points[0].slice()];
  let segment = 0;
  for (let i = 1; i < count - 1; i++) {
    const target = length * i / (count - 1);
    while (segment < points.length - 2 && lengths[segment + 1] < target) segment++;
    const span = lengths[segment + 1] - lengths[segment];
    const t = span > EPSILON ? (target - lengths[segment]) / span : 0;
    const a = points[segment], b = points[segment + 1];
    result.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
  }
  result.push(points[points.length - 1].slice());
  return result;
}

/** Strict persisted shape: {id,name,points,radius,motion,speed}; motion is percent. */
export function sanitizeRigs(input) {
  if (!Array.isArray(input)) return [];
  const result = [], ids = new Set();
  for (const source of input) {
    if (result.length >= 8) break;
    if (!source || typeof source !== 'object' || Array.isArray(source)) continue;
    let points = cleanPoints(source.points, true);
    if (points.length > MAX_POINTS) points = resampleStroke(points, MAX_POINTS);
    if (points.length < 2 || !(pathLength(points) > EPSILON)) continue;
    const ordinal = result.length + 1;
    const baseId = typeof source.id === 'string' ? source.id.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40) : '';
    let id = baseId || `drawn-rig-${ordinal}`, suffix = 2;
    while (ids.has(id)) id = `${baseId || `drawn-rig-${ordinal}`}-${suffix++}`;
    ids.add(id);
    const name = typeof source.name === 'string'
      ? source.name.replace(/[^\p{L}\p{N} ._()-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 60)
      : '';
    result.push({
      id, name: name || `Tendril ${ordinal}`, points,
      radius: clamp(finite(source.radius, 0.18), 0.025, 0.45),
      motion: clamp(finite(source.motion, 0.35), 0, 1.5),
      speed: clamp(finite(source.speed, 1), 0.5, 1.5),
      ...(source.mask !== undefined ? { mask: sanitizeMask(source.mask) } : {}),
    });
  }
  return result;
}

/** Nearest projection. along is normalized arc length; distance/length are world units.
 * Call with sanitized points to keep segment indices aligned with skeleton joints.
 */
export function evaluateInfluence(x, y, input, radius) {
  const points = cleanPoints(input);
  const empty = { weight: 0, along: 0, segment: -1, t: 0, distance: Infinity, length: 0 };
  if (!Number.isFinite(x) || !Number.isFinite(y) || points.length < 2) return empty;
  const length = pathLength(points);
  if (!(length > EPSILON) || !Number.isFinite(length)) return empty;
  let distance = Infinity, segment = -1, nearestT = 0, nearestAlong = 0, traveled = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1];
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const segmentLength = Math.hypot(dx, dy);
    if (!(segmentLength > EPSILON)) continue;
    const t = clamp(((x - a[0]) * dx + (y - a[1]) * dy) / (segmentLength * segmentLength), 0, 1);
    const nextDistance = Math.hypot(x - (a[0] + dx * t), y - (a[1] + dy * t));
    if (nextDistance < distance) {
      distance = nextDistance; segment = i; nearestT = t; nearestAlong = traveled + segmentLength * t;
    }
    traveled += segmentLength;
  }
  const along = clamp(nearestAlong / length, 0, 1);
  // The inner painted area follows its bones fully; only the outer edge fades.
  const radial = Number.isFinite(radius) && radius > 0 ? 1 - smoothstep((distance / radius - 0.45) / 0.55) : 0;
  return { weight: radial * smoothstep(along / 0.15), along, segment, t: nearestT, distance, length };
}

/** Flex grows with distance from the root, regardless of joint spacing. */
export function chainFlex(points) {
  const length = pathLength(points);
  let traveled = 0;
  return points.slice(1).map((point, i) => {
    traveled += Math.hypot(point[0] - points[i][0], point[1] - points[i][1]);
    return length > EPSILON ? Math.pow(traveled / length, 1.6) : 0;
  });
}

/** Root-fixed, length-preserving joint poses with no vertex mutation.
 * Each segment's absolute angular deviation is <= motionPercent * visibility / 100 radians.
 * Since a rotated vector moves <= segmentLength * abs(angle), triangle inequality
 * bounds every tip displacement by chainLength * motionPercent * visibility / 100.
 */
export function chainPose(input, time, motionPercent = 0.35, speed = 1, seed = 0, visibility = 1) {
  const points = cleanPoints(input);
  if (points.length < 2) return points;
  const budget = clamp(finite(motionPercent, 0), 0, 1.5) / 100 * clamp(finite(visibility, 1), 1, 100);
  if (budget === 0) return points;
  const effectiveSpeed = clamp(finite(speed, 1), 0.5, 1.5) * 0.65;
  // The two frequencies share a 200π period; reduce before multiplication.
  const clock = (finite(time, 0) % (200 * Math.PI / effectiveSpeed)) * effectiveSpeed;
  const phase = finite(seed, 0) % (2 * Math.PI);
  const posed = [points[0].slice()];
  const flex = chainFlex(points);
  for (let i = 1; i < points.length; i++) {
    const progress = i / (points.length - 1);
    const delay = progress * 1.15;
    const wave = 0.66 * Math.sin(clock * 0.38 + phase - delay)
      + 0.34 * Math.sin(clock * 0.61 + phase * 1.7 - delay * 1.4);
    const angle = budget * flex[i - 1] * wave;
    const cos = Math.cos(angle), sin = Math.sin(angle);
    const dx = points[i][0] - points[i - 1][0], dy = points[i][1] - points[i - 1][1];
    const previous = posed[i - 1];
    posed.push([previous[0] + dx * cos - dy * sin, previous[1] + dx * sin + dy * cos]);
  }
  return posed;
}
