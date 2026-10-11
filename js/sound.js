/* Sound: everything is synthesized with Web Audio, no audio files */
export const sound = (() => {
  let ctx = null, master, sfx, amb, verb, noiseBuf, brownBuf, ambOn = false;
  let muted = false;
  try { muted = localStorage.getItem('desk-muted') === '1'; } catch (e) { /* storage blocked */ }
  const rand = (a, b) => a + Math.random() * (b - a);

  function buffer(seconds, fill, channels = 1) {
    const len = Math.floor(ctx.sampleRate * seconds);
    const b = ctx.createBuffer(channels, len, ctx.sampleRate);
    for (let c = 0; c < channels; c++) fill(b.getChannelData(c), len);
    return b;
  }
  function init() {
    if (ctx) { ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = muted ? 0 : 0.9;
    const comp = ctx.createDynamicsCompressor();
    master.connect(comp); comp.connect(ctx.destination);
    sfx = ctx.createGain(); sfx.connect(master);
    amb = ctx.createGain(); amb.gain.value = 0; amb.connect(master);
    // small-room reverb from a generated impulse
    verb = ctx.createConvolver();
    verb.buffer = buffer(2.6, (d, n) => { for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3.2); }, 2);
    const wet = ctx.createGain(); wet.gain.value = 0.32; verb.connect(wet); wet.connect(master);
    noiseBuf = buffer(2, (d, n) => { for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1; });
    brownBuf = buffer(4, (d, n) => { let last = 0; for (let i = 0; i < n; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; } });
    document.addEventListener('visibilitychange', () => { if (document.hidden) ctx.suspend(); else ctx.resume(); });
  }
  function noise(loop, buf = noiseBuf) { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = loop; return s; }
  function env(g, t, peak, attack, decay) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  /* A short plastic "tick": the building block for mouse buttons and keys */
  function tick({ t = ctx.currentTime, freq = 3000, q = 6, peak = 1, decay = 0.03, dest = sfx, pan = 0, wet = 0 }) {
    const src = noise(false);
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 900;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = freq; bp.Q.value = q;
    const g = ctx.createGain(); env(g, t, peak, 0.001, decay);
    const p = ctx.createStereoPanner(); p.pan.value = pan;
    src.connect(hp).connect(bp).connect(g).connect(p).connect(dest);
    if (wet) { const w = ctx.createGain(); w.gain.value = wet; p.connect(w).connect(verb); }
    src.start(t, rand(0, 1.8), decay + 0.02);
  }

  /* Old-school ball mouse: a loud microswitch snap plus a hollow plastic body */
  function mouse(down) {
    if (!ctx) return;
    const t = ctx.currentTime;
    tick({ t, freq: down ? 3100 : 3900, q: 7, peak: down ? 3.2 : 2.0, decay: down ? 0.035 : 0.022 });
    tick({ t, freq: 6500, q: 1, peak: down ? 0.9 : 0.6, decay: 0.006 });
    const o = ctx.createOscillator(); o.type = 'triangle';
    o.frequency.setValueAtTime(down ? 240 : 300, t); o.frequency.exponentialRampToValueAtTime(95, t + 0.035);
    const g = ctx.createGain(); env(g, t, down ? 0.45 : 0.25, 0.001, 0.045);
    o.connect(g).connect(sfx); o.start(t); o.stop(t + 0.07);
  }

  /* Chunky keyboard clack for local typing */
  function key() {
    if (!ctx) return;
    const t = ctx.currentTime;
    tick({ t, freq: rand(1700, 2500), q: 4, peak: rand(0.9, 1.3), decay: 0.04 });
    tick({ t: t + 0.012, freq: rand(900, 1200), q: 3, peak: 0.35, decay: 0.03 });
  }

  /* Startup chime: an original swell in the spirit of late-2000s PCs */
  function chime() {
    if (!ctx) return;
    const t = ctx.currentTime + 0.05;
    const out = ctx.createGain(); out.gain.value = 0.55; out.connect(sfx);
    const send = ctx.createGain(); send.gain.value = 0.9; out.connect(send).connect(verb);
    // warm pad: open Cmaj7 voicing on detuned saws, filter opening then settling
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 1.5;
    lp.frequency.setValueAtTime(280, t);
    lp.frequency.exponentialRampToValueAtTime(2600, t + 1.5);
    lp.frequency.exponentialRampToValueAtTime(800, t + 4.8);
    const pad = ctx.createGain();
    pad.gain.setValueAtTime(0.0001, t);
    pad.gain.linearRampToValueAtTime(0.16, t + 1.1);
    pad.gain.linearRampToValueAtTime(0.11, t + 2.6);
    pad.gain.exponentialRampToValueAtTime(0.0001, t + 5.2);
    lp.connect(pad).connect(out);
    for (const f of [130.81, 196.0, 246.94, 329.63, 392.0]) {
      for (const det of [-7, 7]) {
        const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = det;
        const g = ctx.createGain(); g.gain.value = 0.18; o.connect(g).connect(lp); o.start(t); o.stop(t + 5.4);
      }
    }
    // sub swell
    const sub = ctx.createOscillator(); sub.frequency.value = 65.41;
    const sg = ctx.createGain(); sg.gain.setValueAtTime(0.0001, t); sg.gain.linearRampToValueAtTime(0.22, t + 1.2); sg.gain.exponentialRampToValueAtTime(0.0001, t + 4);
    sub.connect(sg).connect(out); sub.start(t); sub.stop(t + 4.2);
    // glassy bell arpeggio rising over the pad
    [659.25, 783.99, 987.77, 1174.66, 1318.51].forEach((f, i) => {
      const st = t + 0.45 + i * 0.17;
      const p = ctx.createStereoPanner(); p.pan.value = (i % 2 ? 0.35 : -0.35);
      const g = ctx.createGain(); env(g, st, 0.16, 0.012, 2.2);
      for (const [mult, lvl] of [[1, 1], [2.01, 0.35], [3.98, 0.12]]) {
        const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f * mult;
        const og = ctx.createGain(); og.gain.value = lvl; o.connect(og).connect(g); o.start(st); o.stop(st + 2.4);
      }
      g.connect(p).connect(out);
    });
  }

  /* Quiet internet-cafe bed: room tone, PC fans, distant chatter, other people typing */
  function ambience() {
    if (!ctx || ambOn) return;
    ambOn = true;
    const t = ctx.currentTime;
    amb.gain.setValueAtTime(0, t); amb.gain.linearRampToValueAtTime(1, t + 5);

    const room = noise(true, brownBuf);
    const roomLp = ctx.createBiquadFilter(); roomLp.type = 'lowpass'; roomLp.frequency.value = 450;
    const roomG = ctx.createGain(); roomG.gain.value = 0.11;
    room.connect(roomLp).connect(roomG).connect(amb); room.start();

    const fan = noise(true);
    const fanBp = ctx.createBiquadFilter(); fanBp.type = 'bandpass'; fanBp.frequency.value = 650; fanBp.Q.value = 0.9;
    const fanG = ctx.createGain(); fanG.gain.value = 0.02;
    fan.connect(fanBp).connect(fanG).connect(amb); fan.start(0.7);
    const hum = ctx.createOscillator(); hum.frequency.value = 120;
    const humG = ctx.createGain(); humG.gain.value = 0.004; hum.connect(humG).connect(amb); hum.start();

    // murmur: two formant bands whose level wanders like far-off conversation
    const talk = noise(true);
    const murmur = ctx.createGain(); murmur.gain.value = 0;
    for (const [f, q] of [[480, 1.4], [1350, 1.8]]) {
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = q;
      talk.connect(bp).connect(murmur);
    }
    const talkDry = ctx.createGain(); talkDry.gain.value = 0.25;
    murmur.connect(talkDry).connect(amb);
    const talkWet = ctx.createGain(); talkWet.gain.value = 0.6;
    murmur.connect(talkWet).connect(verb);
    talk.start(1.1);
    setInterval(() => {
      if (!ambOn || ctx.state !== 'running') return;
      const level = Math.random() < 0.25 ? 0.005 : rand(0.02, 0.07);
      murmur.gain.setTargetAtTime(level, ctx.currentTime, 0.05);
    }, 130);

    // other desks typing in bursts, each burst from a different spot in the room
    const burst = () => {
      if (ambOn && ctx.state === 'running') {
        const pan = rand(-0.85, 0.85), loud = rand(0.12, 0.3), n = Math.floor(rand(5, 22));
        let at = ctx.currentTime + 0.05;
        for (let i = 0; i < n; i++) {
          tick({ t: at, freq: rand(1500, 2600), q: 3, peak: loud * rand(0.6, 1), decay: 0.03, dest: amb, pan, wet: 0.8 });
          at += rand(0.07, 0.2) + (Math.random() < 0.1 ? rand(0.3, 0.7) : 0);
        }
        if (Math.random() < 0.3) { // a far-off mouse click now and then
          tick({ t: at + 0.4, freq: 3200, q: 6, peak: loud * 0.8, decay: 0.025, dest: amb, pan: -pan, wet: 0.8 });
        }
      }
      setTimeout(burst, rand(1500, 6500));
    };
    setTimeout(burst, 2500);
  }

  function setMuted(m) {
    muted = m;
    try { localStorage.setItem('desk-muted', m ? '1' : '0'); } catch (e) { /* storage blocked */ }
    if (ctx) master.gain.setTargetAtTime(m ? 0 : 0.9, ctx.currentTime, 0.05);
  }
  return { init, mouse, key, chime, ambience, setMuted, get muted() { return muted; }, get ready() { return !!ctx; } };
})();
