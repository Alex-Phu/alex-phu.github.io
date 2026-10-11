/* Entry point: loads the content from data/, runs the BIOS boot screen, page state and the render loop. */
import { sound } from './sound.js';
import { createOS } from './os.js';
import * as room from './scene.js';

const $ = (s) => document.querySelector(s);
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

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
const CONTACT = 'Email <a href="mailto:AlexPhu2009@gmail.com">AlexPhu2009@gmail.com</a> or visit <a href="https://github.com/Alex-Phu">github.com/Alex-Phu</a>';

/* ---------- Content: data/site.json and data/projects.json ---------- */
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const linkHtml = (l) => `<a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)}</a>`;
async function loadJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
}
let site, projects;
try {
  [site, { projects }] = await Promise.all([loadJSON('data/site.json'), loadJSON('data/projects.json')]);
} catch (e) {
  print('Loading projects'.padEnd(26, '.') + ' <span class="err">FAILED</span>');
  print('\nThe site content could not load. Check your connection and refresh the page.');
  print(CONTACT);
  bar.hidden = true;
  throw e;
}

// Clickable objects, keyed by Blender name prefix: the computer plus every project with an object in the room
const SPOTS = { computer: site.computer };
for (const p of projects) if (p.prefix) SPOTS[p.prefix] = p;

// AlexOS windows. Research and Projects list every project of that kind, in file order.
const osItem = (p) => `<div class="item"><h3>${esc(p.osTitle || p.title)}</h3>${p.meta ? `<p class="meta">${esc(p.meta)}</p>` : ''}`
  + `<p>${esc(p.short)}${(p.links || []).map((l) => ' ' + linkHtml(l)).join('')}`
  + `${p.page ? ` <a href="${esc(p.page)}" target="_blank" rel="noopener">Read more</a>` : ''}</p></div>`;
const osList = (kind) => projects.filter((p) => p.kind === kind).map(osItem).join('');
const OS_APPS = {
  about: { glyph: 'i', label: 'About', html: `<h3>${esc(site.about.title)}</h3>${site.about.paragraphs.map((t) => `<p>${esc(t)}</p>`).join('')}<p class="meta">${esc(site.about.tip)}</p>` },
  research: { glyph: 'R', label: 'Research', html: osList('research') },
  projects: { glyph: 'P', label: 'Projects', html: osList('project') },
  contact: { glyph: '@', label: 'Contact', html: `<h3>${esc(site.contact.title)}</h3>`
    + `<p>Email: <span id="mail">${esc(site.email)}</span><button class="copy" type="button" data-copy>Copy</button></p>`
    + `<p>${site.contact.links.map(linkHtml).join(' &nbsp; ')}</p>` },
};

/* ---------- Room + AlexOS ---------- */
try {
  room.initScene(Object.keys(SPOTS), $('#stage'));
} catch (e) {
  print('WebGL ..................... <span class="err">FAILED</span>');
  print('\nThis browser cannot show the 3D desk.');
  print(CONTACT);
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
  $('#cTag').textContent = s.tag; $('#cTitle').textContent = s.title; $('#cBody').textContent = s.summary;
  $('#cTech').innerHTML = (s.tech || []).map((t) => `<li>${esc(t)}</li>`).join('');
  const link = $('#cLink'), first = (s.links || [])[0];
  if (first) { link.hidden = false; link.textContent = first.label + ' ↗'; link.href = first.url; } else link.hidden = true;
  // project page: "Read more" plus a preview (first screenshot, else the first video's poster)
  const media = s.media || [], m = media.find((x) => x.type === 'image') || media[0];
  const more = $('#cMore'), thumb = $('#cThumb');
  more.hidden = !s.page; if (s.page) more.href = s.page;
  thumb.hidden = !(s.page && m);
  if (s.page && m) { thumb.href = s.page; thumb.setAttribute('aria-label', `Open the ${s.title} page`); thumb.firstElementChild.src = m.poster || m.src; }
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
    tip.innerHTML = `${esc(SPOTS[hovered].label)}<small>${esc(SPOTS[hovered].hint)}</small>`;
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
  let gltf;
  try {
    gltf = await room.loadDesk((p) => {
      progress(0.05 + p * 0.75);
      lines[lines.length - 1] = 'Loading baked desk'.padEnd(26, '.') + ' ' + Math.round(p * 100) + '%';
      log.innerHTML = lines.join('\n');
    });
  } catch (e) {
    // no room to show: say so plainly and leave BOOT disabled
    console.error('Could not load the 3D room', e);
    lines.pop();
    print('Loading baked desk'.padEnd(26, '.') + ' <span class="err">FAILED</span>');
    print('\nThe 3D room could not load. Check your connection and refresh the page.');
    print(CONTACT);
    bar.hidden = true;
    return;
  }
  lines.pop();
  room.useDesk(gltf); ok('Loading baked desk');
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
