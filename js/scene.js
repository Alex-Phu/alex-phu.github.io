/* The 3D room: renderers, model loading, camera, glow outlines and hotspot picking.
   main.js owns the page state ('boot', 'overview', 'focus', 'monitor') and passes it in. */
import * as THREE from 'three';
import { CSS3DRenderer, CSS3DObject } from 'three/addons/renderers/CSS3DRenderer.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

const V3 = THREE.Vector3;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

let renderer, css, scene, camera, osObj;
const spotMeshes = []; // every mesh the pointer can hit
const solids = []; // every visible surface in the room, clickable or not
const hitBoxes = []; // invisible padded boxes around clickable meshes (see addHitBoxes)
const meshesById = {}; // spot id -> its meshes
export const ndc = new THREE.Vector2(9, 9); // pointer position, set by main.js

/* ---------- Renderers ---------- */
// Throws if the browser has no WebGL.
export function initScene(spotIds, stage) {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  renderer.setClearColor(0xdcd8d1, 1);
  renderer.toneMapping = THREE.NoToneMapping; // lighting is baked into the textures
  css = new CSS3DRenderer();
  // Focusing or scrolling to something inside AlexOS would otherwise scroll this clipped layer
  // and slide the whole desktop off the monitor.
  const layer = css.domElement;
  layer.style.overflow = 'clip';
  layer.addEventListener('scroll', () => { layer.scrollTop = 0; layer.scrollLeft = 0; });
  stage.append(css.domElement, renderer.domElement);
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(35, 1, 1, 3000);
  for (const id of spotIds) meshesById[id] = [];
}

/* ---------- Scene (units: centimeters) ---------- */
function tagMesh(o, id) {
  o.userData.spot = id; spotMeshes.push(o);
  meshesById[id].push(o);
}
// where AlexOS sits; useDesk() replaces this with the model's 'screen' plane
const SCREEN = { center: new V3(0, 104, -17.4), w: 54, h: 33.75 };

/* ---------- AlexOS on the monitor ---------- */
export function addOS(el) {
  osObj = new CSS3DObject(el);
  scene.add(osObj);
  placeOS();
}
function placeOS() {
  osObj.position.copy(SCREEN.center);
  osObj.scale.setScalar(SCREEN.w / 960);
}

/* ---------- Baked model from Blender ---------- */
// Downloads the baked room. onProgress gets 0..1 as the bytes arrive.
const DESK_URL = 'assets/desk.glb';
// Uncompressed size of desk.glb. GitHub Pages sends the file gzipped, so the reported total is the
// smaller compressed size while the loaded count is uncompressed bytes; never divide by less than this.
const DESK_BYTES = 2252420;
export function loadDesk(onProgress) {
  return new Promise((resolve, reject) => {
    new GLTFLoader().load(DESK_URL, resolve, (e) => {
      const total = Math.max(e.lengthComputable ? e.total : 0, DESK_BYTES);
      onProgress(Math.min(0.99, e.loaded / total)); // 100% once the model is decoded
    }, reject);
  }).then((gltf) => { onProgress(1); return gltf; });
}
export function useDesk(gltf) {
  const root = gltf.scene;
  root.scale.setScalar(100); // Blender meters to scene centimeters
  scene.add(root);
  root.updateMatrixWorld(true);
  const shared = new Map();
  const aniso = renderer.capabilities.getMaxAnisotropy();
  root.traverse((o) => {
    if (!o.isMesh) return;
    if (o.name === 'sky') { o.material = new THREE.MeshBasicMaterial({ color: 0xeef4f8 }); return; }
    if (o.name === 'screen') {
      const b = new THREE.Box3().setFromObject(o);
      b.getCenter(SCREEN.center);
      const size = b.getSize(new V3());
      SCREEN.w = size.x; SCREEN.h = size.y;
      o.material = new THREE.MeshBasicMaterial({ color: 0x000000, opacity: 0, blending: THREE.NoBlending, toneMapped: false });
      tagMesh(o, 'computer');
      return;
    }
    let m = shared.get(o.material);
    if (!m) {
      const map = o.material.map;
      if (map) { map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = aniso; }
      m = map ? new THREE.MeshBasicMaterial({ map }) : new THREE.MeshBasicMaterial({ color: 0xd9d4cc });
      shared.set(o.material, m);
    }
    const id = o.name.split('_')[0];
    if (meshesById[id]) { o.material = m.clone(); tagMesh(o, id); } else o.material = m;
  });
  root.traverse((o) => { if (o.isMesh && o.name !== 'sky') solids.push(o); });
  addHitBoxes();
  placeOS();
}

