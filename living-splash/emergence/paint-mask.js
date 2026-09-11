export const MASK_WIDTH = 1536, MASK_HEIGHT = 1024;
const PIXELS = MASK_WIDTH * MASK_HEIGHT;
export const imagePixel = point => [(point[0] + 6) * 128, (4 - point[1]) * 128];

export function sanitizeMask(runs) {
  if (!Array.isArray(runs) || runs.length % 2 || runs.length > 262144) throw new Error('Invalid painted area');
  let end = 0;
  for (let i = 0; i < runs.length; i += 2) {
    const start = runs[i], length = runs[i + 1];
    if (!Number.isInteger(start) || !Number.isInteger(length) || start < end || length < 1 || start + length > PIXELS) throw new Error('Invalid painted area');
    end = start + length;
  }
  return runs.slice();
}
export function decodeMask(runs) {
  const data = new Uint8Array(PIXELS);
  for (let i = 0; i < runs.length; i += 2) data.fill(255, runs[i], runs[i] + runs[i + 1]);
  return data;
}
export function encodeMask(data) {
  const runs = [];
  for (let i = 0; i < PIXELS;) {
    if (!data[i]) { i++; continue; }
    const start = i;
    while (i < PIXELS && data[i]) i++;
    runs.push(start, i - start);
  }
  return sanitizeMask(runs);
}
/** Rasterize a continuous brush stroke at the source image's pixel resolution. */
export function paintSegment(data, from, to, diameter, erase = false) {
  const r = Math.max(0.5, diameter / 2), dx = to[0] - from[0], dy = to[1] - from[1], square = dx * dx + dy * dy;
  const x0 = Math.max(0, Math.floor(Math.min(from[0], to[0]) - r)), x1 = Math.min(MASK_WIDTH - 1, Math.ceil(Math.max(from[0], to[0]) + r));
  const y0 = Math.max(0, Math.floor(Math.min(from[1], to[1]) - r)), y1 = Math.min(MASK_HEIGHT - 1, Math.ceil(Math.max(from[1], to[1]) + r));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const u = square ? Math.max(0, Math.min(1, ((x + 0.5 - from[0]) * dx + (y + 0.5 - from[1]) * dy) / square)) : 0;
    if ((x + 0.5 - from[0] - u * dx) ** 2 + (y + 0.5 - from[1] - u * dy) ** 2 <= r * r) data[y * MASK_WIDTH + x] = erase ? 0 : 255;
  }
}
export function maskForRig(rig) {
  if (rig.mask !== undefined) return decodeMask(rig.mask);
  const data = new Uint8Array(PIXELS);
  for (let i = 1; i < rig.points.length; i++) paintSegment(data, imagePixel(rig.points[i - 1]), imagePixel(rig.points[i]), rig.radius * 256);
  return data;
}
export function maskAt(data, point) {
  const [px, py] = imagePixel(point), x = Math.floor(px), y = Math.floor(py);
  return x >= 0 && x < MASK_WIDTH && y >= 0 && y < MASK_HEIGHT ? data[y * MASK_WIDTH + x] / 255 : 0;
}
export function maskBounds(runs) {
  if (!runs.length) return null;
  let minX = MASK_WIDTH, maxX = 0, minY = MASK_HEIGHT, maxY = 0;
  for (let i = 0; i < runs.length; i += 2) {
    const first = runs[i], last = first + runs[i + 1] - 1, a = Math.floor(first / MASK_WIDTH), b = Math.floor(last / MASK_WIDTH);
    minY = Math.min(minY, a); maxY = Math.max(maxY, b);
    minX = Math.min(minX, a === b ? first % MASK_WIDTH : 0);
    maxX = Math.max(maxX, a === b ? last % MASK_WIDTH : MASK_WIDTH - 1);
  }
  return { minX: minX / 128 - 6, maxX: (maxX + 1) / 128 - 6, minY: 4 - (maxY + 1) / 128, maxY: 4 - minY / 128 };
}

