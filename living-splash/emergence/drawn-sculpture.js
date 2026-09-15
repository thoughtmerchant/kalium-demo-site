import * as THREE from 'three';
import { createReferenceSculpture } from './reference-sculpture.js';
import { sanitizeRigs, evaluateInfluence } from './rig-math.js';
import { createRopeMotion } from './rope-motion.js';
import { createSelectionSurface } from './selection-surface.js';
import { decodeMask, maskAt, maskBounds, nearbyMask } from './paint-mask.js';

export async function createDrawnSculpture(baseUrl = './') {
  const reference = await createReferenceSculpture(baseUrl);
  const group = reference.group;
  const source = group.children[0];
  const geometry = source.geometry;
  const positions = geometry.attributes.position;
  geometry.deleteAttribute('aFlex');
  geometry.deleteAttribute('aPhase');
  source.material.onBeforeCompile = () => {};
  source.material.customProgramCacheKey = () => 'emergence-user-bones-v1';
  source.material.needsUpdate = true;
  source.removeFromParent();
  const mesh = new THREE.SkinnedMesh(geometry, source.material);
  mesh.name = 'Original photograph with user-drawn tendril skeletons';
  mesh.frustumCulled = false;
  group.add(mesh);
  const indices = new Uint16Array(positions.count * 4);
  const weights = new Float32Array(positions.count * 4);
  const strengths = new Float32Array(positions.count);
  const owners = new Int16Array(positions.count);
  geometry.setAttribute('skinIndex', new THREE.BufferAttribute(indices, 4));
  geometry.setAttribute('skinWeight', new THREE.BufferAttribute(weights, 4));
  const selectionSurface = createSelectionSurface(mesh);
  group.add(selectionSurface.outside);
  const cellSize = 0.125;
  const cellX = x => Math.floor((x + 6) / cellSize);
  const cellY = y => Math.floor((y + 4) / cellSize);
  const key = (x, y) => x + y * 1024;
  const grid = new Map();
  for (let i = 0; i < positions.count; i++) {
    const k = key(cellX(positions.getX(i)), cellY(positions.getY(i)));
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(i);
  }
  function depthAt(point) {
    let nearest = Infinity, depth = 0;
    const cx = cellX(point[0]), cy = cellY(point[1]);
    for (let x = cx - 2; x <= cx + 2; x++) for (let y = cy - 2; y <= cy + 2; y++) {
      for (const i of grid.get(key(x, y)) || []) {
        const distance = (positions.getX(i) - point[0]) ** 2 + (positions.getY(i) - point[1]) ** 2;
        if (distance < nearest) { nearest = distance; depth = positions.getZ(i); }
      }
    }
    return depth;
  }
  let rigs = [], chains = [], disposed = false;
  let fixedRoot;
  const stats = { vertices: positions.count, triangles: geometry.index.count / 3, movingVertices: 0, rigs: [], breezeActive: false };
  function setRigs(input) {
    if (disposed) return stats;
    rigs = sanitizeRigs(input);
    mesh.skeleton?.dispose();
    if (fixedRoot) mesh.remove(fixedRoot);
    fixedRoot = new THREE.Bone();
    fixedRoot.name = 'Stationary specimen';
    mesh.add(fixedRoot);
    const allBones = [fixedRoot];
    chains = rigs.map((rig, ri) => {
      const points = rig.points.map(point => new THREE.Vector3(point[0], point[1], depthAt(point)));
      const offset = allBones.length;
      const bones = points.map((point, index) => {
        const bone = new THREE.Bone();
        bone.name = `${rig.id}_joint_${index}`;
        bone.position.copy(index ? point.clone().sub(points[index - 1]) : point);
        return bone;
      });
      bones.forEach((bone, index) => (index ? bones[index - 1] : fixedRoot).add(bone));
      allBones.push(...bones);
      return { rig, bones, offset, mask: rig.mask !== undefined ? decodeMask(rig.mask) : null, rope: createRopeMotion(rig.points, ri * 17 + 3), index: ri, affected: 0, selectedVertices: 0, maxBindingWeight: 0 };
    });
    indices.fill(0); weights.fill(0); strengths.fill(0); owners.fill(-1);
    for (let i = 0; i < positions.count; i++) weights[i * 4] = 1;
    const rootPins = rigs.map(rig => ({ point: rig.points[0], radius: Math.min(rig.radius, 0.06) }));
    for (const chain of chains) {
      const { rig, offset } = chain;
      const paintedBounds = rig.mask !== undefined ? maskBounds(rig.mask) : null;
      if (chain.mask && !paintedBounds) continue;
      const xs = rig.points.map(p => p[0]), ys = rig.points.map(p => p[1]);
      const minX = cellX(paintedBounds ? paintedBounds.minX : Math.min(...xs) - rig.radius), maxX = cellX(paintedBounds ? paintedBounds.maxX : Math.max(...xs) + rig.radius);
      const minY = cellY(paintedBounds ? paintedBounds.minY : Math.min(...ys) - rig.radius), maxY = cellY(paintedBounds ? paintedBounds.maxY : Math.max(...ys) + rig.radius);
      for (let x = minX; x <= maxX; x++) for (let y = minY; y <= maxY; y++) {
        for (const vertex of grid.get(key(x, y)) || []) {
          const x = positions.getX(vertex), y = positions.getY(vertex);
          if (chain.mask && !maskAt(chain.mask, [x, y])) continue;
          const field = evaluateInfluence(x, y, rig.points, chain.mask ? 1000000 : rig.radius);
          if (chain.mask) chain.selectedVertices++;
          chain.maxBindingWeight = Math.max(chain.maxBindingWeight, field.weight);
          // A crossing chain must not pull another chain's photographed base.
          for (const pin of rootPins) {
            const distance = Math.hypot(positions.getX(vertex) - pin.point[0], positions.getY(vertex) - pin.point[1]);
            field.weight *= THREE.MathUtils.smoothstep(distance, 0.008, pin.radius);
          }
          if (field.weight <= strengths[vertex]) continue;
          strengths[vertex] = field.weight;
          const slot = vertex * 4;
          indices[slot] = 0;
          indices[slot + 1] = offset + field.segment;
          indices[slot + 2] = offset + field.segment + 1;
          weights[slot] = 1 - field.weight;
          weights[slot + 1] = field.weight * (1 - field.t);
          weights[slot + 2] = field.weight * field.t;
          owners[vertex] = chain.index;
        }
      }
    }
    geometry.attributes.skinIndex.needsUpdate = true;
    geometry.attributes.skinWeight.needsUpdate = true;
    group.updateMatrixWorld(true);
    mesh.bind(new THREE.Skeleton(allBones));
    selectionSurface.update(chains, owners);
    stats.movingVertices = 0;
    for (const owner of owners) if (owner >= 0) { chains[owner].affected++; stats.movingVertices++; }
    stats.rigs = chains.map(chain => ({ id: chain.rig.id, affected: chain.affected, bones: chain.bones.length, selectedVertices: chain.selectedVertices, maxBindingWeight: chain.maxBindingWeight }));
    return stats;
  }
  function update(time = 0, rest = false, visibility = 1, interaction = {}) {
    if (disposed) return;
    stats.breezeActive = false;
    for (const chain of chains) {
      const { rig, bones, rope } = chain;
      let pointer = chain.affected ? interaction.point : null, pointerStrength = 1;
      if (chain.mask && pointer) {
        const hit = nearbyMask(chain.mask, pointer, Math.max(0.04, interaction.radius || 0.08));
        if (!hit) pointer = null;
        else {
          pointerStrength = hit.strength;
          const field = evaluateInfluence(hit.point[0], hit.point[1], rig.points, 1000000);
          const a = rig.points[field.segment], b = rig.points[field.segment + 1];
          pointer = [a[0] + (b[0] - a[0]) * field.t, a[1] + (b[1] - a[1]) * field.t];
        }
      }
      const posed = rope.update({
        time, rest, visibility, motion: rig.motion, speed: rig.speed,
        dt: interaction.dt, paused: interaction.paused,
        pointer, pointerStrength,
        radius: rig.radius + Math.max(0, interaction.radius || 0),
      });
      if (!rest && !interaction.paused && rope.activation > 0.05) stats.breezeActive = true;
      let previousDelta = 0;
      for (let j = 0; j < bones.length - 1; j++) {
        const a = rig.points[j], b = rig.points[j + 1];
        const pa = posed[j], pb = posed[j + 1];
        const delta = Math.atan2(pb[1] - pa[1], pb[0] - pa[0]) - Math.atan2(b[1] - a[1], b[0] - a[0]);
        const normalized = Math.atan2(Math.sin(delta), Math.cos(delta));
        bones[j].rotation.z = normalized - previousDelta;
        previousDelta = normalized;
      }
      bones[bones.length - 1].rotation.z = 0;
    }
    group.updateMatrixWorld(true);
  }
  setRigs([]);
  group.name = 'Emergence · draw what moves';
  return { group, mesh, stats, setRigs, update, getRigs: () => structuredClone(rigs), dispose() {
    if (disposed) return;
    disposed = true;
    mesh.skeleton?.dispose();
    grid.clear();
    selectionSurface.dispose();
    reference.dispose();
  } };
}
