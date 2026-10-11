/* Entry point: page content, BIOS boot screen, page state and the render loop. */
import { sound } from './sound.js';
import { createOS } from './os.js';
import * as room from './scene.js';

const $ = (s) => document.querySelector(s);
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- Content ---------- */
const SPOTS = {
  computer: { label: 'Computer', hint: 'Click to use AlexOS' },
  askaapm: {
    label: 'AskAAPM', hint: 'First-author research',
    tag: 'FIRST AUTHOR · SUMMER 2026', title: 'AskAAPM',
    body: 'A retrieval-augmented system that answers questions about AAPM Task Group Reports and cites the source passages. Submitted to the AAPM 2027 Spring Clinical Conference and the Journal of Applied Clinical Medical Physics.',
    tech: ['RAG', 'FastAPI', 'Streamlit', 'FastMCP'], link: ['View GitHub', 'https://github.com/Alex-Phu/'],
  },
  shield: {
    label: '3D shield', hint: 'Medical physics',
    tag: 'CONTRIBUTOR · SUMMER 2026', title: '3D-Printed Shield',
    body: 'An application that turns treatment-planning CT data into a printable STL shield and an updated DICOM RT Structure Set for gynecologic brachytherapy. Manuscript submitted to Brachytherapy.',
    tech: ['Python', 'DICOM', 'STL', '3D printing'],
  },
  kinetiq: {
    label: 'KinetIQ', hint: 'Swing analyzer',
    tag: 'COMPUTER VISION · SPORT · 2026–', title: 'KinetIQ',
    body: 'An AI-assisted swing analyzer that tracks body and racket motion from video, then turns it into timing and consistency feedback for players and coaches. Submitted to the 2026 Congressional App Challenge.',
    tech: ['Computer vision', 'Biomechanics', 'Data viz'],
  },
  chess: {
    label: 'ChessAI', hint: 'AR chess assistant',
    tag: 'COMPUTER VISION · AR · 2025–26', title: 'ChessAI Assistant',
    body: 'Custom YOLO models and OpenCV read the board from Ray-Ban Meta camera feeds. Stockfish then suggests moves and explains tactics as the game unfolds.',
    tech: ['YOLO', 'OpenCV', 'Python', 'Stockfish'],
  },
};

const OS_APPS = {
  about: { glyph: 'i', label: 'About', html: `
    <h3>Hi, I'm Alex.</h3>
    <p>Greenhill School, Class of 2027. I build software that turns complex information into tools people can use, across medicine, health, and sport.</p>
    <p>Two summers in UT Southwestern's Medical AI and Automation Lab. Varsity tennis. Founder of Greenhill's Buddhist Affinity Group.</p>
    <p class="meta">Tip: click objects on the desk to see more projects.</p>` },
  research: { glyph: 'R', label: 'Research', html: `
    <div class="item"><h3>AskAAPM</h3><p class="meta">First author · submitted to AAPM 2027 Spring Clinical Conference and JACMP</p><p>Cited question answering over AAPM Task Group Reports.</p></div>
    <div class="item"><h3>3D-Printed Radiation Shield</h3><p class="meta">Contributor · submitted to Brachytherapy</p><p>CT data to a printable patient-specific shield.</p></div>
    <div class="item"><h3>VISTA-3D Segmentation Pipeline</h3><p class="meta">Lab project · 2025</p><p>Python and FastAPI around NVIDIA VISTA-3D in Docker.</p></div>` },
  projects: { glyph: 'P', label: 'Projects', html: `
    <div class="item"><h3>KinetIQ</h3><p>Swing analysis from video with computer vision.</p></div>
    <div class="item"><h3>ChessAI Assistant</h3><p>YOLO + OpenCV + Stockfish on smart-glasses video.</p></div>
    <div class="item"><h3>Vital Tracker + BreathWork</h3><p>SwiftUI and HealthKit apps. <a href="https://devpost.com/software/easybreathe-wl5s60" target="_blank" rel="noopener">Devpost</a></p></div>
    <div class="item"><h3>RV Park Comparison</h3><p>Search and compare parks by amenities and pricing. <a href="https://rvparkcomparison.lovable.app/" target="_blank" rel="noopener">Open</a></p></div>` },
  contact: { glyph: '@', label: 'Contact', html: `
    <h3>Say hello</h3>
    <p>Email: <span id="mail">AlexPhu2009@gmail.com</span><button class="copy" type="button" data-copy>Copy</button></p>
    <p><a href="https://github.com/Alex-Phu/" target="_blank" rel="noopener">GitHub</a> &nbsp; <a href="https://www.linkedin.com/in/alexander-phu-1bb2b02b6/" target="_blank" rel="noopener">LinkedIn</a></p>` },
};

