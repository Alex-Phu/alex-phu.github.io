/* AlexOS: a small desktop drawn as HTML. On wide screens it sits on the 3D monitor (see scene.js);
   on phones the same apps open in the full-screen #mos panel.
   apps:  { id: { glyph, label, html } }         desktop icons and phone tabs
   pages: { id: { title, from, html } }          project windows, opened by [data-project] buttons;
                                                 `from` is the app the back button returns to */
export function createOS(apps, pages) {
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  // demo videos only run while someone can see them
  const playVideos = (root, on) => root.querySelectorAll('video').forEach((v) => {
    if (on && v.autoplay && !reduceMotion) v.play().catch(() => {}); else v.pause();
  });

  /* ---------- AlexOS on the monitor ---------- */
  const os = document.createElement('div');
  os.className = 'os';
  os.inert = true;
  os.innerHTML = `
  <div class="os-bar"><span>◆ AlexOS</span><span id="clock"></span></div>
  <div class="os-icons">${Object.entries(apps).map(([id, a]) =>
    `<button class="os-icon" type="button" data-app="${id}"><span class="os-glyph">${a.glyph}</span>${a.label}</button>`).join('')}</div>
  <div class="os-hello">double-click not required.<br>just click an icon.</div>
  <div class="os-win" hidden><div class="os-title"><button class="os-back" type="button" aria-label="Back" hidden>‹</button><span class="os-wt"></span><button class="os-close" type="button" aria-label="Close window">×</button></div><div class="os-body"></div></div>`;
  const osWin = os.querySelector('.os-win');
  const winTitle = os.querySelector('.os-wt'), winBody = os.querySelector('.os-body'), winBack = os.querySelector('.os-back');
  let live = false;
  // project windows open maximized with a back button; app windows open at the normal size
  function showWin(title, html, back = null) {
    winTitle.textContent = title;
    winBody.innerHTML = html;
    winBody.scrollTop = 0;
    winBack.hidden = !back;
    winBack.dataset.app = back || '';
    osWin.classList.toggle('max', !!back);
    osWin.hidden = false;
    playVideos(winBody, live);
  }
  const showApp = (id) => showWin(apps[id].label, apps[id].html);
  const showPage = (id) => showWin(pages[id].title, pages[id].html, pages[id].from);
  os.addEventListener('click', (e) => {
    const app = e.target.closest('[data-app]');
    if (app && app.dataset.app) showApp(app.dataset.app);
    const page = e.target.closest('[data-project]');
    if (page) showPage(page.dataset.project);
    if (e.target.closest('.os-close')) { playVideos(winBody, false); osWin.hidden = true; }
    copyEmail(e);
  });
  function copyEmail(e) {
    const btn = e.target.closest('[data-copy]');
    if (!btn) return;
    const mail = btn.parentElement.querySelector('#mail');
    const done = () => { btn.textContent = 'Copied'; setTimeout(() => (btn.textContent = 'Copy'), 1500); };
    const fallback = () => { const r = document.createRange(); r.selectNodeContents(mail); const s = getSelection(); s.removeAllRanges(); s.addRange(r); btn.textContent = 'Selected'; };
    if (navigator.clipboard) navigator.clipboard.writeText(mail.textContent).then(done, fallback); else fallback();
  }

  /* ---------- phone version of AlexOS ---------- */
  const mos = document.getElementById('mos');
  const mosTabs = mos.querySelector('.mos-tabs');
  const mosBody = mos.querySelector('.os-body');
  for (const [id, a] of Object.entries(apps)) {
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = a.label; b.dataset.app = id;
    mosTabs.append(b);
  }
  function showMos(html, tab) {
    playVideos(mosBody, false);
    mosBody.innerHTML = html;
    mosBody.scrollTop = 0;
    mosTabs.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.app === tab)));
    playVideos(mosBody, true);
  }
  const showMosApp = (id) => showMos(apps[id].html, id);
  const showMosPage = (id) => {
    const p = pages[id];
    showMos(`<button class="more back" type="button" data-app="${p.from}">‹ Back to ${apps[p.from].label}</button>${p.html}`, p.from);
  };
  mos.addEventListener('click', (e) => {
    const t = e.target.closest('[data-app]');
    if (t) showMosApp(t.dataset.app);
    const page = e.target.closest('[data-project]');
    if (page) showMosPage(page.dataset.project);
    copyEmail(e);
  });

  const clock = () => { const el = os.querySelector('#clock'); if (el) el.textContent = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); };
  clock(); setInterval(clock, 15000);

  return {
    el: os,
    // the monitor version only takes clicks while the camera is zoomed in on it
    setLive(on) { live = on; os.classList.toggle('live', on); os.inert = !on; playVideos(winBody, on); },
    openPhone(id = 'about') { showMosApp(id); mos.hidden = false; },
    closePhone() { playVideos(mosBody, false); mos.hidden = true; },
    // open a project window: in the phone panel on phones, on the monitor otherwise
    openPage(id, phone) {
      if (phone) { showMosPage(id); mos.hidden = false; } else showPage(id);
    },
  };
}
