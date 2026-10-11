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
const readMore = (p) => (p.details ? ` <button class="more" type="button" data-project="${esc(p.id)}">Read more</button>` : '');
const osItem = (p) => `<div class="item"><h3>${esc(p.osTitle || p.title)}</h3>${p.meta ? `<p class="meta">${esc(p.meta)}</p>` : ''}`
  + `<p>${esc(p.short)}${(p.links || []).map((l) => ' ' + linkHtml(l)).join('')}${readMore(p)}</p></div>`;
const osList = (kind) => projects.filter((p) => p.kind === kind).map(osItem).join('');
const OS_APPS = {
  about: { glyph: 'i', label: 'About', html: `<h3>${esc(site.about.title)}</h3>${site.about.paragraphs.map((t) => `<p>${esc(t)}</p>`).join('')}<p class="meta">${esc(site.about.tip)}</p>` },
  research: { glyph: 'R', label: 'Research', html: osList('research') },
  projects: { glyph: 'P', label: 'Projects', html: osList('project') },
  contact: { glyph: '@', label: 'Contact', html: `<h3>${esc(site.contact.title)}</h3>`
    + `<p>Email: <span id="mail">${esc(site.email)}</span><button class="copy" type="button" data-copy>Copy</button></p>`
    + `<p>${site.contact.links.map(linkHtml).join(' &nbsp; ')}</p>` },
};

// Project windows ("Read more"): every project with `details` gets one, opened inside AlexOS.
const mediaHtml = (m) => `<figure>${m.type === 'video'
  ? `<video src="${esc(m.src)}"${m.poster ? ` poster="${esc(m.poster)}"` : ''} width="${m.width}" height="${m.height}" ${reduceMotion ? '' : 'autoplay '}muted loop playsinline controls preload="metadata" aria-label="${esc(m.alt)}"></video>`
  : `<img src="${esc(m.src)}" alt="${esc(m.alt)}" width="${m.width}" height="${m.height}" loading="lazy">`}`
  + `${m.caption ? `<figcaption>${esc(m.caption)}</figcaption>` : ''}</figure>`;
const list = (items) => `<ul>${items.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>`;
function pageHtml(p) {
  const d = p.details;
  return `<div class="page">${p.tag ? `<p class="meta">${esc(p.tag)}</p>` : ''}<h3>${esc(p.title)}</h3>`
    + `<p>${esc(p.summary || p.short)}</p>${(p.media || []).map(mediaHtml).join('')}`
    + `<h4>What I built</h4>${list(d.built)}`
    + `<h4>How it works</h4><ol class="flow">${d.steps.map((t, i) => `<li><span class="n">${i + 1}</span>${esc(t)}</li>`).join('')}</ol>`
    + `${p.tech ? `<h4>Tools</h4><ul class="chips">${p.tech.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}`
    + `${d.results && d.results.length ? `<h4>Status</h4>${list(d.results)}` : ''}`
    + `${p.links && p.links.length ? `<p class="links">${p.links.map(linkHtml).join(' &nbsp; ')}</p>` : ''}</div>`;
}
const PAGES = {};
for (const p of projects) if (p.details) PAGES[p.id] = { title: p.title, from: p.kind === 'research' ? 'research' : 'projects', html: pageHtml(p) };

/* ---------- Room + AlexOS ---------- */
try {
  room.initScene(Object.keys(SPOTS), $('#stage'));
} catch (e) {
  print('WebGL ..................... <span class="err">FAILED</span>');
  print('\nThis browser cannot show the 3D desk.');
  print(CONTACT);
  throw e;
}
const os = createOS(OS_APPS, PAGES);
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
  if (next !== 'monitor') { os.closePhone(); setHash(''); }
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
  const more = $('#cMore'), thumb = $('#cThumb'), hasPage = !!PAGES[s.id];
  more.hidden = !hasPage; more.dataset.project = s.id;
  thumb.hidden = !(hasPage && m); thumb.dataset.project = s.id;
  if (hasPage && m) { thumb.setAttribute('aria-label', `Read more about ${s.title}`); thumb.firstElementChild.src = m.poster || m.src; }
  card.hidden = false;
  room.goTo(room.spotView(id), 1100);
}
// Opens a project window on the monitor (or the phone panel). Also used by links like alex-phu.github.io/#kinetiq.
function openProject(id) {
  if (state === 'boot' || !PAGES[id]) return;
  hideHint();
  if (state !== 'monitor') { setState('monitor'); room.goTo(room.monitorView(), 1100); }
  os.openPage(id, isPhone());
  setHash(id);
}
function setHash(id) {
  if (location.hash.slice(1) === id) return;
  history.replaceState(null, '', id ? '#' + id : location.pathname + location.search);
}
function backToRoom() { if (state === 'boot' || state === 'overview') return; setState('overview'); room.goTo(room.overviewView(), 1100); }
backBtn.addEventListener('click', backToRoom);
$('#cardClose').addEventListener('click', backToRoom);
for (const b of [$('#cMore'), $('#cThumb')]) b.addEventListener('click', () => openProject(b.dataset.project));
// keep the address bar in step with windows opened inside AlexOS, so the link can be shared
for (const el of [os.el, $('#mos')]) el.addEventListener('click', (e) => {
  const page = e.target.closest('[data-project]');
  if (page) setHash(page.dataset.project); else if (e.target.closest('[data-app], .os-close')) setHash('');
});
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
// Taps on the room are read from pointerdown/pointerup, not 'click': iPhone Safari never sends
// a click for a tap on a plain element like the 3D stage, so objects could not be tapped there.
let press = null;
addEventListener('pointerdown', (e) => {
  if (state !== 'boot' && e.button === 0) sound.mouse(true);
  // composedPath() is fixed when the press starts, so it still counts as inside AlexOS
  // even if AlexOS rewrites the pressed button (opening a window replaces its contents)
  const path = e.composedPath();
  const onUi = path.includes(os.el) || path.some((n) => n.classList?.contains('ui'));
  press = e.isPrimary && e.button === 0 && !onUi ? { x: e.clientX, y: e.clientY, t: performance.now() } : null;
});
addEventListener('pointerup', (e) => {
  if (state !== 'boot' && e.button === 0) sound.mouse(false);
  const p = press; press = null;
  if (!p || !e.isPrimary || state === 'boot') return;
  // a drag or a long press is not a tap
  if (Math.hypot(e.clientX - p.x, e.clientY - p.y) > 12 || performance.now() - p.t > 700) return;
  setPointer(e);
  const id = room.pick();
  if (state === 'monitor') { if (id !== 'computer') backToRoom(); return; }
  if (id && id !== focusId) select(id); else if (!id) backToRoom();
});
addEventListener('pointercancel', () => { press = null; });
// The browser's own click arrives after a tap, by then over whatever just opened under the finger
// (such as the card's buttons). Cancel it for taps that start on the room itself.
$('#stage').addEventListener('touchend', (e) => { if (!os.el.contains(e.target)) e.preventDefault(); }, { passive: false });
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
  const deepLink = location.hash.slice(1);
  setTimeout(() => { if (state !== 'overview') return; hint.hidden = false; setTimeout(hideHint, 9000); }, reduceMotion ? 0 : 2200);
  sound.init();
  sound.chime();
  setTimeout(sound.ambience, 2200);
  $('#bios').classList.add('gone');
  setTimeout(() => { $('#bios').hidden = true; }, reduceMotion ? 0 : 650);
  setState('overview');
  room.goTo(room.overviewView(), 2400, room.easeOutExpo);
  openProject(deepLink);
}
bootBtn.addEventListener('click', boot);
start();