/* ---------- Sound button ---------- */
const soundBtn = $('#soundBtn');
const paintSound = () => { soundBtn.setAttribute('aria-pressed', String(!sound.muted)); soundBtn.textContent = matchMedia('(max-width: 700px)').matches ? 'Sound' : (sound.muted ? 'Sound off' : 'Sound on'); };
paintSound();
soundBtn.addEventListener('click', () => { sound.setMuted(!sound.muted); paintSound(); });

/* ---------- BIOS ---------- */
const log = $('#log'), bar = $('#bar'), bootBtn = $('#boot');
const lines = [];
const print = (t) => { lines.push(t); log.innerHTML = lines.join('\n'); };
const progress = (p) => {
  const n = Math.round(p * 24);
  bar.textContent = `[${'#'.repeat(n)}${'.'.repeat(24 - n)}] ${Math.round(p * 100)}%`;
};
const wait = (ms) => new Promise((r) => setTimeout(r, reduceMotion ? 0 : ms));
const ok = (label) => print(`${label.padEnd(26, '.')} <span class="ok">OK</span>`);

/* ---------- Room + AlexOS ---------- */
try {
  room.initScene(Object.keys(SPOTS), $('#stage'));
} catch (e) {
  print('WebGL ..................... FAILED');
  print('\nThis browser cannot show the 3D desk.');
  print('Email AlexPhu2009@gmail.com or visit github.com/Alex-Phu');
  throw e;
}
const os = createOS(OS_APPS);
room.addOS(os.el);
const isPhone = () => matchMedia('(max-width: 700px)').matches;

/* ---------- State ---------- */
let state = 'boot';
let focusId = null;
let hovered = null;
const backBtn = $('#back'), card = $('#card'), tip = $('#tip');
const explore = $('#explore');
for (const [id, s] of Object.entries(SPOTS)) {
  const b = document.createElement('button');
  b.type = 'button'; b.textContent = s.label; b.dataset.spot = id;
  b.addEventListener('click', () => select(id));
  explore.append(b);
}
function setState(next, id = null) {
  state = next; focusId = id;
  backBtn.hidden = next === 'overview' || next === 'boot';
  os.setLive(next === 'monitor');
  document.body.classList.toggle('zoomed', next === 'monitor' || next === 'focus');
  explore.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.spot === id || (next === 'monitor' && b.dataset.spot === 'computer'))));
  if (next !== 'focus') card.hidden = true;
  if (next !== 'monitor') os.closePhone();
  tip.hidden = true;
}
function select(id) {
  if (state === 'boot') return;
  hideHint();
  if (id === 'computer') {
    setState('monitor'); room.goTo(room.monitorView(), 1100);
    if (isPhone()) os.openPhone('about');
    return;
  }
  const s = SPOTS[id];
  setState('focus', id);
  $('#cTag').textContent = s.tag; $('#cTitle').textContent = s.title; $('#cBody').textContent = s.body;
  $('#cTech').innerHTML = s.tech.map((t) => `<li>${t}</li>`).join('');
  const link = $('#cLink');
  if (s.link) { link.hidden = false; link.textContent = s.link[0] + ' ↗'; link.href = s.link[1]; } else link.hidden = true;
  card.hidden = false;
  room.goTo(room.spotView(id), 1100);
}
function backToRoom() { if (state === 'boot' || state === 'overview') return; setState('overview'); room.goTo(room.overviewView(), 1100); }
backBtn.addEventListener('click', backToRoom);
$('#cardClose').addEventListener('click', backToRoom);
$('#mosClose').addEventListener('click', backToRoom);

