import * as THREE from 'three';
import { MASK_WIDTH, MASK_HEIGHT } from './paint-mask.js';

/** Clip by original image pixels, not by interpolated bone weights at triangle corners. */
export function createSelectionSurface(mesh) {
  const pixels = new Uint8Array(MASK_WIDTH * MASK_HEIGHT);
  const texture = new THREE.DataTexture(pixels, MASK_WIDTH, MASK_HEIGHT, THREE.RedFormat);
  texture.flipY = false;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  const enabled = { value: false };
  function clip(material, inside) {
    material.onBeforeCompile = shader => {
      shader.uniforms.uSelection = { value: texture };
      shader.uniforms.uSelectionEnabled = enabled;
      shader.vertexShader = 'varying vec2 vSelectionUv;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `
        #include <begin_vertex>
        vSelectionUv = vec2((position.x + 6.0) / 12.0, (4.0 - position.y) / 8.0);
      `);
      shader.fragmentShader = 'uniform sampler2D uSelection;\nuniform bool uSelectionEnabled;\nvarying vec2 vSelectionUv;\n' + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace('#include <clipping_planes_fragment>', `
        #include <clipping_planes_fragment>
        if (uSelectionEnabled) {
          bool selectedPixel = texture2D(uSelection, vSelectionUv).r > 0.5;
          if (${inside ? '!selectedPixel' : 'selectedPixel'}) discard;
        }
      `);
    };
    material.customProgramCacheKey = () => `emergence-exact-selection-${inside ? 'inside' : 'outside'}-v1`;
    material.needsUpdate = true;
  }
  const geometry = new THREE.BufferGeometry();
  // Share the original surface buffers; only the outside skin weights differ.
  for (const [name, attribute] of Object.entries(mesh.geometry.attributes)) geometry.setAttribute(name, attribute);
  geometry.setIndex(mesh.geometry.index);
  const weights = new Float32Array(mesh.geometry.attributes.skinWeight.array.length);
  geometry.setAttribute('skinWeight', new THREE.BufferAttribute(weights, 4));
  const material = mesh.material.clone();
  const outside = new THREE.SkinnedMesh(geometry, material);
  outside.name = 'Image outside the exact selected pixels';
  outside.frustumCulled = false;
  outside.visible = false;
  outside.renderOrder = 0;
  mesh.renderOrder = 1;
  clip(mesh.material, true); clip(material, false);
  return {
    outside,
    update(chains, owners) {
      pixels.fill(0);
      let any = false;
      for (const chain of chains) if (chain.mask) {
        for (let i = 0; i < pixels.length; i++) if (chain.mask[i]) { pixels[i] = 255; any = true; }
      }
      texture.needsUpdate = true;
      enabled.value = any; outside.visible = any;
      weights.set(mesh.geometry.attributes.skinWeight.array);
      // The outside image may keep other automatic rigs, but selected rigs cannot pull it.
      for (let i = 0; i < owners.length; i++) if (owners[i] >= 0 && chains[owners[i]].mask) {
        const slot = i * 4;
        weights[slot] = 1; weights[slot + 1] = 0; weights[slot + 2] = 0; weights[slot + 3] = 0;
      }
      geometry.attributes.skinWeight.needsUpdate = true;
      outside.bind(mesh.skeleton, mesh.bindMatrix);
    },
    dispose() { texture.dispose(); geometry.dispose(); material.dispose(); outside.removeFromParent(); },
  };
}