/** Fill an even-odd polygon at pixel centers, including concave outlines. */
export function paintPolygon(data, points, erase = false) {
  if (points.length < 3) return 0;
  const y0 = Math.max(0, Math.ceil(Math.min(...points.map(p => p[1])) - 0.5));
  const y1 = Math.min(MASK_HEIGHT - 1, Math.floor(Math.max(...points.map(p => p[1])) - 0.5));
  let covered = 0;
  for (let y = y0; y <= y1; y++) {
    const scan = y + 0.5, cuts = [];
    for (let i = 0; i < points.length; i++) {
      const a = points[i], b = points[(i + 1) % points.length];
      if ((a[1] > scan) !== (b[1] > scan)) cuts.push(a[0] + (scan - a[1]) * (b[0] - a[0]) / (b[1] - a[1]));
    }
    cuts.sort((a, b) => a - b);
    for (let i = 0; i + 1 < cuts.length; i += 2) {
      const left = Math.max(0, Math.ceil(cuts[i] - 0.5)), right = Math.min(MASK_WIDTH, Math.ceil(cuts[i + 1] - 0.5));
      if (right > left) { data.fill(erase ? 0 : 255, y * MASK_WIDTH + left, y * MASK_WIDTH + right); covered += right - left; }
    }
  }
  return covered;
}
/** A small, softly fading hover halo without enlarging the selected moving area. */
export function nearbyMask(data, point, radius = 0.08) {
  if (maskAt(data, point)) return { point, strength: 1 };
  const [px, py] = imagePixel(point), r = Math.max(1, Math.min(12, radius * 128));
  let nearest = r * r, hit = null;
  for (let y = Math.max(0, Math.floor(py - r)); y <= Math.min(MASK_HEIGHT - 1, Math.ceil(py + r)); y++) {
    for (let x = Math.max(0, Math.floor(px - r)); x <= Math.min(MASK_WIDTH - 1, Math.ceil(px + r)); x++) {
      if (!data[y * MASK_WIDTH + x]) continue;
      const square = (x + 0.5 - px) ** 2 + (y + 0.5 - py) ** 2;
      if (square < nearest) { nearest = square; hit = [(x + 0.5) / 128 - 6, 4 - (y + 0.5) / 128]; }
    }
  }
  if (!hit) return null;
  const t = Math.sqrt(nearest) / r;
  return { point: hit, strength: 1 - t * t * (3 - 2 * t) };
}

/** Put a local root-to-tip spine in a selected shape that otherwise projects onto a fixed root. */
export function fitSpineToMask(rig) {
  if (!rig.mask?.length) return null;
  const data = decodeMask(rig.mask), originalRoot = imagePixel(rig.points[0]);
  let root = null, nearest = Infinity;
  for (let i = 0; i < data.length; i++) if (data[i]) {
    const p = [i % MASK_WIDTH + 0.5, Math.floor(i / MASK_WIDTH) + 0.5];
    const d = (p[0] - originalRoot[0]) ** 2 + (p[1] - originalRoot[1]) ** 2;
    if (d < nearest) { nearest = d; root = p; }
  }
  if (!root) return null;
  if (maskAt(data, rig.points[0])) root = originalRoot;
  let tip = root, farthest = 0;
  for (let i = 0; i < data.length; i++) if (data[i]) {
    const p = [i % MASK_WIDTH + 0.5, Math.floor(i / MASK_WIDTH) + 0.5];
    const d = (p[0] - root[0]) ** 2 + (p[1] - root[1]) ** 2;
    if (d > farthest) { farthest = d; tip = p; }
  }
  const length = Math.sqrt(farthest) / 128;
  if (length < 0.02) return null;
  const points = Array.from({ length: 5 }, (_, i) => [
    (root[0] + (tip[0] - root[0]) * i / 4) / 128 - 6,
    4 - (root[1] + (tip[1] - root[1]) * i / 4) / 128,
  ]);
  return { ...rig, points, radius: Math.max(0.025, Math.min(rig.radius, length * 0.15)) };
}