/* ---------- Pointer ---------- */
function setHover(id) {
  if (hovered === id) return;
  if (hovered) room.highlight(hovered, false);
  hovered = id;
  if (id) room.highlight(id, true);
  document.body.style.cursor = id ? 'pointer' : '';
}
const setPointer = (e) => room.ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
addEventListener('pointermove', (e) => {
  setPointer(e);
  if (state === 'boot' || state === 'monitor' || e.target.closest?.('.ui')) { setHover(null); tip.hidden = true; return; }
  const id = room.pick();
  setHover(id === focusId ? null : id);
  if (hovered && e.pointerType === 'mouse') {
    tip.innerHTML = `${SPOTS[hovered].label}<small>${SPOTS[hovered].hint}</small>`;
    tip.style.left = e.clientX + 'px'; tip.style.top = e.clientY + 'px'; tip.hidden = false;
  } else tip.hidden = true;
});
addEventListener('click', (e) => {
  if (state === 'boot' || e.target.closest('.ui') || os.el.contains(e.target)) return;
  setPointer(e);
  const id = room.pick();
  if (state === 'monitor') { if (id !== 'computer') backToRoom(); return; }
  if (id && id !== focusId) select(id); else if (!id) backToRoom();
});
addEventListener('pointerdown', (e) => { if (state !== 'boot' && e.button === 0) sound.mouse(true); });
addEventListener('pointerup', (e) => { if (state !== 'boot' && e.button === 0) sound.mouse(false); });
addEventListener('keydown', (e) => {
  if (state === 'boot' && !bootBtn.disabled && e.key !== 'Tab') { e.preventDefault(); boot(); return; }
  if (state !== 'boot' && !e.repeat && !['Shift', 'Control', 'Alt', 'Meta', 'CapsLock'].includes(e.key)) sound.key();
  if (e.key === 'Escape') backToRoom();
});

/* ---------- Resize + loop ---------- */
function resize() {
  room.resize(innerWidth, innerHeight);
  if (state === 'monitor') room.goTo(room.monitorView(), 0);
  if (state === 'overview' && !room.isAnimating()) room.goTo(room.overviewView(), 0);
  paintSound();
}
addEventListener('resize', resize);

function frame() {
  room.render({ state, focusId, hovered });
  requestAnimationFrame(frame);
}

/* ---------- Boot sequence ---------- */
async function start() {
  print('Checking WebGL'.padEnd(26, '.') + ' <span class="ok">OK</span>');
  progress(0.05);
  print('Loading baked desk'.padEnd(26, '.') + ' 0%');
  let gltf = null;
  try {
    gltf = await room.loadDesk((p) => {
      progress(0.05 + p * 0.75);
      lines[lines.length - 1] = 'Loading baked desk'.padEnd(26, '.') + ' ' + Math.round(p * 100) + '%';
      log.innerHTML = lines.join('\n');
    });
  } catch (e) { console.warn('desk.glb failed to load, using simple shapes', e); }
  lines.pop();
  if (gltf) { room.useDesk(gltf); ok('Loading baked desk'); }
  else { room.buildFallback(); print('Loading baked desk'.padEnd(26, '.') + ' <span class="ok">SIMPLE MODE</span>'); }
  room.addGlows();
  progress(0.85); await wait(150);
  ok('Mounting AlexOS'); progress(0.7); await wait(200);
  resize();
  room.compile();
  ok('Compiling shaders'); progress(1); await wait(200);
  if (document.fonts) await Promise.race([document.fonts.ready, wait(1500)]);
  print('\nPress any key or click BOOT.');
  bootBtn.disabled = false; bootBtn.focus();
  requestAnimationFrame(frame);
}
const hint = $('#hint');
function hideHint() { if (hint.hidden) return; hint.classList.add('fade'); setTimeout(() => { hint.hidden = true; }, 650); }
function boot() {
  if (state !== 'boot') return;
  setTimeout(() => { hint.hidden = false; setTimeout(hideHint, 9000); }, reduceMotion ? 0 : 2200);
  sound.init();
  sound.chime();
  setTimeout(sound.ambience, 2200);
  $('#bios').classList.add('gone');
  setTimeout(() => { $('#bios').hidden = true; }, reduceMotion ? 0 : 650);
  setState('overview');
  room.goTo(room.overviewView(), 2400, room.easeOutExpo);
}
bootBtn.addEventListener('click', boot);
start();