// Thin objects like the racket (frame and strings) were hard to hit exactly, so each clickable mesh
// also gets an invisible box around it, padded by HIT_PAD. The box only counts when nothing solid
// is in front of it (see pick), so the chair still blocks the tower behind it.
const HIT_PAD = 2; // cm
function addHitBoxes() {
  for (const [id, meshes] of Object.entries(meshesById)) {
    for (const m of meshes) {
      if (m.name === 'screen') continue; // the monitor itself already covers it
      const b = new THREE.Box3().setFromObject(m).expandByScalar(HIT_PAD);
      const box = new THREE.Mesh(new THREE.BoxGeometry(...b.getSize(new V3()).toArray()), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
      b.getCenter(box.position);
      box.visible = false; // never drawn; the raycaster still tests it
      box.userData.spot = id;
      box.updateMatrixWorld(true);
      hitBoxes.push(box);
    }
  }
}

/* ---------- Glow outlines on clickable objects ---------- */
// A slightly inflated back-facing copy of each object, pushed out a few pixels in screen space,
// draws as a soft outline around its silhouette.
const GLOW_SKIP = new Set(['screen', 'computer_keyboard', 'computer_mouse']);
const glowRes = new THREE.Vector2(innerWidth, innerHeight);
const glowMats = {};
function makeGlowMat() {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(0x14b8a6) }, uAlpha: { value: 0.5 }, uWidth: { value: 3.0 }, uRes: { value: glowRes } },
    vertexShader: `
      uniform float uWidth; uniform vec2 uRes;
      void main() {
        vec4 clip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        vec2 dir = (projectionMatrix * vec4(normalize(normalMatrix * normal), 0.0)).xy;
        float l = length(dir);
        if (l > 1e-5) dir /= l;
        clip.xy += dir * uWidth * 2.0 / uRes * clip.w;
        gl_Position = clip;
      }`,
    fragmentShader: `
      uniform vec3 uColor; uniform float uAlpha;
      void main() {
        gl_FragColor = vec4(uColor, uAlpha);
        #include <colorspace_fragment>
      }`,
    side: THREE.BackSide, transparent: true, depthWrite: false,
  });
}
// Outline only the solid parts: hair-thin pieces (racket strings, filament) would each get
// their own outline and fill the area with color, so connected pieces thinner than MIN_PART are dropped.
const MIN_PART = 0.003; // meters, in the model's own units
function hullGeometry(g) {
  let h = g.clone();
  for (const k of Object.keys(h.attributes)) if (k !== 'position') h.deleteAttribute(k);
  h = mergeVertices(h, 1e-4);
  const idx = h.index.array, pos = h.attributes.position.array, nv = pos.length / 3;
  const parent = new Int32Array(nv).map((_, i) => i);
  const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  for (let i = 0; i < idx.length; i += 3) {
    const a = find(idx[i]), b = find(idx[i + 1]), c = find(idx[i + 2]);
    parent[b] = a; parent[find(c)] = a;
  }
  const lo = new Map(), hi = new Map();
  for (let v = 0; v < nv; v++) {
    const r = find(v), x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
    if (!lo.has(r)) { lo.set(r, [x, y, z]); hi.set(r, [x, y, z]); continue; }
    const l = lo.get(r), u = hi.get(r);
    l[0] = Math.min(l[0], x); l[1] = Math.min(l[1], y); l[2] = Math.min(l[2], z);
    u[0] = Math.max(u[0], x); u[1] = Math.max(u[1], y); u[2] = Math.max(u[2], z);
  }
  const keep = (r) => { const l = lo.get(r), u = hi.get(r); return Math.min(u[0] - l[0], u[1] - l[1], u[2] - l[2]) >= MIN_PART; };
  const kept = [];
  for (let i = 0; i < idx.length; i += 3) if (keep(find(idx[i]))) kept.push(idx[i], idx[i + 1], idx[i + 2]);
  h.setIndex(kept);
  h.computeVertexNormals();
  return h;
}
export function addGlows() {
  for (const id of Object.keys(meshesById)) {
    const mat = glowMats[id] = makeGlowMat();
    for (const m of meshesById[id]) {
      if (GLOW_SKIP.has(m.name) || !m.geometry) continue;
      const hull = new THREE.Mesh(hullGeometry(m.geometry), mat);
      hull.renderOrder = 2;
      hull.raycast = () => {};
      m.add(hull);
    }
  }
}
function updateGlows(t, { state, focusId, hovered }) {
  const pulse = reduceMotion ? 0.5 : 0.5 + 0.5 * Math.sin(t * 2.4);
  const phone = innerWidth < 700;
  for (const [id, mat] of Object.entries(glowMats)) {
    let a = 0.22 + 0.4 * pulse;
    if (state === 'boot' || state === 'monitor' || id === focusId) a = 0;
    else if (id === hovered) a = 0.95;
    else if (state === 'focus') a *= 0.5;
    mat.uniforms.uAlpha.value = a;
    mat.uniforms.uWidth.value = id === hovered ? (phone ? 3.5 : 4.5) : (phone ? 2.5 : 3.0);
    mat.visible = a > 0.01;
  }
}

