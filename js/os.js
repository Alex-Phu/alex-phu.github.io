/* AlexOS: a small desktop drawn as HTML. On wide screens it sits on the 3D monitor (see scene.js);
   on phones the same apps open in the full-screen #mos panel. */
export function createOS(apps) {
  /* ---------- AlexOS on the monitor ---------- */
  const os = document.createElement('div');
  os.className = 'os';
  os.inert = true;
  os.innerHTML = `
  <div class="os-bar"><span>◆ AlexOS</span><span id="clock"></span></div>
  <div class="os-icons">${Object.entries(apps).map(([id, a]) =>
    `<button class="os-icon" type="button" data-app="${id}"><span class="os-glyph">${a.glyph}</span>${a.label}</button>`).join('')}</div>
  <div class="os-hello">double-click not required.<br>just click an icon.</div>
  <div class="os-win" hidden><div class="os-title"><span class="os-wt"></span><button type="button" aria-label="Close window">×</button></div><div class="os-body"></div></div>`;
  const osWin = os.querySelector('.os-win');
  os.addEventListener('click', (e) => {
    const icon = e.target.closest('[data-app]');
    if (icon) {
      const a = apps[icon.dataset.app];
      os.querySelector('.os-wt').textContent = a.label;
      os.querySelector('.os-body').innerHTML = a.html;
      osWin.hidden = false;
    }
    if (e.target.closest('.os-title button')) osWin.hidden = true;
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
  function showMosApp(id) {
    mosBody.innerHTML = apps[id].html;
    mosBody.scrollTop = 0;
    mosTabs.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.app === id)));
  }
  mos.addEventListener('click', (e) => {
    const t = e.target.closest('[data-app]');
    if (t) showMosApp(t.dataset.app);
    copyEmail(e);
  });

  const clock = () => { const el = os.querySelector('#clock'); if (el) el.textContent = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); };
  clock(); setInterval(clock, 15000);

  return {
    el: os,
    // the monitor version only takes clicks while the camera is zoomed in on it
    setLive(on) { os.classList.toggle('live', on); os.inert = !on; },
    openPhone(id = 'about') { showMosApp(id); mos.hidden = false; },
    closePhone() { mos.hidden = true; },
  };
}
