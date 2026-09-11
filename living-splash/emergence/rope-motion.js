const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const smooth = x => { const t = clamp(x, 0, 1); return t * t * (3 - 2 * t); };

/** A curved, root-anchored chain with a separate damped bend at each segment. */
export function createRopeMotion(points, seed = 0) {
  const count = points.length - 1;
  const lengths = points.slice(1).map((p, i) => Math.hypot(p[0] - points[i][0], p[1] - points[i][1]));
  const total = lengths.reduce((a, b) => a + b, 0);
  const restAngles = points.slice(1).map((p, i) => Math.atan2(p[1] - points[i][1], p[0] - points[i][0]));
  let traveled = 0;
  const progress = lengths.map(length => { traveled += length; return traveled / total; });
  const flex = progress.map(t => Math.pow(t, 1.6));
  const angles = new Float64Array(count), velocities = new Float64Array(count), forces = new Float64Array(count);
  const gusts = new Float64Array(count);
  const posed = points.map(p => p.slice());
  let remainder = 0, activation = 0;
  function rebuild() {
    posed[0][0] = points[0][0]; posed[0][1] = points[0][1];
    for (let i = 0; i < count; i++) {
      posed[i + 1][0] = posed[i][0] + lengths[i] * Math.cos(restAngles[i] + angles[i]);
      posed[i + 1][1] = posed[i][1] + lengths[i] * Math.sin(restAngles[i] + angles[i]);
    }
  }
  function update({ time = 0, dt = 1 / 60, rest = false, paused = false, motion = 0.45, visibility = 50, pointer = null, pointerStrength = 1, radius = 0.1, speed = 1 } = {}) {
    if (rest || motion === 0) {
      angles.fill(0); velocities.fill(0); gusts.fill(0); remainder = 0; activation = 0;
      points.forEach((p, i) => { posed[i][0] = p[0]; posed[i][1] = p[1]; });
      return posed;
    }
    if (paused) return posed;
    const strength = clamp(motion, 0, 1.5) / 100 * clamp(visibility, 1, 100);
    const hasPointer = Array.isArray(pointer) && pointer.length === 2 && pointer.every(Number.isFinite);
    const reach = Math.max(0.025, radius) + total * 0.16;
    let distanceToChain = Infinity, hoverAlong = 0;
    if (hasPointer) {
      for (let i = 0; i < count; i++) {
        const a = points[i], b = points[i + 1], dx = b[0] - a[0], dy = b[1] - a[1];
        const u = clamp(((pointer[0] - a[0]) * dx + (pointer[1] - a[1]) * dy) / (lengths[i] * lengths[i]), 0, 1);
        const distance = Math.hypot(pointer[0] - a[0] - dx * u, pointer[1] - a[1] - dy * u);
        if (distance < distanceToChain) {
          distanceToChain = distance;
          hoverAlong = (i ? progress[i - 1] : 0) + u * lengths[i] / total;
        }
      }
    }
    // Hover near the root gives a small tug; the free end accepts a stronger push.
    activation = (1 - smooth((distanceToChain / reach - 0.35) / 0.65)) * clamp(Number.isFinite(pointerStrength) ? pointerStrength : 0, 0, 1);
    const inputStrength = activation * (0.06 + 0.94 * smooth(hoverAlong));
    remainder += clamp(Number.isFinite(dt) ? dt : 0, 0, 0.1);
    const step = 1 / 120;
    while (remainder + 1e-10 >= step) {
      const clock = Math.max(0, time - remainder + step) * clamp(speed, 0.5, 1.5);
      // Transport the tug outward instead of applying it to every joint at once.
      // Iterate backward so each joint reads its neighbor's previous step.
      for (let i = count - 1; i >= 0; i--) {
        const local = inputStrength * Math.exp(-0.5 * ((progress[i] - hoverAlong) / 0.16) ** 2);
        const incoming = i ? gusts[i - 1] * 0.98 : 0;
        const targetGust = Math.max(local, incoming);
        const rate = 0.85 / Math.max(0.05, lengths[i] / total);
        gusts[i] += (targetGust - gusts[i]) * (1 - Math.exp(-rate * step));
      }
      for (let i = 0; i < count; i++) {
        const t = progress[i];
        // A shared breeze direction, not repulsion from the cursor or root.
        const crosswind = -Math.sin(restAngles[i]) * 0.92 + Math.cos(restAngles[i]) * 0.38;
        const ambient = 0.65 * Math.sin(clock * 0.25 - t * 1.8)
          + 0.35 * Math.sin(clock * 0.39 + seed * 0.035 - t * 2.5);
        const tipFreedom = smooth((t - 0.55) / 0.45);
        const flutter = 0.65 * Math.sin(clock * 1.8 - t * 4.3)
          + 0.35 * Math.sin(clock * 2.7 + seed * 0.09 - t * 6.1);
        const gust = gusts[i] * (0.85 + 0.15 * Math.sin(clock * 0.7 - t * 2) + 0.6 * tipFreedom * flutter);
        // Nearly wind-aligned stems still give an unmistakable hover response.
        const hoverDirection = (crosswind < 0 ? -1 : 1) * Math.max(0.7, Math.abs(crosswind));
        const limit = 1.1 * flex[i];
        const drive = strength * flex[i] * (crosswind * 0.8 * ambient * smooth(clock / 3) + hoverDirection * 22 * gust);
        const target = limit * Math.tanh(drive / limit);
        const frequency = 3.4 - t * 1.4;
        // Neighboring bends transmit a local gust. Outer joints respond later.
        const left = i ? angles[i - 1] : 0;
        const right = i + 1 < count ? angles[i + 1] : angles[i];
        const coupling = 4 * (left + right - 2 * angles[i]);
        const damping = 1.85 - 0.7 * t;
        forces[i] = frequency * frequency * (target - angles[i]) + coupling - damping * frequency * velocities[i];
      }
      for (let i = 0; i < count; i++) {
        velocities[i] += forces[i] * step;
        const next = angles[i] + velocities[i] * step;
        angles[i] = clamp(next, -1.1 * flex[i], 1.1 * flex[i]);
        if (angles[i] !== next) velocities[i] = 0;
      }
      rebuild();
      remainder -= step;
    }
    return posed;
  }
  return { update, get activation() { return activation; } };
}
