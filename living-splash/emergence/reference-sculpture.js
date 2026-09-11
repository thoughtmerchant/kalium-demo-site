import * as THREE from 'three';

/**
 * Load an open-silhouette source-textured relief. Face-on it maps the original
 * image onto a 12 × 8 unit frame. Limit orbit to about ±8° for source fidelity.
 * @returns {Promise<{group:THREE.Group, update:Function, stats:object, dispose:Function}>}
 */
export async function createReferenceSculpture(baseUrl = './') {
  const asset = name => `${String(baseUrl).replace(/\/$/, '')}/${name}`;
  const response = await fetch(asset('reference-relief.json'));
  if (!response.ok) throw new Error(`Relief metadata could not load (${response.status}).`);
  const metadata = await response.json();
  const [binaryResponse, texture] = await Promise.all([
    fetch(asset(metadata.binary)),
    new THREE.TextureLoader().loadAsync(asset(metadata.texture)),
  ]);
  if (!binaryResponse.ok) {
    texture.dispose();
    throw new Error(`Relief geometry could not load (${binaryResponse.status}).`);
  }
  const buffer = await binaryResponse.arrayBuffer();
  const geometry = new THREE.BufferGeometry();
  for (const [name, def] of Object.entries(metadata.attributes)) {
    const ArrayType = { uint32: Uint32Array, uint16: Uint16Array, float32: Float32Array }[def.type];
    let data = new ArrayType(buffer, def.byteOffset, def.length);
    let normalized = Boolean(def.normalized);
    if (def.scale != null) {
      const factor = def.scale / (normalized ? 65535 : 1);
      data = Float32Array.from(data, value => value*factor);
      normalized = false;
    }
    const attribute = new THREE.BufferAttribute(data, def.itemSize, normalized);
    if (name === 'index') geometry.setIndex(attribute);
    else geometry.setAttribute(name, attribute);
  }
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.name = 'Source silhouette · indexed one-pixel surface';
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  const uniforms = {
    uReliefTime: { value: 0 },
    uReliefPointer: { value: new THREE.Vector3(0,0,0) },
    uReliefInfluence: { value: 0 },
  };
  const material = new THREE.MeshBasicMaterial({
    name: 'Unmodified botanical photograph',
    map: texture,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = `
      attribute float aFlex;
      attribute float aPhase;
      uniform float uReliefTime;
      uniform vec3 uReliefPointer;
      uniform float uReliefInfluence;
    ` + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `
      #include <begin_vertex>
      vec2 pointerDelta = transformed.xy - uReliefPointer.xy;
      float pointerDistance = length(pointerDelta);
      float proximity = exp(-pointerDistance*pointerDistance/0.48);
      vec2 away = pointerDelta / max(pointerDistance, 0.12);
      float breath = sin(uReliefTime*0.72+aPhase);
      transformed.xy += aFlex * vec2(breath*0.004, sin(uReliefTime*0.57+aPhase*1.13)*0.003);
      transformed.xy += aFlex * away * proximity * 0.040 * uReliefInfluence;
      transformed.z += aFlex * (breath*0.006 + proximity*0.025*uReliefInfluence);
    `);
  };
  material.customProgramCacheKey = () => 'emergence-reference-relief-v1';
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = metadata.stats.name;
  mesh.userData = { ...metadata.stats };
  const group = new THREE.Group();
  group.name = 'Emergence · photographic 3D relief';
  group.add(mesh);
  group.userData = { ...metadata.stats };
  let disposed = false;
  return {
    group,
    stats: metadata.stats,
    update(time, pointerLocal, influence = 0) {
      if (disposed) return;
      uniforms.uReliefTime.value = Number.isFinite(time) ? time : 0;
      if (pointerLocal && Number.isFinite(pointerLocal.x) && Number.isFinite(pointerLocal.y)) {
        uniforms.uReliefPointer.value.set(pointerLocal.x, pointerLocal.y, Number.isFinite(pointerLocal.z) ? pointerLocal.z : 0);
      }
      uniforms.uReliefInfluence.value = Number.isFinite(influence) ? THREE.MathUtils.clamp(influence, 0, 1) : 0;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      group.removeFromParent();
      geometry.dispose();
      material.dispose();
      texture.dispose();
    },
  };
}