/* ---------- Camera ---------- */
const VIEWS = {
  loading: { pos: new V3(900, 760, 1000), tgt: new V3(0, 40, 0) },
  overview: { pos: new V3(290, 220, 390), tgt: new V3(5, 88, -5) },
};
// distance needed so a region halfW wide fits the screen horizontally
function fitDist(halfW) {
  return halfW / (Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * camera.aspect);
}
export function overviewView() {
  const { pos, tgt } = VIEWS.overview;
  const dir = pos.clone().sub(tgt);
  const d = Math.max(dir.length(), fitDist(125));
  return { pos: tgt.clone().add(dir.normalize().multiplyScalar(d)), tgt: tgt.clone() };
}
export function monitorView() {
  const t = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
  const d = Math.max((SCREEN.h * 1.3) / 2 / t, (SCREEN.w * 1.3) / 2 / (t * camera.aspect));
  return { pos: SCREEN.center.clone().add(new V3(0, 0, d)), tgt: SCREEN.center.clone() };
}
export function spotView(id) {
  const b = new THREE.Box3();
  for (const m of meshesById[id]) b.expandByObject(m);
  const c = b.getCenter(new V3());
  const size = b.getSize(new V3()).length();
  const dist = Math.max(70, size * 1.7, fitDist(size * 0.6));
  return { pos: c.clone().add(new V3(c.x > 0 ? 0.3 : -0.3, 0.6, 1).normalize().multiplyScalar(dist)), tgt: c };
}
const cam = { pos: VIEWS.loading.pos.clone(), tgt: VIEWS.loading.tgt.clone() };
let anim = null;
export const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOutExpo = (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
export function goTo(view, dur = 1200, ease = easeInOut) {
  anim = { fp: cam.pos.clone(), ft: cam.tgt.clone(), tp: view.pos.clone(), tt: view.tgt.clone(), t0: performance.now(), dur: reduceMotion ? 0 : dur, ease };
}
export const isAnimating = () => !!anim;

/* ---------- Pointer ---------- */
const ray = new THREE.Raycaster();
// id of the clickable object under the pointer, or null
export function pick() {
  ray.setFromCamera(ndc, camera);
  const first = ray.intersectObjects(solids.length ? solids : spotMeshes, false)[0]; // nearest real surface
  if (first?.object.userData.spot) return first.object.userData.spot;
  // a near miss: accept the padded box if it is not behind something else
  const near = ray.intersectObjects(hitBoxes, false)[0];
  if (near && (!first || near.distance <= first.distance + HIT_PAD)) return near.object.userData.spot;
  return null;
}
// brighten an object while it is hovered
export function highlight(id, on) {
  for (const m of meshesById[id] || []) {
    if (m.material.emissive) m.material.emissive.setHex(on ? 0x12443f : 0x000000);
    else if (m.material.blending !== THREE.NoBlending) m.material.color.setScalar(on ? 1.25 : 1);
  }
}

/* ---------- Resize + frame ---------- */
export function resize(w, h) {
  renderer.setSize(w, h); css.setSize(w, h);
  glowRes.set(w, h);
  camera.aspect = w / h; camera.updateProjectionMatrix();
}
export function compile() {
  camera.position.copy(cam.pos); camera.lookAt(cam.tgt);
  renderer.compile(scene, camera);
}

const clockT = new THREE.Clock();
const eye = new V3(), look = new V3();
// view = { state, focusId, hovered } from main.js
export function render(view) {
  const t = clockT.getElapsedTime();
  const { state } = view;
  if (anim) {
    const k = anim.dur ? Math.min(1, (performance.now() - anim.t0) / anim.dur) : 1;
    const e = anim.ease(k);
    cam.pos.lerpVectors(anim.fp, anim.tp, e); cam.tgt.lerpVectors(anim.ft, anim.tt, e);
    if (k >= 1) anim = null;
  }
  eye.copy(cam.pos); look.copy(cam.tgt);
  if (!reduceMotion && state !== 'monitor' && state !== 'boot') {
    const amt = state === 'overview' ? 1 : 0.35;
    eye.x += (Math.sin(t * 0.15) * 14 + ndc.x * 12) * amt;
    eye.y += (Math.sin(t * 0.1) * 5 + ndc.y * 6) * amt;
    eye.z += Math.cos(t * 0.15) * 8 * amt;
  }
  camera.position.copy(eye); camera.lookAt(look);
  updateGlows(t, view);
  renderer.render(scene, camera); css.render(scene, camera);
}
