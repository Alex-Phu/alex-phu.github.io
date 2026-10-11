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
const meshesById = {}; // spot id -> its meshes
export const ndc = new THREE.Vector2(9, 9); // pointer position, set by main.js

/* ---------- Renderers ---------- */
// Throws if the browser has no WebGL.
export function initScene(spotIds, stage) {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  renderer.setClearColor(0xdcd8d1, 1);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.NoToneMapping; // lighting is baked into the textures
  css = new CSS3DRenderer();
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
function tagSpot(group, id) { group.traverse((o) => { if (o.isMesh) tagMesh(o, id); }); }
const SCREEN = { center: new V3(0, 104, -17.4), w: 54, h: 33.75 };
const TOP = 77; // desk surface height
const SZ = -17.4; // screen plane z, just in front of the monitor face

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

/* ---------- Simple-shapes fallback, used if the baked model fails to load ---------- */
function mat(color, rough = 0.7, metal = 0) {
  return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
}
function box(w, h, d, color, x, y, z, parent = scene, rough) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color, rough));
  m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; parent.add(m); return m;
}

function buildRoom() {
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(1200, 1200), mat(0x151d20, 0.95));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
  box(500, 260, 4, 0x1a292c, 0, 130, -60, scene, 0.95);
  // poster on the wall
  const pc = document.createElement('canvas'); pc.width = 256; pc.height = 340;
  const g = pc.getContext('2d');
  g.fillStyle = '#e9e2d3'; g.fillRect(0, 0, 256, 340);
  g.fillStyle = '#c7592f'; g.beginPath(); g.arc(128, 140, 70, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#172321'; g.font = 'bold 30px monospace'; g.textAlign = 'center';
  g.fillText('BUILD TO', 128, 260); g.fillText('UNDERSTAND', 128, 296);
  const ptex = new THREE.CanvasTexture(pc); ptex.colorSpace = THREE.SRGBColorSpace;
  const poster = new THREE.Mesh(new THREE.PlaneGeometry(48, 64), new THREE.MeshStandardMaterial({ map: ptex, roughness: 0.9 }));
  poster.position.set(-95, 150, -57.9); scene.add(poster);
}

function buildDesk() {
  box(170, 4, 80, 0x8a6a4a, 0, TOP - 2, 0, scene, 0.6);
  for (const [x, z] of [[-80, -35], [80, -35], [-80, 35], [80, 35]]) box(4, TOP - 4, 4, 0x2c2a27, x, (TOP - 4) / 2, z);
}

function buildComputer() {
  const g = new THREE.Group();
  box(20, 1.5, 14, 0xd6d1c4, 0, TOP + 0.75, -22, g, 0.5);
  box(4, 16, 4, 0xd6d1c4, 0, TOP + 9, -23, g, 0.5);
  box(60, 40, 5, 0xddd8ca, 0, 104, -20, g, 0.45);
  box(44, 2, 14, 0xd6d1c4, 0, TOP + 1, 12, g, 0.6);
  box(6, 2, 10, 0xd6d1c4, 30, TOP + 1, 14, g, 0.6);
  scene.add(g); tagSpot(g, 'computer');

  // Transparent "hole" in the WebGL canvas so the CSS3D screen behind it shows through
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(54, 33.75),
    new THREE.MeshBasicMaterial({ color: 0x000000, opacity: 0, blending: THREE.NoBlending, fog: false, toneMapped: false })
  );
  screen.position.set(0, 104, SZ);
  tagMesh(screen, 'computer'); scene.add(screen);

  const glow = new THREE.PointLight(0x6fd3c6, 0.9, 140, 0);
  glow.position.set(0, 104, 0); scene.add(glow);
}

function buildBinder() {
  const g = new THREE.Group();
  box(22, 3, 28, 0x2d5f8a, 34, TOP + 1.5, -14, g, 0.6);
  box(21, 2, 27, 0xf1ede2, 34, TOP + 4, -14, g, 0.9);
  box(22, 3, 28, 0x9b3b2f, 34, TOP + 6.5, -14, g, 0.6);
  scene.add(g); tagSpot(g, 'askaapm');
}

