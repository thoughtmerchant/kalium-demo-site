import * as THREE from 'three';

const imagePlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const hit = new THREE.Vector3();
const projected = new THREE.Vector3();

// A screen pixel must intersect the image plane. Unprojecting an arbitrary NDC
// depth and discarding Z gives a different XY when the camera is tilted.
export function imagePointFromClient(camera, rect, clientX, clientY) {
  if (!(rect.width > 0 && rect.height > 0)) return null;
  camera.updateMatrixWorld(true);
  pointer.set((clientX - rect.left) / rect.width * 2 - 1, 1 - (clientY - rect.top) / rect.height * 2);
  raycaster.setFromCamera(pointer, camera);
  return raycaster.ray.intersectPlane(imagePlane, hit) ? [hit.x, hit.y] : null;
}

export function imagePointToClient(camera, rect, point) {
  camera.updateMatrixWorld(true);
  projected.set(point[0], point[1], 0).project(camera);
  return [rect.left + (projected.x + 1) * rect.width / 2, rect.top + (1 - projected.y) * rect.height / 2];
}

export function createViewportController({ camera, controls, stage, renderer }) {
  let previousRect = null;
  const right = new THREE.Vector3(), up = new THREE.Vector3(), shift = new THREE.Vector3();
  function readRect() {
    const { left, top, width, height } = stage.getBoundingClientRect();
    return width > 0 && height > 0 ? { left, top, width, height } : null;
  }
  function applyFrustum(rect, height) {
    const width = height * rect.width / rect.height;
    camera.left = -width / 2; camera.right = width / 2;
    camera.top = height / 2; camera.bottom = -height / 2;
    camera.updateProjectionMatrix();
    renderer.setSize(rect.width, rect.height);
    previousRect = rect;
  }
  function clearInertia() {
    const damping = controls.enableDamping;
    controls.enableDamping = false;
    controls.update();
    controls.enableDamping = damping;
  }
  function fit() {
    const rect = readRect(); if (!rect) return;
    clearInertia();
    camera.zoom = 1;
    controls.target.set(0, 0, 0);
    camera.position.set(0, 0, 18);
    camera.up.set(0, 1, 0);
    applyFrustum(rect, Math.max(8 / 0.85, 12 / (rect.width / rect.height) / 0.94));
    controls.update(); camera.updateMatrixWorld(true);
  }
  function resize() {
    const rect = readRect(); if (!rect) return;
    if (!previousRect) { fit(); return; }
    const old = previousRect;
    if (rect.left === old.left && rect.top === old.top && rect.width === old.width && rect.height === old.height) return;
    camera.updateMatrixWorld(true);
    const oldHeight = camera.top - camera.bottom;
    const unitsPerPixel = oldHeight / (camera.zoom * old.height);
    const dx = rect.left + rect.width / 2 - old.left - old.width / 2;
    const dy = rect.top + rect.height / 2 - old.top - old.height / 2;
    right.setFromMatrixColumn(camera.matrixWorld, 0);
    up.setFromMatrixColumn(camera.matrixWorld, 1);
    shift.copy(right).multiplyScalar(dx * unitsPerPixel).addScaledVector(up, -dy * unitsPerPixel);
    camera.position.add(shift);
    controls.target.add(shift);
    // Keep both magnification and the image's screen position when the editor
    // panel changes the canvas bounds. Only the explicit Reset view fits again.
    applyFrustum(rect, oldHeight * rect.height / old.height);
    camera.updateMatrixWorld(true);
  }
  function faceForward() {
    clearInertia();
    const distance = camera.position.distanceTo(controls.target) || 18;
    camera.position.copy(controls.target).add(new THREE.Vector3(0, 0, distance));
    camera.up.set(0, 1, 0);
    controls.update(); camera.updateMatrixWorld(true);
  }
  return { fit, resize, faceForward };
}

/** Mouse-driven relief tilt around the current panned target, with no accumulated drift. */
export function applyPointerTilt(camera, target, rect, client, dt) {
  if (!(rect.width > 0 && rect.height > 0)) return;
  const x = client ? THREE.MathUtils.clamp((client[0] - rect.left) / rect.width * 2 - 1, -1, 1) : 0;
  const y = client ? THREE.MathUtils.clamp(1 - (client[1] - rect.top) / rect.height * 2, -1, 1) : 0;
  const offset = camera.position.clone().sub(target);
  const spherical = new THREE.Spherical().setFromVector3(offset);
  const blend = 1 - Math.exp(-4 * Math.max(0, Math.min(dt, 0.1)));
  spherical.theta += (x * 0.12 - spherical.theta) * blend;
  spherical.phi += (Math.PI / 2 - y * 0.07 - spherical.phi) * blend;
  camera.position.copy(target).add(offset.setFromSpherical(spherical));
  camera.lookAt(target);
  camera.updateMatrixWorld(true);
}