function buildPrinter() {
  const g = new THREE.Group();
  const cx = -60, cz = -18, c = 0x2b3034;
  box(28, 4, 28, c, cx, TOP + 2, cz, g);
  for (const [dx, dz] of [[-13, -13], [13, -13], [-13, 13], [13, 13]]) box(2, 32, 2, c, cx + dx, TOP + 20, cz + dz, g);
  box(28, 2, 28, c, cx, TOP + 36, cz, g);
  box(20, 1, 20, 0x3c4348, cx, TOP + 8, cz, g);
  box(6, 3, 4, 0xf2a46b, cx, TOP + 25, cz, g); // print head
  const part = new THREE.Mesh(new THREE.CylinderGeometry(4, 5, 6, 24, 1, false, 0, Math.PI * 1.4), mat(0xf2a46b, 0.5));
  part.position.set(cx, TOP + 11.5, cz); part.castShadow = true; g.add(part);
  scene.add(g); tagSpot(g, 'shield');
}

function buildRacket() {
  const g = new THREE.Group();
  const frameMat = mat(0xd64f3a, 0.4);
  const frame = new THREE.Mesh(new THREE.TorusGeometry(12, 0.9, 10, 48), frameMat);
  frame.scale.set(0.74, 1, 1);
  // string bed: a grid drawn on a canvas
  const sc = document.createElement('canvas'); sc.width = sc.height = 128;
  const sg = sc.getContext('2d'); sg.strokeStyle = '#f3f0e6'; sg.lineWidth = 2;
  for (let i = 4; i < 128; i += 10) { sg.beginPath(); sg.moveTo(i, 0); sg.lineTo(i, 128); sg.moveTo(0, i); sg.lineTo(128, i); sg.stroke(); }
  const stex = new THREE.CanvasTexture(sc); stex.colorSpace = THREE.SRGBColorSpace;
  const strings = new THREE.Mesh(new THREE.CircleGeometry(11.4, 40),
    new THREE.MeshStandardMaterial({ map: stex, transparent: true, side: THREE.DoubleSide, roughness: 0.8 }));
  strings.scale.set(0.74, 1, 1);
  // throat: two arms forming a V from the head to the handle
  for (const side of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 10, 10), frameMat);
    arm.position.set(side * 2.6, -15.6, 0); arm.rotation.z = side * 0.42; g.add(arm);
  }
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 6, 12), frameMat);
  shaft.position.y = -22; g.add(shaft);
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 15, 8), mat(0xe9e2d3, 0.9));
  grip.position.y = -32; g.add(grip);
  g.add(frame, strings);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  g.rotation.set(-Math.PI / 2, 0, 0.35);
  g.position.set(62, TOP + 1.6, -12);
  scene.add(g); tagSpot(g, 'kinetiq');
}

function buildChess() {
  const g = new THREE.Group();
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const c = cv.getContext('2d');
  for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) { c.fillStyle = (i + j) % 2 ? '#3a2a1e' : '#e4d6bd'; c.fillRect(i * 8, j * 8, 8, 8); }
  const tex = new THREE.CanvasTexture(cv); tex.magFilter = THREE.NearestFilter; tex.colorSpace = THREE.SRGBColorSpace;
  const board = new THREE.Mesh(new THREE.BoxGeometry(24, 1.5, 24),
    [mat(0x5b4030), mat(0x5b4030), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 }), mat(0x5b4030), mat(0x5b4030), mat(0x5b4030)]);
  board.position.set(-38, TOP + 0.75, 18); board.receiveShadow = board.castShadow = true; g.add(board);
  // a king and a pawn
  const king = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.4, 5, 16), mat(0xf3eee2, 0.4));
  king.position.set(-41, TOP + 4, 15); king.castShadow = true; g.add(king);
  const pawn = new THREE.Mesh(new THREE.SphereGeometry(1.2, 16, 12), mat(0x1b1b1b, 0.4));
  pawn.position.set(-33, TOP + 2.7, 21); pawn.castShadow = true; g.add(pawn);
  // smart glasses resting on the board
  const gl = new THREE.Group();
  const lensMat = mat(0x111111, 0.3, 0.2);
  for (const dx of [-3.4, 3.4]) {
    const rim = new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.45, 8, 24), lensMat);
    rim.position.x = dx; gl.add(rim);
  }
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.6, 0.6), lensMat); gl.add(bridge);
  gl.rotation.x = -Math.PI / 2 + 0.25; gl.position.set(-38, TOP + 3.4, 26); gl.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  g.add(gl);
  scene.add(g); tagSpot(g, 'chess');
}

function buildMug() {
  const mug = new THREE.Mesh(new THREE.CylinderGeometry(4, 3.6, 9, 24), mat(0x2f6f69, 0.5));
  mug.position.set(42, TOP + 4.5, 22); mug.castShadow = true; scene.add(mug);
}

function buildLights() {
  scene.add(new THREE.HemisphereLight(0xbfd9e0, 0x1a1410, 1.1));
  const sun = new THREE.DirectionalLight(0xffd9b5, 1.6);
  sun.position.set(-140, 260, 160); sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -130, right: 130, top: 130, bottom: -130, near: 50, far: 700 });
  scene.add(sun);
}
export function buildFallback() {
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  buildRoom(); buildDesk(); buildLights();
  buildComputer(); buildBinder(); buildPrinter(); buildRacket(); buildChess(); buildMug();
  SCREEN.center.set(0, 104, SZ); SCREEN.w = 54; SCREEN.h = 33.75; placeOS();
}

/* ---------- Baked model from Blender ---------- */
// The baked model ships as base64 text next to the page; decode it and hand the bytes to GLTFLoader.
function b64bytes(text) {
  const raw = atob(text.trim());
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}
function decodeDesk(text) {
  return new Promise((resolve, reject) => new GLTFLoader().parse(b64bytes(text).buffer, '', resolve, reject));
}
// Baked textures are embedded as separate JPEGs and decoded without blob: URLs,
// which some viewers block.
const TEX = {};
async function loadTextures(onProgress) {
  const els = [...document.querySelectorAll('script[data-tex]')];
  let done = 0;
  for (const el of els) {
    const mime = el.dataset.mime || 'image/jpeg';
    let img;
    try {
      img = await createImageBitmap(new Blob([b64bytes(el.textContent)], { type: mime }));
    } catch (e) {
      img = await new Promise((res, rej) => {
        const i = new Image();
        i.onload = () => res(i); i.onerror = rej;
        i.src = 'data:' + mime + ';base64,' + el.textContent.trim();
      });
    }
    const t = new THREE.Texture(img);
    t.flipY = false;
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    t.needsUpdate = true;
    TEX[el.dataset.tex] = t;
    onProgress(++done / els.length);
  }
}
export async function loadDesk(onProgress) {
  // The model is embedded at the end of this file, so a downloaded copy works on its own.
  const inline = document.getElementById('desk-geo');
  if (inline && inline.textContent.length > 1000) {
    await loadTextures((p) => onProgress(p * 0.9));
    const gltf = await decodeDesk(inline.textContent);
    onProgress(1);
    return gltf;
  }
  const res = await fetch('desk-model.txt');
  if (!res.ok) throw new Error('desk-model.txt: HTTP ' + res.status);
  const total = Number(res.headers.get('content-length')) || 2960000;
  const parts = [];
  let got = 0;
  if (res.body && res.body.getReader) {
    const reader = res.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      parts.push(value); got += value.length; onProgress(Math.min(1, got / total));
    }
  } else parts.push(new Uint8Array(await res.arrayBuffer()));
  const text = new TextDecoder().decode(await new Blob(parts).arrayBuffer());
  const raw = atob(text.trim());
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  onProgress(1);
  return new Promise((resolve, reject) => new GLTFLoader().parse(bytes.buffer, '', resolve, reject));
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
      const map = TEX[o.material.name] || o.material.map;
      if (map) { map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = aniso; }
      m = map ? new THREE.MeshBasicMaterial({ map }) : new THREE.MeshBasicMaterial({ color: 0xd9d4cc });
      shared.set(o.material, m);
    }
    const id = o.name.split('_')[0];
    if (meshesById[id]) { o.material = m.clone(); tagMesh(o, id); } else o.material = m;
  });
  placeOS();
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
  const hit = ray.intersectObjects(spotMeshes, false)[0];
  return hit ? hit.object.userData.spot : null;
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
