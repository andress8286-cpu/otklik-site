/* Юнитка · тема «Angry Birds» — живая сцена на лице баннера и игра на обороте карточки (23.10.2026, Андрей: «тему энгри бердс
   максимально похоже + 3д ощущения… логику открытия как в Сонике, визуал мощнее»).
   Картинки — свои генерации NeuralBox NB Pro (Код\unitka\birds): птицы, свиньи и рогатка — ab-chars.webp, блоки дерево / лёд / камень
   (целые и треснувшие) — ab-blocks.webp, поле уровня — ab-land*.webp. Грузится только в этой теме (index.html → loadBirds).
   Физика — Box2D (planck.js, тот же движок, что у оригинальной Angry Birds): блоки с прочностью, урон — по силе удара; у птиц свои
   умения и «любимый» материал: Чак (жёлтый) — рывок, бьёт дерево; Бомб (чёрный) — взрыв, крушит камень; Блюз (синий) — делится
   на трёх, колет лёд; Ред — просто крепкий. Очки как в игре: блок 500, свинья 5 000, каждая оставшаяся птица 10 000; звёзды 1–3.
   5 уровней (последний — Король свиней), прогресс — localStorage unitka.abStars.
   Управление — как в Angry Birds: тянешь назад (за птицу или в любом месте) и отпускаешь; в полёте тап — умение птицы.
   На узком экране камера ездит: показывает крепость, возвращается к рогатке, летит за птицей; тянуть вбок справа — посмотреть поле.
   Звуки ударов — записи Kenney «Impact Sounds» (CC0, ab-sfx.mp3), голоса птиц, рогатка, «пуф» свиньи, мелодии — синтез WebAudio.
   API: BirdsGame.mount(canvas, {onStars}) → {resume, pause, menu, destroy, dbg}; BirdsGame.face(canvas, {onMap}) → {pause, destroy};
   BirdsGame.mute(off); BirdsGame.stars() → [набрано, всего]. */
(function () {
"use strict";
const pl = window.planck, V2 = pl.Vec2;
const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const rnd = (a, b) => a + Math.random() * (b - a);
const LSG = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const LSS = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
const DPR = () => Math.min(2, window.devicePixelRatio || 1);
const reduced = () => false;   // игра двигается всегда, «меньше анимации» Windows не глушит (Андрей 24.10)
const FONT = '"Rubik",system-ui,sans-serif';
const GRAV = 10, STEP = 1 / 60, MAXP = 1.7, VMAX = 18.5, T = 0.26;      // T — толщина доски, м

/* ═════════ картинки: кадры листов (make_assets.py) ═════════ */
const IMG = {};
function pic(src) { if (!IMG[src]) { const im = new Image(); im.decoding = "async"; im.src = src; IMG[src] = im; } return IMG[src]; }
const ready = im => im && im.complete && im.naturalWidth > 0;
// персонажи: [x, y, w, h] в ab-chars.webp; тело — [cx, cy доли кадра, r — доля ширины кадра] (круг, который совпадает с физикой)
const CH = { red: [4, 5, 352, 349], red_fly: [364, 8, 352, 343], chuck: [724, 14, 352, 332], chuck_fly: [1084, 15, 352, 330],
  bomb: [43, 364, 274, 352], bomb_fly: [399, 364, 281, 352], blues: [729, 364, 342, 352], sling: [1148, 364, 223, 352],
  pig: [6, 724, 347, 352], pig_hurt: [365, 724, 350, 352], pig_helmet: [724, 737, 352, 325], pig_king: [1103, 724, 314, 352] };
const BODY = { red: [0.57, 0.55, 0.43], red_fly: [0.57, 0.55, 0.43], chuck: [0.53, 0.6, 0.42], chuck_fly: [0.55, 0.6, 0.41],
  bomb: [0.5, 0.615, 0.487], bomb_fly: [0.5, 0.6, 0.49], blues: [0.55, 0.52, 0.445],
  pig: [0.5, 0.52, 0.49], pig_hurt: [0.5, 0.52, 0.49], pig_helmet: [0.5, 0.53, 0.47], pig_king: [0.5, 0.57, 0.5] };
const BL = { wood: { plank: [0, 75, 900, 150], sq: [900, 0, 300, 300], crack: [1200, 0, 300, 300] },
  ice: { plank: [0, 375, 900, 150], sq: [900, 300, 300, 300], crack: [1200, 300, 300, 300] },
  stone: { plank: [0, 675, 900, 150], sq: [900, 600, 300, 300], crack: [1200, 600, 300, 300] } };
const SLING = { h: 2.7, la: [0.181, 0.169], ra: [0.849, 0.158] };       // высота рогатки (м) и точки крепления резинки (доли кадра)
const LAND = { gt: 0.7775, gy: 0.805 };                                   // в ab-land: верх травы и линия, на которой стоят блоки

/* ═════════ птицы, свиньи, материалы ═════════ */
const BIRD = {
  red: { r: 0.42, dens: 4, spr: "red", fly: "red_fly", col: ["#d8262b", "#ffffff"], fav: null, tip: "" },
  chuck: { r: 0.44, dens: 3.4, spr: "chuck", fly: "chuck_fly", col: ["#ffd21f", "#ffffff"], fav: "wood", tri: true, tip: "Жёлтый: нажми в полёте — рывок!" },
  bomb: { r: 0.56, dens: 5, spr: "bomb", fly: "bomb_fly", col: ["#2a2a30", "#e8a463"], fav: "stone", tip: "Чёрный: нажми — взрыв!" },
  blues: { r: 0.29, dens: 4.5, spr: "blues", fly: "blues", col: ["#62b9ec", "#ffffff"], fav: "ice", tip: "Синий: нажми — разделится на три!" }
};
const PIG = { pig: { r: 0.42, hp: 3, spr: "pig", hurt: "pig_hurt" }, helmet: { r: 0.5, hp: 7, spr: "pig_helmet", hurt: "pig_helmet" },
  king: { r: 0.72, hp: 12, spr: "pig_king", hurt: "pig_king" } };
const MAT = { wood: { dens: 0.9, hp: 7, fr: 0.7, col: ["#c98a4b", "#8f5525", "#e8b878"] },
  ice: { dens: 0.6, hp: 3.2, fr: 0.25, col: ["#c9f0fa", "#7cc9df", "#ffffff"] },
  stone: { dens: 2.4, hp: 18, fr: 0.9, col: ["#a3a3a3", "#6a6a6a", "#d0d0d0"] } };

/* ═════════ уровни: координаты в метрах, земля y = 0, рогатка — sx ═════════ */
const Vt = (m, x, y0, h) => ({ m, x, y: y0 + h / 2, w: T, h });                 // столб
const Hb = (m, x0, x1, y0) => ({ m, x: (x0 + x1) / 2, y: y0 + T / 2, w: x1 - x0, h: T });   // перекладина
const Sq = (m, x, y0, s) => ({ m, x, y: y0 + (s || 0.8) / 2, w: s || 0.8, h: s || 0.8 });  // квадрат
const Pg = (p, x, y0) => ({ p, x, y: y0 + PIG[p].r });
const hut = (m, c, y0, h, half) => [Vt(m, c - half, y0, h), Vt(m, c + half, y0, h), Hb(m, c - half - 0.3, c + half + 0.3, y0 + h)];
const LEVELS = [
  { name: "Первый шаг", birds: ["red", "red", "red"], o: [
    ...hut("wood", 19.2, 0, 2, 1.2), Pg("pig", 19.2, 0), Pg("pig", 19.2, 2.26),
    ...hut("ice", 24.6, 0, 1.6, 1.0), Sq("wood", 24.6, 1.86, 0.7), Pg("helmet", 24.6, 2.56)] },
  { name: "Башня", birds: ["red", "chuck", "chuck"], o: [
    ...hut("wood", 20.3, 0, 1.8, 1.3), Pg("pig", 20.3, 0),
    Vt("ice", 19.4, 2.06, 1.6), Vt("ice", 21.2, 2.06, 1.6), Hb("ice", 19.1, 21.5, 3.66), Pg("pig", 20.3, 2.06),
    Sq("wood", 20.3, 3.92, 0.7), Pg("helmet", 20.3, 4.62),
    Sq("stone", 24.6, 0), Sq("stone", 24.6, 0.8), Pg("pig", 24.6, 1.6)] },
  { name: "Каменная стена", birds: ["red", "bomb", "chuck"], o: [
    Vt("stone", 17.6, 0, 2.2),
    Vt("wood", 19.4, 0, 2.0), Vt("wood", 22.4, 0, 2.0), Hb("stone", 19.1, 22.7, 2.0), Pg("helmet", 20.9, 0),
    Sq("ice", 20.2, 2.26, 0.7), Sq("ice", 21.6, 2.26, 0.7), Hb("wood", 19.6, 22.2, 2.96), Pg("pig", 20.9, 3.22),
    ...hut("wood", 25.5, 0, 1.4, 0.9), Pg("pig", 25.5, 0), Pg("pig", 25.5, 1.66)] },
  { name: "Ледяной городок", birds: ["blues", "blues", "red", "chuck"], o: [
    ...hut("ice", 18.6, 0, 1.4, 0.9), Pg("pig", 18.6, 0), Sq("wood", 18.6, 1.66, 0.6), Pg("pig", 18.6, 2.26),
    ...hut("ice", 22.2, 0, 1.4, 0.9), Pg("pig", 22.2, 0),
    Vt("ice", 21.5, 1.66, 1.2), Vt("ice", 22.9, 1.66, 1.2), Hb("ice", 21.25, 23.15, 2.86), Pg("helmet", 22.2, 1.66),
    ...hut("ice", 25.8, 0, 1.4, 0.9), Pg("pig", 25.8, 0), Sq("wood", 25.8, 1.66, 0.6), Pg("pig", 25.8, 2.26)] },
  { name: "Король свиней", birds: ["red", "chuck", "bomb", "blues", "bomb"], o: [
    Sq("stone", 19, 0), Sq("stone", 19, 0.8), Sq("stone", 25, 0), Sq("stone", 25, 0.8),
    Vt("wood", 20.6, 0, 1.6), Vt("wood", 23.4, 0, 1.6), Pg("pig", 22, 0), Hb("wood", 18.5, 25.5, 1.6),
    Vt("wood", 20.2, 1.86, 2.0), Vt("wood", 23.8, 1.86, 2.0), Hb("stone", 19.9, 24.1, 3.86), Pg("king", 22, 1.86),
    Sq("ice", 20.6, 4.12, 0.7), Sq("ice", 23.4, 4.12, 0.7), Pg("helmet", 22, 4.12),
    Sq("wood", 17.4, 0, 0.6), Pg("pig", 16.6, 0), Sq("wood", 26.6, 0, 0.6), Pg("pig", 27.4, 0)] }
];
// поле уровня: справа — край крепости + 2,2 м; top — сколько неба нужно (верх постройки + 1,8 м): камера приближает, пока хватает
LEVELS.forEach(L => {
  L.sx = 5; L.x0 = 0;
  L.lw = Math.max(...L.o.map(o => o.x + (o.p ? PIG[o.p].r : o.w / 2))) + 2.2;
  L.top = Math.max(6.5, ...L.o.map(o => o.y + (o.p ? PIG[o.p].r : o.h / 2))) + 1.8;
});
// поле лица баннера: короче, крупнее (рогатка слева под надписью, справа домик и башня)
const FACE = { name: "", lw: 20, x0: 0, top: 6, sx: 4.3, birds: ["red", "chuck", "bomb"], o: [
  ...hut("wood", 12.4, 0, 1.7, 1.0), Pg("pig", 12.4, 0), Sq("ice", 12.4, 1.96, 0.6), Pg("pig", 12.4, 2.56),
  Sq("stone", 16.3, 0, 0.8), Sq("wood", 16.3, 0.8, 0.8), Pg("king", 16.3, 1.6)] };
// звёзды: 1 — прошёл; 2 и 3 — по очкам (свиньи + доля блоков + оставшиеся птицы)
LEVELS.forEach(L => {
  const pigs = L.o.filter(o => o.p).length, bl = L.o.length - pigs;
  L.s2 = pigs * 5000 + bl * 200 + 10000; L.s3 = pigs * 5000 + bl * 320 + 20000;
});

/* ═════════ звук ═════════ */
const AU = { a: null, on: LSG("unitka.abMute") !== "1", buf: null, busy: false, last: 0, n: 0 };
const SFX = {"wood":[[0.12,0.3298],[0.5698,0.3235],[1.0133,0.4092],[1.5425,0.4247]],"woodx":[[2.0872,0.3101],[2.5173,0.3101],[2.9475,0.3101]],"ice":[[3.3776,0.1459],[3.6435,0.1911],[3.9546,0.5405]],"icex":[[4.6151,0.2383],[4.9734,0.2443],[5.3377,0.1686]],"stone":[[5.6263,0.6746],[6.4209,0.5217],[7.0626,0.6681]],"stonex":[[7.8507,0.3494],[8.3201,0.6055]],"soft":[[9.0456,0.1151],[9.2807,0.1323],[9.533,0.1442]],"punch":[[9.7973,0.2843],[10.2015,0.355],[10.6765,0.4138]],"grass":[[11.2103,0.1583],[11.4885,0.1506]]};
function ac() {
  if (!AU.a) { try { AU.a = window.__ptAC || new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { AU.a = null; } }
  if (AU.a && AU.a.state === "suspended") AU.a.resume();
  return AU.a;
}
function loadSfx() {
  if (AU.buf || AU.busy) return; const a = ac(); if (!a) return; AU.busy = true;
  fetch("ab-sfx.mp3").then(r => r.arrayBuffer()).then(b => new Promise((ok, no) => a.decodeAudioData(b, ok, no)))
    .then(x => { AU.buf = x; }).catch(() => { AU.busy = false; });
}
function smp(name, vol, rate) {                              // запись из спрайта; не чаще 14 штук за 0,1 с
  if (!AU.on || !AU.buf) return; const a = ac(); if (!a) return;
  const now = a.currentTime; if (now - AU.last > 0.1) { AU.last = now; AU.n = 0; } if (++AU.n > 14) return;
  const L = SFX[name], [o, d] = L[(Math.random() * L.length) | 0], s = a.createBufferSource(), g = a.createGain();
  s.buffer = AU.buf; s.playbackRate.value = rate || rnd(0.92, 1.08); g.gain.value = clamp(vol, 0, 1);
  s.connect(g); g.connect(a.destination); s.start(now, o, d + 0.02);
}
function tone(f1, f2, dur, type, vol, delay, vib) {
  if (!AU.on) return; const a = ac(); if (!a) return;
  const t = a.currentTime + (delay || 0), o = a.createOscillator(), g = a.createGain();
  o.type = type || "square"; o.frequency.setValueAtTime(f1, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
  if (vib) { const l = a.createOscillator(), lg = a.createGain(); l.frequency.value = vib[0]; lg.gain.value = vib[1]; l.connect(lg); lg.connect(o.frequency); l.start(t); l.stop(t + dur + 0.05); }
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol || 0.05, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + dur + 0.05);
}
function hiss(dur, vol, f1, f2, delay, q) {                // шум через полосовой фильтр (свист, взрыв, «пуф»)
  if (!AU.on) return; const a = ac(); if (!a) return;
  const n = Math.floor(a.sampleRate * dur), b = a.createBuffer(1, n, a.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  const t = a.currentTime + (delay || 0), s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
  s.buffer = b; f.type = "bandpass"; f.Q.value = q || 1.2; f.frequency.setValueAtTime(f1, t); f.frequency.exponentialRampToValueAtTime(f2 || f1, t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f); f.connect(g); g.connect(a.destination); s.start(t);
}
const SND = {
  stretch: k => tone(70 + k * 60, 110 + k * 80, 0.22, "sawtooth", 0.035),                      // резинка скрипит
  launch: t => { hiss(0.4, 0.12, 500, 2600); SND.voice(t); },
  voice: t => {                                                                                // «уииии!» — у каждой птицы свой голос
    const f = { red: 620, chuck: 900, bomb: 380, blues: 1300 }[t] || 620;
    tone(f, f * 1.45, 0.42, "sawtooth", 0.035, 0.02, [16, f * 0.05]); tone(f * 2, f * 2.9, 0.42, "triangle", 0.025, 0.02, [16, f * 0.08]);
  },
  pop: () => { tone(420, 80, 0.2, "sine", 0.16); hiss(0.18, 0.12, 900, 300); tone(260, 190, 0.08, "sawtooth", 0.04, 0.05); tone(250, 170, 0.1, "sawtooth", 0.04, 0.17); },
  boom: () => { hiss(1.1, 0.5, 600, 60, 0, 0.7); tone(90, 32, 0.7, "sine", 0.35); },
  zoom: () => { tone(300, 1400, 0.3, "sawtooth", 0.05); hiss(0.3, 0.1, 1500, 4000); },
  split: () => { [0, 0.06, 0.12].forEach(d => tone(1500, 2100, 0.1, "triangle", 0.05, d)); },
  poof: () => hiss(0.3, 0.12, 1200, 500),
  star: i => { tone([880, 1175, 1568][i], 0, 0.6, "sine", 0.12); tone([1760, 2350, 3136][i], 0, 0.4, "triangle", 0.04); },
  bonus: () => { tone(1320, 0, 0.12, "square", 0.04); tone(1760, 0, 0.25, "square", 0.04, 0.08); },
  win: () => [523, 659, 784, 1046, 784, 1046].forEach((f, i) => { tone(f, 0, i > 4 ? 0.7 : 0.2, "square", 0.045, i * 0.13); tone(f / 2, 0, i > 4 ? 0.7 : 0.2, "triangle", 0.06, i * 0.13); }),
  lose: () => [392, 370, 349, 330].forEach((f, i) => tone(f, i === 3 ? f * 0.94 : 0, i === 3 ? 1 : 0.34, "sawtooth", 0.05, i * 0.38, i === 3 ? [5, 8] : null)),
  click: () => { tone(900, 500, 0.06, "sine", 0.1); hiss(0.04, 0.05, 2000); },
  oink: () => { tone(240, 180, 0.09, "sawtooth", 0.035); tone(230, 170, 0.11, "sawtooth", 0.035, 0.12); }
};

/* ═════════ сцена: мир Box2D + рисование (общая для игры и лица баннера) ═════════ */
function Scene(cv, cfg) {
  const g = cv.getContext("2d");
  const S = { W: null, objs: [], pigs: 0, fx: [], trail: [], tOld: [], fly: [], line: [], cur: null, L: null, lw: 32, sx: 5, x0: 0, top: 7,
    t: 0, score: 0, shake: 0, calm: false, kills: [], cam: { x: 0, tx: 0, full: true, s: 30, vw: 32, gs: 0, cw: 0, ch: 0, maxX: 0, sx0: 0, sy0: 0, follow: null },
    pull: null, load: null, onKill: null, onScore: null, view: null };

  /* ── мир ── */
  function build(L) {
    S.L = L; S.lw = L.lw; S.sx = L.sx; S.x0 = L.x0; S.top = L.top; S.objs = []; S.fx = []; S.trail = []; S.tOld = []; S.fly = []; S.cur = null; S.pull = null; S.load = null;
    S.score = 0; S.shake = 0; S.kills = [];
    const W = S.W = new pl.World({ gravity: V2(0, -GRAV), allowSleep: true });
    const gb = W.createBody({ type: "static" }); gb.createFixture(pl.Box(300, 3, V2(S.lw / 2, -3), 0), { friction: 0.9, restitution: 0.05 }); gb.setUserData({ k: "ground" });
    W.on("post-solve", (c, imp) => {
      const ni = imp.normalImpulses; let s = 0; for (let i = 0; i < ni.length; i++) s += ni[i];
      if (s < 0.3) return;
      const A = c.getFixtureA().getBody(), B = c.getFixtureB().getBody();
      hit(A, B, s); hit(B, A, s);
    });
    S.pigs = 0;
    L.o.forEach(o => { if (o.p) { addPig(o); S.pigs++; } else addBlock(o); });
    settle();
    // очередь у рогатки: много птиц — стоят теснее, чтобы крайняя не ушла за край
    const sp = Math.min(1.15, (S.sx - 1.15 - S.x0 - 0.6) / Math.max(1, L.birds.length - 1));
    S.line = L.birds.map((t, i) => ({ t, x: S.sx - 1.15 - i * sp, hop: rnd(0, 3), ph: rnd(0, TAU) }));
    S.sp = sp; S.cam.x = S.cam.tx = S.x0;
  }
  function addBlock(o) {
    const M = MAT[o.m], b = S.W.createBody({ type: "dynamic", position: V2(o.x, o.y), angle: o.a || 0 });
    b.createFixture(pl.Box(o.w / 2, o.h / 2), { density: M.dens, friction: M.fr, restitution: 0.06 });
    const hp = M.hp * clamp(o.w * o.h / 0.5, 0.7, 1.8);
    b.setUserData({ k: "block", m: o.m, w: o.w, h: o.h, hp, max: hp, pend: 0, seed: (Math.random() * 1e4) | 0, snd: 0 });
    b.setAngularDamping(0.05); S.objs.push(b); return b;
  }
  function addPig(o) {
    const P = PIG[o.p], b = S.W.createBody({ type: "dynamic", position: V2(o.x, o.y) });
    b.createFixture(pl.Circle(P.r), { density: 1, friction: 0.8, restitution: 0.2 });
    b.setUserData({ k: "pig", t: o.p, r: P.r, hp: P.hp, max: P.hp, pend: 0, ph: rnd(0, TAU), snd: 0, blink: rnd(2, 6) });
    b.setAngularDamping(0.6); S.objs.push(b); return b;
  }
  function addBird(t, x, y) {
    const B = BIRD[t], b = S.W.createBody({ type: "dynamic", position: V2(x, y), bullet: true });
    if (B.tri) { const r = B.r; b.createFixture(pl.Polygon([V2(-r * 1.05, -r * 0.78), V2(r * 1.1, -r * 0.78), V2(0.05 * r, r * 1.05)]), { density: B.dens, friction: 0.6, restitution: 0.3 }); }
    else b.createFixture(pl.Circle(B.r), { density: B.dens, friction: 0.6, restitution: 0.32 });
    b.setUserData({ k: "bird", t, r: B.r, hit: 0, ht: 0, ft: 0, used: false, slow: 0, snd: 0, main: true });
    b.setAngularDamping(0.5); S.objs.push(b); return b;
  }
  function settle() {                                       // постройка оседает без урона, потом засыпает до первого удара
    S.calm = true; for (let i = 0; i < 90; i++) S.W.step(STEP, 8, 3); S.calm = false;
    S.objs.forEach(b => { const u = b.getUserData(); u.pend = 0; b.setLinearVelocity(V2(0, 0)); b.setAngularVelocity(0); b.setAwake(false); });
  }
  function hit(a, b, s) {
    const u = a.getUserData(), o = b.getUserData(); if (!u || S.calm) return;
    if (u.k === "bird") {
      if (!u.hit) u.ht = S.t; u.hit++;
      if (s > 2 && S.t - u.snd > 0.12) { u.snd = S.t; smp(o && o.k === "ground" ? "grass" : "soft", clamp(s / 25, 0.15, 0.7)); feathers(a, s > 8 ? 7 : 3); }
      if (u.main) { u.main = false; }                          // след — только до первого удара
      return;
    }
    if (u.k !== "block" && u.k !== "pig") return;
    if (s > 1.4 && S.t - u.snd > 0.09) {                       // звук удара — по материалу, громкость по силе
      u.snd = S.t; const v = clamp(s / 18, 0.08, 0.85);
      if (u.k === "block") smp(u.m, v); else if (s > 2.5) smp("punch", v * 0.8);
    }
    if (s < 0.9) return;
    let d = s;
    if (o && o.k === "bird" && u.k === "block") { const f = BIRD[o.t].fav; d *= f === u.m ? 2.6 : o.t === "blues" ? 0.4 : 1; }
    u.pend += d;
  }

  /* ── шаг ── */
  function step() {
    S.W.step(STEP, 8, 3); S.t += STEP;
    // урон, накопленный за шаг
    for (let i = S.objs.length - 1; i >= 0; i--) {
      const b = S.objs[i], u = b.getUserData(), p = b.getPosition();
      if (u.k === "bird") continue;
      if (u.pend > 0) { u.hp -= u.pend; u.pend = 0; if (u.hp <= 0) { kill(b, i); continue; } }
      if (p.x < -6 || p.x > S.lw + 8 || p.y < -4) kill(b, i, true);
    }
    // летящие птицы: умение Бомба после удара, «сдулась» — дым и перья
    for (let i = S.fly.length - 1; i >= 0; i--) {
      const b = S.fly[i], u = b.getUserData(), p = b.getPosition(), v = b.getLinearVelocity().length();
      u.ft += STEP;
      if (u.main && (S.trail.length === 0 || S.t - S.trail[S.trail.length - 1].t > 0.045)) S.trail.push({ x: p.x, y: p.y, t: S.t, big: S.trail.length % 3 === 0 });
      if (u.t === "bomb" && !u.used && u.hit && S.t - u.ht > 1.4) { explode(b); continue; }
      if (u.hit) b.setLinearDamping(0.25);
      u.slow = v < 0.35 ? u.slow + STEP : 0;
      if (u.slow > 0.8 || (u.hit && S.t - u.ht > 5) || u.ft > 11 || p.x < -5 || p.x > S.lw + 6 || p.y < -3) {
        S.fly.splice(i, 1); removeBody(b); puff(p.x, p.y, "#ffffff", 7, 0.5); SND.poof();
      }
    }
    // частицы
    for (let i = S.fx.length - 1; i >= 0; i--) {
      const f = S.fx[i]; f.life -= STEP; if (f.life <= 0) { S.fx.splice(i, 1); continue; }
      if (f.k === "feather") { f.vy = lerp(f.vy, -0.7, 0.04); f.vx *= 0.97; f.x += (f.vx + Math.sin(f.life * 4 + f.ph) * 0.6) * STEP; f.y += f.vy * STEP; f.a += f.va * STEP; }
      else if (f.k === "shard") { f.vy -= GRAV * STEP; f.x += f.vx * STEP; f.y += f.vy * STEP; f.a += f.va * STEP; if (f.y < f.s * 0.5) { f.y = f.s * 0.5; f.vy *= -0.3; f.vx *= 0.6; f.va *= 0.5; } }
      else if (f.k === "smoke") { f.x += f.vx * STEP; f.y += f.vy * STEP; f.vx *= 0.95; f.vy *= 0.95; }
      else if (f.k === "text") f.y += 0.8 * STEP;
    }
    S.shake = Math.max(0, S.shake - STEP * 2.2);
  }
  function removeBody(b) { const i = S.objs.indexOf(b); if (i >= 0) S.objs.splice(i, 1); S.W.destroyBody(b); }
  function kill(b, i, silent) {
    const u = b.getUserData(), p = b.getPosition(), a = b.getAngle(); S.objs.splice(i, 1); S.W.destroyBody(b);
    if (u.k === "pig") {
      S.pigs--; addScore(5000, p.x, p.y + u.r, "#9be04a");
      puff(p.x, p.y, "#bfe86a", 12, u.r * 1.3); puff(p.x, p.y, "#ffffff", 6, u.r); SND.pop(); S.shake = Math.max(S.shake, 0.25);
    } else {
      addScore(500, p.x, p.y, "#ffffff");
      if (!silent) { shards(p.x, p.y, a, u, 10 + Math.min(14, (u.w * u.h * 12) | 0)); smp(u.m + "x", 0.7); }
    }
    if (S.onKill) S.onKill(u);
  }
  function addScore(n, x, y, col) { S.score += n; S.fx.push({ k: "text", x, y, txt: n.toLocaleString("ru-RU"), col, life: 1.2, max: 1.2 }); if (S.onScore) S.onScore(S.score); }
  function feathers(b, n) {
    const u = b.getUserData(), p = b.getPosition(), c = BIRD[u.t].col;
    for (let i = 0; i < n; i++) S.fx.push({ k: "feather", x: p.x + rnd(-0.2, 0.2), y: p.y + rnd(-0.2, 0.2), vx: rnd(-2.5, 2.5), vy: rnd(0.5, 3), a: rnd(0, TAU), va: rnd(-4, 4), ph: rnd(0, TAU), col: c[i % 3 === 2 ? 1 : 0], s: rnd(0.16, 0.26), life: rnd(1.4, 2.4), max: 2.4 });
    if (S.fx.length > 320) S.fx.splice(0, S.fx.length - 320);
  }
  function puff(x, y, col, n, r) {
    for (let i = 0; i < n; i++) { const a = rnd(0, TAU), v = rnd(0.6, 2.2); S.fx.push({ k: "smoke", x: x + Math.cos(a) * r * 0.4, y: y + Math.sin(a) * r * 0.4, vx: Math.cos(a) * v, vy: Math.sin(a) * v + 0.4, col, s: rnd(0.25, 0.45) * Math.max(0.6, r * 1.6), life: rnd(0.5, 0.85), max: 0.85 }); }
  }
  function shards(x, y, a, u, n) {
    const M = MAT[u.m], c = Math.cos(a), sn = Math.sin(a);
    for (let i = 0; i < n; i++) {
      const lx = rnd(-u.w / 2, u.w / 2), ly = rnd(-u.h / 2, u.h / 2);
      S.fx.push({ k: "shard", x: x + lx * c - ly * sn, y: y + lx * sn + ly * c, vx: rnd(-3, 3), vy: rnd(0.5, 4.5), a: rnd(0, TAU), va: rnd(-10, 10), s: rnd(0.1, 0.24), col: M.col[i % 3], life: rnd(0.8, 1.4), max: 1.4 });
    }
  }
  function explode(b) {                                     // Бомб: вспышка, ударная волна, всё вокруг разлетается
    const u = b.getUserData(), p = V2(b.getPosition()); u.used = true;
    const i = S.fly.indexOf(b); if (i >= 0) S.fly.splice(i, 1); removeBody(b);
    const R = 3.4;
    S.objs.slice().forEach(o => {
      const q = o.getPosition(), dx = q.x - p.x, dy = q.y - p.y, d = Math.hypot(dx, dy); if (d > R) return;
      const f = 1 - d / R, ou = o.getUserData(), m = o.getMass(), imp = Math.min(46, (7 + 9 * m) * f);
      o.applyLinearImpulse(V2(dx / (d || 1) * imp, dy / (d || 1) * imp + imp * 0.25), o.getWorldCenter(), true);
      if (ou.k === "block" || ou.k === "pig") ou.pend += 16 * f * (ou.m === "stone" ? 1.6 : 1);
    });
    S.fx.push({ k: "flash", x: p.x, y: p.y, s: R * 0.9, life: 0.28, max: 0.28 }, { k: "ring", x: p.x, y: p.y, s: R, life: 0.45, max: 0.45 });
    puff(p.x, p.y, "#3b3b3b", 14, 0.9); puff(p.x, p.y, "#ffb23a", 8, 0.6); S.shake = 0.6; SND.boom();
  }

  /* ── запуск и умения ── */
  function pouch() {                                          // точки резинки и покоя птицы в рогатке (м)
    const h = SLING.h, w = h * CH.sling[2] / CH.sling[3], x0 = S.sx - w / 2, y0 = -0.12;
    const la = { x: x0 + SLING.la[0] * w, y: y0 + h * (1 - SLING.la[1]) }, ra = { x: x0 + SLING.ra[0] * w, y: y0 + h * (1 - SLING.ra[1]) };
    return { la, ra, x: (la.x + ra.x) / 2 + 0.02, y: (la.y + ra.y) / 2 - 0.12, w, h, x0, y0 };
  }
  function launch(vx, vy) {
    if (!S.cur) return null;
    const P = pouch(), pu = S.pull || { x: 0, y: 0 }, t = S.cur.t;
    S.tOld = S.trail; S.trail = [];
    const b = addBird(t, P.x + pu.x, P.y + pu.y); b.setLinearVelocity(V2(vx, vy)); b.setAngularVelocity(rnd(-1, 1));
    S.fly.push(b); S.cur = null; S.pull = null; SND.launch(t); S.cam.follow = b;
    return b;
  }
  function ability() {                                       // тап в полёте
    const b = S.fly.find(x => x.getUserData().main !== undefined && !x.getUserData().used && !x.getUserData().split);
    if (!b) return false; const u = b.getUserData(); if (u.used || u.hit) { if (u.t === "bomb" && !u.used) { explode(b); return true; } return false; }
    const v = b.getLinearVelocity(), sp = v.length() || 1;
    if (u.t === "chuck") { u.used = true; const k = Math.max(sp * 2.1, 25) / sp; b.setLinearVelocity(V2(v.x * k, v.y * k)); SND.zoom(); S.fx.push({ k: "ring", x: b.getPosition().x, y: b.getPosition().y, s: 0.9, life: 0.25, max: 0.25 }); return true; }
    if (u.t === "bomb") { explode(b); return true; }
    if (u.t === "blues") {
      u.used = true; const p = b.getPosition(), a0 = Math.atan2(v.y, v.x);
      [-0.16, 0.16].forEach(da => {                          // двое новых — чуть выше и чуть ниже по ходу полёта
        const a = a0 + da, sd = Math.sign(da), nb = addBird("blues", p.x - Math.sin(a0) * 0.5 * sd, p.y + Math.cos(a0) * 0.5 * sd);
        nb.getUserData().split = true; nb.getUserData().used = true; nb.getUserData().main = false; nb.setLinearVelocity(V2(Math.cos(a) * sp, Math.sin(a) * sp)); S.fly.push(nb);
      });
      SND.split(); puff(p.x, p.y, "#ffffff", 5, 0.3); return true;
    }
    if (u.t === "red") { u.used = true; SND.voice("red"); return true; }
    return false;
  }
  // скорость для попадания в точку (баллистика без сопротивления; низкая дуга); null — не долетит
  function solve(tx, ty, v) {
    const P = pouch(), dx = tx - P.x, dy = ty - P.y, v2 = v * v, disc = v2 * v2 - GRAV * (GRAV * dx * dx + 2 * dy * v2);
    if (disc < 0) return null; const a = Math.atan((v2 - Math.sqrt(disc)) / (GRAV * dx));
    return { vx: Math.cos(a) * v, vy: Math.sin(a) * v };
  }
  function calm() { return S.objs.every(b => !b.isAwake() || (b.getLinearVelocity().length() < 0.2 && Math.abs(b.getAngularVelocity()) < 0.4)); }

  /* ── камера и разметка ── */
  // масштаб: всё поле по ширине; в игре — крупнее, если над крепостью лишнее небо (до ×1,7), и не мельче 21 px/м (узкий экран);
  // крупнее поля — камера ездит, как в Angry Birds: «дом» — рогатка у левого края
  function layout(cw, ch, game) {
    const c = S.cam; c.cw = cw; c.ch = ch; c.gs = ch * (cfg.face ? 0.8 : 0.82);
    const fit = cw / (S.lw - S.x0); let s = fit;
    if (game) { s = clamp(c.gs / S.top, fit, fit * 1.7); if (fit < 21) s = Math.max(s, 21); }
    c.full = s <= fit * 1.03; c.s = c.full ? fit : s; c.vw = cw / c.s;
    c.minX = S.x0; c.maxX = Math.max(S.x0, S.lw - c.vw);
    c.home = c.full ? S.x0 : clamp(S.sx - c.vw * 0.2, c.minX, c.maxX);
    c.x = clamp(c.x, c.minX, c.maxX); c.tx = clamp(c.tx, c.minX, c.maxX);
  }
  const X = x => (x - S.cam.x) * S.cam.s + S.cam.sx0, Y = y => S.cam.gs - y * S.cam.s + S.cam.sy0;
  function bgMap(im) {                                        // земля картинки — на линии gs; картинка покрывает кадр и путь камеры
    const c = S.cam, iw = im.naturalWidth, ih = im.naturalHeight, range = c.cw + (c.maxX - c.minX) * c.s;
    const si = Math.max(c.gs / (LAND.gy * ih), (c.ch - c.gs) / ((1 - LAND.gy) * ih), range / iw);
    return { si, w: iw * si, h: ih * si, bx: (range - iw * si) / 2, oy: c.gs - LAND.gy * ih * si, iw, ih };
  }

  /* ── рисование ── */
  function spr(k, x, y, R, ang, sx, sy, alpha) {             // кадр персонажа: x, y — центр тела на экране, R — радиус тела в px
    const im = pic("ab-chars.webp"); if (!ready(im)) return;
    const f = CH[k], b = BODY[k], sc = R / (b[2] * f[2]);
    g.save(); g.translate(x, y); if (ang) g.rotate(ang); if (sx || sy) g.scale(sx || 1, sy || 1); if (alpha != null) g.globalAlpha = alpha;
    g.drawImage(im, f[0], f[1], f[2], f[3], -b[0] * f[2] * sc, -b[1] * f[3] * sc, f[2] * sc, f[3] * sc);
    g.restore();
  }
  function drawBg(sky) {
    const c = S.cam, im = pic(c.cw * DPR() > 1100 ? "ab-land.webp" : "ab-land-m.webp");
    if (!ready(im)) { if (sky) { const gr = g.createLinearGradient(0, 0, 0, c.gs); gr.addColorStop(0, "#4fc6ec"); gr.addColorStop(1, "#c9f1fb"); g.fillStyle = gr; g.fillRect(0, 0, c.cw, c.gs); } g.fillStyle = "#7a4a22"; g.fillRect(0, c.gs, c.cw, c.ch - c.gs); g.fillStyle = "#8fd61c"; g.fillRect(0, c.gs - 6, c.cw, 14); return; }
    const m = bgMap(im), px = (c.x - c.minX) * c.s;
    if (sky) {                                                // небо и холмы — дальше, едут медленнее (параллакс)
      if (m.oy > 0) { g.fillStyle = "#56c9ee"; g.fillRect(0, 0, c.cw, m.oy + 2); }
      g.drawImage(im, m.bx - px * 0.45 + S.cam.sx0 * 0.4, m.oy + S.cam.sy0 * 0.4, m.w, m.h);
    }
    const sy = LAND.gt * m.ih - 4;                            // полоса земли — вместе с миром
    g.drawImage(im, 0, sy, m.iw, m.ih - sy, m.bx - px + S.cam.sx0, m.oy + sy * m.si + S.cam.sy0, m.w, (m.ih - sy) * m.si);
    return m;
  }
  function shadow(x, y, half) {                               // мягкая тень на траве под предметом
    const h = y - half; if (h > 1.6) return;
    const k = 1 - h / 1.6, s = S.cam.s;
    g.fillStyle = `rgba(30,40,10,${0.26 * k})`; g.beginPath(); g.ellipse(X(x), Y(0) + 0.02 * s, half * s * (1.1 + h * 0.3), 0.13 * s * (0.6 + 0.4 * k), 0, 0, TAU); g.fill();
  }
  function drawBlock(b) {
    const u = b.getUserData(), p = b.getPosition(), s = S.cam.s, im = pic("ab-blocks.webp"); if (!ready(im)) return;
    const tx = BL[u.m], dmg = 1 - u.hp / u.max;
    let w = u.w * s, h = u.h * s, rot = -b.getAngle();
    g.save(); g.translate(X(p.x), Y(p.y)); g.rotate(rot);
    if (u.m === "ice") g.globalAlpha = 0.94;
    if (Math.abs(u.w / u.h - 1) < 0.4) {
      const f = dmg > 0.45 ? tx.crack : tx.sq; g.drawImage(im, f[0], f[1], f[2], f[3], -w / 2, -h / 2, w, h);
    } else {
      if (u.h > u.w) { g.rotate(Math.PI / 2); const t = w; w = h; h = t; }
      const f = tx.plank, cap = Math.min(w / 2, h * 0.8), sc = 120;      // концы доски — без растяжения, середина тянется
      g.drawImage(im, f[0], f[1], sc, f[3], -w / 2, -h / 2, cap, h);
      g.drawImage(im, f[0] + sc, f[1], f[2] - 2 * sc, f[3], -w / 2 + cap - 0.5, -h / 2, w - 2 * cap + 1, h);
      g.drawImage(im, f[0] + f[2] - sc, f[1], sc, f[3], w / 2 - cap, -h / 2, cap, h);
      g.globalAlpha = 1;
      g.fillStyle = "rgba(255,255,255,.22)"; g.fillRect(-w / 2 + cap * 0.5, -h / 2 + h * 0.08, w - cap, Math.max(1, h * 0.1));     // блик сверху — объём
      if (dmg > 0.25) {                                      // трещины на доске
        let r = u.seed; const rn = () => ((r = (r * 9301 + 49297) % 233280) / 233280);
        g.strokeStyle = u.m === "ice" ? "rgba(40,110,140,.75)" : "rgba(40,20,5,.7)"; g.lineWidth = Math.max(1, h * 0.07); g.beginPath();
        const n = 1 + Math.round(dmg * 3);
        for (let k = 0; k < n; k++) { let x = -w / 2 + w * (0.15 + 0.7 * rn()), y = -h / 2; g.moveTo(x, y); for (let j = 0; j < 4; j++) { x += (rn() - 0.5) * h * 0.8; y += h / 4; g.lineTo(x, y); } }
        g.stroke();
      }
    }
    g.restore();
  }
  function drawPig(b) {
    const u = b.getUserData(), p = b.getPosition(), s = S.cam.s, P = PIG[u.t], br = Math.sin(S.t * 2.2 + u.ph) * 0.025;
    const k = u.hp < u.max * 0.55 ? P.hurt : P.spr;
    spr(k, X(p.x), Y(p.y), u.r * s, -b.getAngle(), 1 - br * 0.6, 1 + br);
  }
  function drawBird(b) {
    const u = b.getUserData(), p = b.getPosition(), B = BIRD[u.t], s = S.cam.s, v = b.getLinearVelocity().length();
    const k = !u.hit && v > 2 ? B.fly : B.spr;
    spr(k, X(p.x), Y(p.y), u.r * s, -b.getAngle());
  }
  function drawBand(from, to, w, col) {
    g.strokeStyle = col; g.lineCap = "round"; g.lineWidth = Math.max(2, w * S.cam.s); g.beginPath(); g.moveTo(X(from.x), Y(from.y)); g.lineTo(X(to.x), Y(to.y)); g.stroke();
  }
  function drawSling(front) {
    const P = pouch(), s = S.cam.s, cur = S.cur, pu = S.pull || { x: 0, y: 0 };
    const bx = P.x + pu.x, by = P.y + pu.y, len = Math.hypot(pu.x, pu.y), bw = lerp(0.16, 0.08, clamp(len / MAXP, 0, 1));
    const r = cur ? BIRD[cur.t].r : 0.35, dl = len > 0.05 ? { x: pu.x / len, y: pu.y / len } : { x: -1, y: 0 };
    const back = { x: bx + dl.x * r * 0.75, y: by + dl.y * r * 0.75 };
    if (!front) {
      shadow(S.sx, 0.1, 0.55);
      const im = pic("ab-chars.webp"); if (ready(im)) { const f = CH.sling; g.drawImage(im, f[0], f[1], f[2], f[3], X(P.x0), Y(P.y0 + P.h), P.w * s, P.h * s); }
      if (cur) drawBand(P.ra, back, bw, "#4a160b");
      else drawBand(P.ra, { x: P.x, y: P.y - 0.05 }, 0.12, "#4a160b");
      return;
    }
    if (cur) {
      // кожаный «карман» за птицей, потом передняя резинка поверх
      g.fillStyle = "#3a1a0c"; g.beginPath(); g.ellipse(X(back.x), Y(back.y), 0.16 * s, 0.3 * s, -Math.atan2(dl.y, dl.x), 0, TAU); g.fill();
      drawBand(P.la, back, bw * 1.1, "#6e2213");
    } else drawBand(P.la, { x: P.x, y: P.y - 0.05 }, 0.13, "#6e2213");
  }
  function drawTrail(list, a) {
    g.fillStyle = `rgba(255,255,255,${a})`;
    list.forEach(d => { g.beginPath(); g.arc(X(d.x), Y(d.y), (d.big ? 0.11 : 0.065) * S.cam.s, 0, TAU); g.fill(); });
  }
  function drawFx() {
    const s = S.cam.s;
    S.fx.forEach(f => {
      const k = clamp(f.life / f.max, 0, 1);
      if (f.k === "feather") { g.save(); g.translate(X(f.x), Y(f.y)); g.rotate(f.a); g.globalAlpha = Math.min(1, k * 2); g.fillStyle = f.col; g.beginPath(); g.ellipse(0, 0, f.s * s, f.s * s * 0.36, 0, 0, TAU); g.fill(); g.strokeStyle = "rgba(0,0,0,.25)"; g.lineWidth = 1; g.beginPath(); g.moveTo(-f.s * s, 0); g.lineTo(f.s * s, 0); g.stroke(); g.restore(); }
      else if (f.k === "shard") { g.save(); g.translate(X(f.x), Y(f.y)); g.rotate(f.a); g.globalAlpha = Math.min(1, k * 2.5); g.fillStyle = f.col; g.fillRect(-f.s * s / 2, -f.s * s * 0.3, f.s * s, f.s * s * 0.6); g.restore(); }
      else if (f.k === "smoke") { g.globalAlpha = k * 0.85; g.fillStyle = f.col; g.beginPath(); g.arc(X(f.x), Y(f.y), f.s * s * (1.6 - k * 0.6), 0, TAU); g.fill(); g.globalAlpha = 1; }
      else if (f.k === "flash") { const R = f.s * s * (1.2 - k * 0.4), gr = g.createRadialGradient(X(f.x), Y(f.y), 0, X(f.x), Y(f.y), R); gr.addColorStop(0, `rgba(255,255,230,${k})`); gr.addColorStop(0.4, `rgba(255,190,60,${k * 0.8})`); gr.addColorStop(1, "rgba(255,120,20,0)"); g.fillStyle = gr; g.beginPath(); g.arc(X(f.x), Y(f.y), R, 0, TAU); g.fill(); }
      else if (f.k === "ring") { g.strokeStyle = `rgba(255,255,255,${k * 0.9})`; g.lineWidth = Math.max(2, 0.12 * s * k); g.beginPath(); g.arc(X(f.x), Y(f.y), f.s * s * (1 - k * 0.8), 0, TAU); g.stroke(); }
      else if (f.k === "text") {
        const fs = Math.max(13, 0.55 * s); g.font = `900 ${fs}px ${FONT}`; g.textAlign = "center"; g.textBaseline = "middle"; g.globalAlpha = Math.min(1, k * 2.2);
        g.lineJoin = "round"; g.lineWidth = fs * 0.22; g.strokeStyle = "#1f3a0a"; g.strokeText(f.txt, X(f.x), Y(f.y)); g.fillStyle = f.col; g.fillText(f.txt, X(f.x), Y(f.y)); g.globalAlpha = 1;
      }
    });
  }
  function drawAim() {                                        // пунктир прицела: куда полетит (первые ~0,7 с)
    if (!S.cur || !S.pull) return; const P = pouch(), pu = S.pull, k = 1 / MAXP * VMAX;
    let x = P.x + pu.x, y = P.y + pu.y; const vx = -pu.x * k, vy = -pu.y * k;
    for (let i = 1; i <= 11; i++) {
      const t = i * 0.07, px = x + vx * t, py = y + vy * t - GRAV * t * t / 2;
      g.fillStyle = `rgba(255,255,255,${0.9 - i * 0.07})`; g.beginPath(); g.arc(X(px), Y(py), Math.max(2.6, (0.12 - i * 0.005) * S.cam.s), 0, TAU); g.fill();
    }
  }
  function drawWorld(sky) {
    const c = S.cam, s = c.s, sh = S.shake;
    c.sx0 = sh > 0 ? Math.sin(S.t * 90) * sh * 0.18 * s : 0; c.sy0 = sh > 0 ? Math.cos(S.t * 77) * sh * 0.12 * s : 0;
    const m = drawBg(sky);
    drawTrail(S.tOld, 0.45); drawTrail(S.trail, 0.95);
    // тени, потом блоки, свиньи, птицы
    S.objs.forEach(b => { const u = b.getUserData(), p = b.getPosition(); shadow(p.x, p.y, u.k === "block" ? Math.max(u.w, u.h) / 2 : u.r); });
    drawSling(false);
    S.line.forEach((q, i) => {                              // очередь птиц у рогатки: подпрыгивают, смотрят на рогатку
      const B = BIRD[q.t], hop = Math.max(0, Math.sin((S.t + q.hop) * 2.4)) ** 6 * 0.45, y = B.r + hop;
      shadow(q.x, y, B.r); spr(B.spr, X(q.x), Y(y), B.r * s, Math.sin(S.t * 2 + q.ph) * 0.05, 1 + hop * 0.15, 1 - hop * 0.12);
    });
    S.objs.forEach(b => { if (b.getUserData().k === "block") drawBlock(b); });
    S.objs.forEach(b => { if (b.getUserData().k === "pig") drawPig(b); });
    if (S.load) { const q = S.load, k = q.k, x = lerp(q.x0, q.x1, k), y = lerp(q.y0, q.y1, k) + Math.sin(k * Math.PI) * 1.2; spr(BIRD[q.t].spr, X(x), Y(y), BIRD[q.t].r * s, -k * TAU); }
    if (S.cur) { const P = pouch(), pu = S.pull || { x: 0, y: 0 }; spr(BIRD[S.cur.t].spr, X(P.x + pu.x), Y(P.y + pu.y), BIRD[S.cur.t].r * s, pu.x < -0.2 ? Math.atan2(pu.y, -pu.x) * 0.4 : 0); }
    S.objs.forEach(b => { if (b.getUserData().k === "bird") drawBird(b); });
    drawSling(true); drawAim(); drawFx();
    // птица выше кадра — метка у верхнего края
    S.fly.forEach(b => { const p = b.getPosition(); if (Y(p.y) < -10 && X(p.x) > 0 && X(p.x) < c.cw) { const u = b.getUserData(); g.fillStyle = "rgba(255,255,255,.85)"; g.beginPath(); g.arc(X(p.x), 16, 13, 0, TAU); g.fill(); spr(BIRD[u.t].spr, X(p.x), 16, 9, 0); } });
    return m;
  }
  return { S, build, step, layout, drawWorld, launch, ability, solve, pouch, calm, addBird, X, Y, spr, g, cv };
}

/* ═════════ рамки, кнопки и текст «как в игре» ═════════ */
function txt(g, s, x, y, size, col, opt) {
  opt = opt || {}; g.font = `900 ${size}px ${FONT}`; g.textAlign = opt.al || "center"; g.textBaseline = "middle"; g.lineJoin = "round";
  if (opt.depth !== 0) { g.fillStyle = opt.dc || "#2b1405"; g.strokeStyle = opt.dc || "#2b1405"; g.lineWidth = size * 0.26; g.strokeText(s, x, y + size * 0.1); g.fillText(s, x, y + size * 0.1); }
  g.lineWidth = size * 0.22; g.strokeStyle = opt.oc || "#2b1405"; g.strokeText(s, x, y); g.fillStyle = col; g.fillText(s, x, y);
}
function star(g, x, y, r, fill, k) {                         // звезда: золотая с бликом или тёмная пустая
  g.save(); g.translate(x, y); g.scale(k == null ? 1 : k, k == null ? 1 : k); g.beginPath();
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.48 : r; g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
  g.closePath(); g.lineJoin = "round"; g.lineWidth = r * 0.22; g.strokeStyle = "#3a1f04"; g.stroke();
  if (fill) { const gr = g.createLinearGradient(0, -r, 0, r); gr.addColorStop(0, "#fff7b0"); gr.addColorStop(0.45, "#ffd21f"); gr.addColorStop(1, "#e88a00"); g.fillStyle = gr; }
  else g.fillStyle = "rgba(40,30,20,.55)";
  g.fill(); g.restore();
}
function rrect(g, x, y, w, h, r) { g.beginPath(); g.roundRect(x, y, w, h, r); }
function glossBtn(g, b, hover) {                              // круглая глянцевая кнопка с иконкой (▶ ↻ ☰ ⏵)
  const { x, y, r, ic, col } = b, c = col || ["#9be04a", "#3f9a0e", "#24600a"];
  g.save(); g.translate(x, y + (hover ? 2 : 0));
  g.fillStyle = "rgba(0,0,0,.35)"; g.beginPath(); g.arc(0, r * 0.14, r * 1.02, 0, TAU); g.fill();
  const gr = g.createLinearGradient(0, -r, 0, r); gr.addColorStop(0, c[0]); gr.addColorStop(0.6, c[1]); gr.addColorStop(1, c[2]);
  g.fillStyle = gr; g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fill(); g.lineWidth = r * 0.12; g.strokeStyle = "#1b2a06"; g.stroke();
  g.fillStyle = "rgba(255,255,255,.35)"; g.beginPath(); g.ellipse(0, -r * 0.45, r * 0.62, r * 0.32, 0, 0, TAU); g.fill();
  g.fillStyle = "#fff"; g.strokeStyle = "#1b2a06"; g.lineWidth = r * 0.1; g.lineJoin = "round"; g.lineCap = "round"; const q = r * 0.42;
  if (ic === "play") { g.beginPath(); g.moveTo(-q * 0.6, -q); g.lineTo(q, 0); g.lineTo(-q * 0.6, q); g.closePath(); g.stroke(); g.fill(); }
  else if (ic === "redo") { g.lineWidth = r * 0.2; g.strokeStyle = "#1b2a06"; g.beginPath(); g.arc(0, 0, q, -2.4, 2.2); g.stroke(); g.lineWidth = r * 0.12; g.strokeStyle = "#fff"; g.beginPath(); g.arc(0, 0, q, -2.4, 2.2); g.stroke(); g.beginPath(); g.moveTo(q * 0.15, -q * 1.45); g.lineTo(q * 1.05, -q * 0.75); g.lineTo(q * 0.05, -q * 0.3); g.closePath(); g.fillStyle = "#fff"; g.lineWidth = r * 0.06; g.strokeStyle = "#1b2a06"; g.stroke(); g.fill(); }
  else if (ic === "menu") { [-0.55, 0, 0.55].forEach(k => { rrect(g, -q, k * q - q * 0.17, q * 2, q * 0.34, q * 0.17); g.stroke(); g.fill(); }); }
  g.restore();
}
const hitBtn = (b, x, y) => Math.hypot(x - b.x, y - b.y) <= b.r * 1.15;

/* ═════════ игра на обороте ═════════ */
function loadStars() { try { const a = JSON.parse(LSG("unitka.abStars") || "[]"); return LEVELS.map((_, i) => clamp(+a[i] || 0, 0, 3)); } catch (e) { return LEVELS.map(() => 0); } }
function stars() { const a = loadStars(); return [a.reduce((x, y) => x + y, 0), LEVELS.length * 3]; }

function mount(cv, opts) {
  opts = opts || {};
  const sc = Scene(cv, { face: false }), S = sc.S, g = sc.g;
  const G = { mode: "select", lv: 0, over: null, st: loadStars(), btns: [], tiles: [], msg: null, tip: null, res: null, bonus: [], drag: null, hover: null, t0: 0, wait: 0, hint: 0, intro: 0 };
  let cw = 0, ch = 0, raf = 0, running = false, last = 0, acc = 0;
  const ro = new ResizeObserver(() => size()); ro.observe(cv);
  function size() {                                           // размер — по вёрстке (clientWidth), а не по рамке на экране: карточка бывает повёрнута
    if (!cv.clientWidth || !cv.clientHeight) return;
    cw = cv.clientWidth; ch = cv.clientHeight; const d = DPR(); cv.width = Math.round(cw * d); cv.height = Math.round(ch * d);
    sc.layout(cw, ch, true); draw();                          // мельче 21 px на метр — камера ездит (узкий экран)
  }
  function start(i) {
    G.lv = i; sc.build(LEVELS[i]); G.mode = "intro"; G.over = null; G.res = null; G.bonus = []; G.intro = 0; G.hint = 0;
    size(); S.cam.x = S.cam.tx = S.cam.full ? S.cam.home : S.cam.maxX;            // на узком экране — сначала крепость, потом к рогатке
    S.onKill = null; loadSfx();
  }
  function nextBird() {                                       // птица из очереди прыгает в рогатку
    const q = S.line.shift(); if (!q) return false; const P = sc.pouch();
    S.load = { t: q.t, x0: q.x, y0: BIRD[q.t].r, x1: P.x, y1: P.y, k: 0 };
    S.line.forEach(z => { z.tx = z.x + (S.sp || 1.15); });
    return true;
  }
  function tipFor(t) { const B = BIRD[t]; if (B.tip && !G["tip_" + t]) { G["tip_" + t] = 1; G.tip = { s: B.tip, life: 3.2 }; } }

  /* ── обновление ── */
  function update() {
    sc.step(); const c = S.cam;
    S.line.forEach(z => { if (z.tx != null) { z.x = lerp(z.x, z.tx, 0.12); if (Math.abs(z.x - z.tx) < 0.01) { z.x = z.tx; z.tx = null; } } });
    if (S.load) { S.load.k += STEP / 0.45; if (S.load.k >= 1) { S.cur = { t: S.load.t }; S.load = null; G.mode = "aim"; tipFor(S.cur.t); smp("grass", 0.3); } }
    if (G.mode === "intro") {
      G.intro += STEP;
      if (G.intro > (c.full ? 1.1 : 1.5)) { c.tx = c.home; if (!S.load && !S.cur) nextBird(); G.mode = "load"; }
    }
    if (G.mode === "fly") {
      if (!S.fly.length) { G.mode = "wait"; G.wait = 0; }
      else if (!c.full && !G.drag) { const b = S.cam.follow && S.fly.includes(S.cam.follow) ? S.cam.follow : S.fly[0]; c.tx = clamp(b.getPosition().x - c.vw * 0.4, c.minX, c.maxX); }
    }
    if (G.mode === "wait") {
      G.wait += STEP;
      if ((G.wait > 0.6 && sc.calm()) || G.wait > 4) {
        if (S.pigs <= 0) win();
        else if (!S.line.length) lose();
        else { G.mode = "load"; if (!G.drag) c.tx = c.home; nextBird(); }
      }
    }
    if (G.mode === "bonus") {
      G.wait += STEP;
      if (G.wait > 0.5) { G.wait = 0; const q = S.line.shift(); if (q) { S.score += 10000; S.fx.push({ k: "text", x: q.x, y: 1.4, txt: "10 000", col: "#ffd21f", life: 1.4, max: 1.4 }); SND.bonus(); S.fx.push({ k: "smoke", x: q.x, y: 0.5, vx: 0, vy: 0.5, col: "#ffffff", s: 0.4, life: 0.5, max: 0.5 }); } else results(true); }
    }
    if (G.res) G.res.t += STEP;
    if (G.tip) { G.tip.life -= STEP; if (G.tip.life <= 0) G.tip = null; }
    if (G.mode === "aim" && !S.pull) G.hint += STEP;
    // камера: плавно к цели
    if (!G.drag || G.drag.k !== "pan") c.x = lerp(c.x, c.tx, G.mode === "fly" ? 0.12 : 0.07);
  }
  function win() { G.mode = "bonus"; G.wait = 0; S.cur = null; S.load = null; c_tx(S.cam.home); }
  function c_tx(x) { S.cam.tx = clamp(x, S.cam.minX, S.cam.maxX); }
  function lose() { results(false); }
  function results(ok) {
    const L = LEVELS[G.lv], n = ok ? (S.score >= L.s3 ? 3 : S.score >= L.s2 ? 2 : 1) : 0;
    G.mode = "end"; G.res = { ok, n, t: 0, score: S.score, played: 0 };
    if (ok && n > G.st[G.lv]) { G.st[G.lv] = n; LSS("unitka.abStars", JSON.stringify(G.st)); if (opts.onStars) opts.onStars(stars()); }
    if (ok) SND.win(); else SND.lose();
  }

  /* ── рисование ── */
  function draw() {
    if (!cw) return; const d = DPR(); g.setTransform(d, 0, 0, d, 0, 0); g.clearRect(0, 0, cw, ch);
    G.btns = []; G.tiles = [];
    if (G.mode === "select" || !S.W) { drawSelect(); return; }
    sc.drawWorld(true);
    // счёт и уровень — слева сверху, как в игре
    const fs = clamp(ch * 0.075, 15, 34);
    txt(g, S.score.toLocaleString("ru-RU"), 12, 12 + fs * 0.6, fs, "#ffffff", { al: "left" });
    txt(g, "Уровень " + (G.lv + 1) + " · " + LEVELS[G.lv].name, 13, 12 + fs * 1.55, fs * 0.46, "#ffe66a", { al: "left", depth: 0 });
    // свиньи осталось
    if (G.mode === "intro") {
      const k = clamp(G.intro / 0.25, 0, 1) * clamp((1.4 - G.intro) / 0.3, 0, 1), s = clamp(ch * 0.13, 22, 64);
      g.globalAlpha = k; txt(g, "Уровень " + (G.lv + 1), cw / 2, ch * 0.36, s, "#ffffff"); txt(g, LEVELS[G.lv].name, cw / 2, ch * 0.36 + s * 0.95, s * 0.5, "#ffd21f"); g.globalAlpha = 1;
    }
    if (G.mode === "aim" && !S.pull && G.hint > 1.2 && G.lv === 0 && S.line.length === LEVELS[0].birds.length - 1) drawHand();
    if (G.tip) { g.globalAlpha = clamp(G.tip.life / 0.4, 0, 1); txt(g, G.tip.s, cw / 2, ch - Math.max(18, ch * 0.08), clamp(ch * 0.045, 12, 22), "#ffffff", { depth: 0 }); g.globalAlpha = 1; }
    if (G.res) drawResult();
    if (G.over === "pause") drawPause();
  }
  function drawHand() {                                       // подсказка на 1-м уровне: «тяни назад и отпусти»
    const P = sc.pouch(), k = (G.hint * 0.8) % 1.6, m = Math.min(1, k / 1.1), x = sc.X(P.x) - m * 0.9 * S.cam.s, y = sc.Y(P.y) + m * 0.45 * S.cam.s;
    g.globalAlpha = k < 1.3 ? 1 : (1.6 - k) / 0.3;
    g.font = `${Math.max(22, S.cam.s * 0.9)}px system-ui`; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("👆", x + 6, y + 18);
    txt(g, "Тяни назад и отпусти", sc.X(P.x) + 1.2 * S.cam.s, sc.Y(P.y) - 1.9 * S.cam.s, clamp(ch * 0.05, 12, 22), "#ffffff", { al: "left", depth: 0 });
    g.globalAlpha = 1;
  }
  function panel(w, h, top) {                                 // доска-панель: тёмная подложка, синяя плашка в рамке
    const x = (cw - w) / 2, y = top != null ? top : (ch - h) / 2;
    g.fillStyle = "rgba(10,20,40,.55)"; g.fillRect(0, 0, cw, ch);
    g.fillStyle = "rgba(0,0,0,.35)"; rrect(g, x, y + 8, w, h, 22); g.fill();
    const gr = g.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, "#2f6fb8"); gr.addColorStop(1, "#173c74");
    g.fillStyle = gr; rrect(g, x, y, w, h, 22); g.fill(); g.lineWidth = 5; g.strokeStyle = "#0b1f3f"; g.stroke();
    g.strokeStyle = "rgba(255,255,255,.25)"; g.lineWidth = 2; rrect(g, x + 6, y + 6, w - 12, h - 12, 17); g.stroke();
    return { x, y };
  }
  // низкая карточка (телефон стоя): панель ниже кнопок карточки, звёзды и счёт слева, кнопки справа
  const lowH = () => ch < 260;
  function starsRow(R, cx, cy, r, gap) {
    for (let i = 0; i < 3; i++) {
      const t = R.t - 0.35 - i * 0.45, k = t < 0 ? 0 : t < 0.18 ? t / 0.18 * 1.3 : t < 0.3 ? 1.3 - (t - 0.18) / 0.12 * 0.3 : 1, on = i < R.n;
      if (on && t >= 0 && R.played <= i) { R.played = i + 1; SND.star(i); }
      const rr = i === 1 ? r * 1.2 : r, yy = cy - (i === 1 ? r * 0.3 : 0);
      star(g, cx + (i - 1) * gap, yy, rr, false); if (on && t >= 0) star(g, cx + (i - 1) * gap, yy, rr, true, k);
    }
  }
  function drawResult() {
    const R = G.res;
    if (lowH()) {
      const w = Math.min(cw - 16, 460), h = ch - 52, { x, y } = panel(w, h, 46), lx = x + w * 0.3, bx = x + w * 0.74, br = Math.min(21, h * 0.16);
      txt(g, R.ok ? "Уровень пройден!" : "Не пройден", cw / 2, y + 20, 17, R.ok ? "#ffd21f" : "#ff8a7a");
      if (R.ok) starsRow(R, lx, y + h * 0.5, Math.min(16, h * 0.12), 38); else sc.spr("pig_king", lx, y + h * 0.5, Math.min(26, h * 0.18), Math.sin(R.t * 6) * 0.08);
      txt(g, R.score.toLocaleString("ru-RU"), lx, y + h - 22, 17, "#ffffff");
      const ids = [["levels", "menu", ["#7fd3ff", "#2a8ad8", "#174f8a"]], ["again", "redo", ["#ffd76a", "#f0a20a", "#a8640a"]]];
      if (R.ok && G.lv < LEVELS.length - 1) ids.push(["next", "play", null]);
      G.btns = ids.map(([id, ic, col], i) => ({ id, ic, col, r: br * (id === "next" ? 1.15 : 1), x: bx + (i - (ids.length - 1) / 2) * br * 2.5, y: y + h * 0.58 }));
      G.btns.forEach(b => glossBtn(g, b, G.hover === b.id));
      return;
    }
    const w = Math.min(cw * 0.9, 460), h = Math.min(ch * 0.9, 300), { x, y } = panel(w, h), s = Math.min(w / 460, h / 300);
    txt(g, R.ok ? "Уровень пройден!" : "Уровень не пройден", cw / 2, y + 36 * s, 30 * s, R.ok ? "#ffd21f" : "#ff8a7a");
    if (R.ok) {
      for (let i = 0; i < 3; i++) {
        const t = R.t - 0.35 - i * 0.45, k = t < 0 ? 0 : t < 0.18 ? t / 0.18 * 1.3 : t < 0.3 ? 1.3 - (t - 0.18) / 0.12 * 0.3 : 1, on = i < R.n;
        if (on && t >= 0 && R.played <= i) { R.played = i + 1; SND.star(i); }
        star(g, cw / 2 + (i - 1) * 74 * s, y + (i === 1 ? 102 : 112) * s, (i === 1 ? 34 : 28) * s, false);
        if (on && t >= 0) star(g, cw / 2 + (i - 1) * 74 * s, y + (i === 1 ? 102 : 112) * s, (i === 1 ? 34 : 28) * s, true, k);
      }
    } else sc.spr("pig_king", cw / 2, y + 108 * s, 46 * s, Math.sin(R.t * 6) * 0.08);
    txt(g, R.score.toLocaleString("ru-RU"), cw / 2, y + 170 * s, 30 * s, "#ffffff");
    const by = y + h - 52 * s, br = 27 * s;
    G.btns = [{ id: "levels", x: cw / 2 - 80 * s, y: by, r: br, ic: "menu", col: ["#7fd3ff", "#2a8ad8", "#174f8a"] },
      { id: "again", x: cw / 2 + (R.ok ? 0 : 80) * s, y: by, r: br, ic: "redo", col: ["#ffd76a", "#f0a20a", "#a8640a"] }];
    if (R.ok && G.lv < LEVELS.length - 1) G.btns.push({ id: "next", x: cw / 2 + 80 * s, y: by, r: br * 1.15, ic: "play" });
    G.btns.forEach(b => glossBtn(g, b, G.hover === b.id));
  }
  function drawPause() {
    const low = lowH(), w = Math.min(cw * 0.9, 420), h = low ? ch - 52 : Math.min(ch * 0.86, 220), { y } = panel(w, h, low ? 46 : null), s = low ? Math.min(1, h / 150) * 0.75 : Math.min(w / 420, h / 220);
    txt(g, "Пауза", cw / 2, y + (low ? 22 : 40 * s), low ? 18 : 32 * s, "#ffffff");
    const by = y + h * 0.62, br = 30 * s;
    G.btns = [{ id: "levels", x: cw / 2 - 90 * s, y: by, r: br, ic: "menu", col: ["#7fd3ff", "#2a8ad8", "#174f8a"] },
      { id: "again", x: cw / 2, y: by, r: br, ic: "redo", col: ["#ffd76a", "#f0a20a", "#a8640a"] },
      { id: "resume", x: cw / 2 + 90 * s, y: by, r: br * 1.15, ic: "play" }];
    G.btns.forEach(b => glossBtn(g, b, G.hover === b.id));
  }
  function drawSelect() {
    const im = pic(cw * DPR() > 1100 ? "ab-land.webp" : "ab-land-m.webp");
    if (ready(im)) { const s = Math.max(cw / im.naturalWidth, ch / im.naturalHeight); g.drawImage(im, (cw - im.naturalWidth * s) / 2, ch - im.naturalHeight * s, im.naturalWidth * s, im.naturalHeight * s); }
    else { g.fillStyle = "#56c9ee"; g.fillRect(0, 0, cw, ch); }
    const fs = clamp(ch * 0.1, 18, 46), [got, all] = stars();
    if (lowH()) {                                             // низкая карточка: заголовок слева, справа — кнопки карточки
      txt(g, "Выбери уровень", 12, 22, 17, "#ffffff", { al: "left" });
      star(g, 20, 46, 7, true); txt(g, got + " из " + all, 31, 46, 11, "#ffd21f", { al: "left", depth: 0 });
    } else {
      txt(g, "Выбери уровень", cw / 2, ch * 0.16 + fs * 0.3, fs, "#ffffff");
      star(g, cw / 2 - fs * 1.7, ch * 0.16 + fs * 1.45, fs * 0.32, true); txt(g, got + " из " + all, cw / 2 - fs * 1.3, ch * 0.16 + fs * 1.45, fs * 0.5, "#ffd21f", { al: "left", depth: 0 });
    }
    const n = LEVELS.length, T2 = Math.min(cw * 0.15, ch * 0.3, 108), gap = T2 * 0.3, x0 = (cw - n * T2 - (n - 1) * gap) / 2, y0 = ch * (lowH() ? 0.6 : 0.52) - T2 / 2;
    for (let i = 0; i < n; i++) {
      const x = x0 + i * (T2 + gap), open = i === 0 || G.st[i - 1] > 0, hov = G.hover === "t" + i, cur = open && (i === n - 1 || G.st[i + 1 - 1] === 0) && G.st[i] === 0;
      const yy = y0 - (hov ? 3 : 0) + (cur ? Math.sin(performance.now() / 260) * 3 : 0);
      g.fillStyle = "rgba(0,0,0,.3)"; rrect(g, x, yy + T2 * 0.08, T2, T2, T2 * 0.2); g.fill();
      const gr = g.createLinearGradient(0, yy, 0, yy + T2);
      if (open) { gr.addColorStop(0, "#9fe2ff"); gr.addColorStop(0.55, "#3aa0e6"); gr.addColorStop(1, "#1c5fa8"); } else { gr.addColorStop(0, "#c9c9c9"); gr.addColorStop(1, "#7d7d7d"); }
      g.fillStyle = gr; rrect(g, x, yy, T2, T2, T2 * 0.2); g.fill(); g.lineWidth = Math.max(2, T2 * 0.05); g.strokeStyle = open ? "#0c2f5c" : "#3d3d3d"; g.stroke();
      g.fillStyle = "rgba(255,255,255,.3)"; rrect(g, x + T2 * 0.1, yy + T2 * 0.07, T2 * 0.8, T2 * 0.28, T2 * 0.14); g.fill();
      if (open) txt(g, String(i + 1), x + T2 / 2, yy + T2 * 0.47, T2 * 0.46, "#ffffff", { dc: "#0c2f5c", oc: "#0c2f5c" });
      else { g.fillStyle = "#3d3d3d"; rrect(g, x + T2 * 0.33, yy + T2 * 0.44, T2 * 0.34, T2 * 0.28, T2 * 0.05); g.fill(); g.lineWidth = T2 * 0.06; g.strokeStyle = "#3d3d3d"; g.beginPath(); g.arc(x + T2 / 2, yy + T2 * 0.44, T2 * 0.11, Math.PI, 0); g.stroke(); }
      for (let k = 0; k < 3; k++) star(g, x + T2 / 2 + (k - 1) * T2 * 0.3, yy + T2 + T2 * 0.2, T2 * 0.12, k < G.st[i]);
      if (open) G.tiles.push({ i, x, y: yy, w: T2, h: T2 });
    }
    if (cw > 520) txt(g, LEVELS.map((L, i) => (i + 1) + " " + L.name).join("  ·  "), cw / 2, Math.min(ch - 18, y0 + T2 * 1.62), clamp(ch * 0.032, 10, 15), "#ffffff", { depth: 0 });
  }

  /* ── ввод: тянуть назад и отпустить; справа на узком экране — смотреть поле; тап в полёте — умение ── */
  function pos(e) { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  function click(id) {
    SND.click();
    if (id === "levels") { G.mode = "select"; G.over = null; G.res = null; S.W = null; }
    else if (id === "again") start(G.lv);
    else if (id === "next") start(Math.min(G.lv + 1, LEVELS.length - 1));
    else if (id === "resume") G.over = null;
  }
  function down(e) {
    ac(); loadSfx(); const p = pos(e); cv.setPointerCapture && cv.setPointerCapture(e.pointerId);
    if (G.over || G.res) { const b = G.btns.find(b => hitBtn(b, p.x, p.y)); if (b) click(b.id); return; }
    if (G.mode === "select") { const t = G.tiles.find(t => p.x >= t.x && p.x <= t.x + t.w && p.y >= t.y && p.y <= t.y + t.h + t.w * 0.3); if (t) { SND.click(); start(t.i); } return; }
    if (G.mode === "fly") { if (sc.ability()) return; }
    const c = S.cam, home = c.full || Math.abs(c.x - c.home) < 0.6;
    if (G.mode === "aim" && S.cur && home && (c.full || p.x < cw * 0.55)) { G.drag = { k: "aim", x0: p.x, y0: p.y, last: 0 }; S.pull = { x: 0, y: 0 }; return; }
    if (!c.full) { G.drag = { k: "pan", x0: p.x, cx: c.x, moved: false }; }
  }
  function move(e) {
    const p = pos(e), c = S.cam;
    if (!G.drag) { const b = (G.over || G.res) ? G.btns.find(b => hitBtn(b, p.x, p.y)) : null, t = G.mode === "select" ? G.tiles.find(t => p.x >= t.x && p.x <= t.x + t.w && p.y >= t.y && p.y <= t.y + t.h) : null;
      G.hover = b ? b.id : t ? "t" + t.i : null; cv.style.cursor = b || t || (G.mode === "aim" && (c.full || p.x < cw * 0.55)) ? "pointer" : (c.full ? "default" : "grab"); return; }
    if (G.drag.k === "aim") {
      const k = (c.full ? 1 : 1.25) / c.s; let x = (p.x - G.drag.x0) * k, y = -(p.y - G.drag.y0) * k;
      const L = Math.hypot(x, y); if (L > MAXP) { x *= MAXP / L; y *= MAXP / L; }
      const P = sc.pouch(), r = BIRD[S.cur.t].r; if (P.y + y < r + 0.05) y = r + 0.05 - P.y;
      S.pull = { x, y };
      const q = Math.floor(Math.hypot(x, y) / MAXP * 4); if (q > G.drag.last) { G.drag.last = q; SND.stretch(q / 4); }
    } else if (G.drag.k === "pan") { const dx = p.x - G.drag.x0; if (Math.abs(dx) > 6) G.drag.moved = true; c.x = c.tx = clamp(G.drag.cx - dx / c.s, c.minX, c.maxX); }
  }
  function up() {
    const d = G.drag; G.drag = null; if (!d) return;
    if (d.k === "aim") {
      const pu = S.pull; if (!pu || Math.hypot(pu.x, pu.y) < 0.3) { S.pull = null; return; }
      const k = VMAX / MAXP; sc.launch(-pu.x * k, -pu.y * k); G.mode = "fly";
    } else if (d.k === "pan" && !d.moved && G.mode === "aim") S.cam.tx = S.cam.home;
  }
  cv.addEventListener("pointerdown", down); cv.addEventListener("pointermove", move);
  cv.addEventListener("pointerup", up); cv.addEventListener("pointercancel", () => { G.drag = null; if (S.pull) S.pull = null; });
  const onKey = e => { if (!running) return; if (e.key === "Escape" || e.key === "p" || e.key === "з") { if (menu() !== undefined) e.preventDefault(); } };
  window.addEventListener("keydown", onKey);
  const onVis = () => { if (document.hidden && running) { inst.pause(); inst._hid = true; } else if (!document.hidden && inst._hid) { inst._hid = false; inst.resume(); } };
  document.addEventListener("visibilitychange", onVis);

  function loop(now) {
    if (!running) return; raf = requestAnimationFrame(loop);
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (S.W && !G.over) { acc += dt; let n = 0; while (acc >= STEP && n < 4) { update(); acc -= STEP; n++; } if (n === 4) acc = 0; }
    else if (G.res) G.res.t += dt;
    draw();
  }
  function menu(on) {                                         // пауза — только когда идёт уровень
    if (!S.W || G.mode === "select" || G.res) return undefined;
    G.over = (on === undefined ? !G.over : on) ? "pause" : null; draw(); return G.over;
  }
  const inst = {
    resume() { if (running) return; running = true; last = performance.now(); acc = 0; size(); raf = requestAnimationFrame(loop); },
    pause() { running = false; cancelAnimationFrame(raf); G.drag = null; if (S.pull) S.pull = null; },
    menu,
    get playing() { return !!S.W && G.mode !== "select" && !G.res; },
    destroy() { inst.pause(); ro.disconnect(); window.removeEventListener("keydown", onKey); document.removeEventListener("visibilitychange", onVis); },
    dbg: { G, S, sc, start, results,
      shoot(ang, pw) { if (!S.cur) return false; const v = VMAX * pw; sc.launch(Math.cos(ang) * v, Math.sin(ang) * v); G.mode = "fly"; return true; },
      aimAt(x, y, pw) { if (!S.cur) return false; const v = sc.solve(x, y, VMAX * (pw || 0.95)); if (!v) return false; sc.launch(v.vx, v.vy); G.mode = "fly"; return true; },
      pigs() { return S.objs.filter(b => b.getUserData().k === "pig").map(b => ({ x: +b.getPosition().x.toFixed(2), y: +b.getPosition().y.toFixed(2), t: b.getUserData().t })); },
      state() { return { mode: G.mode, lv: G.lv, cur: S.cur ? S.cur.t : null, score: S.score, pigs: S.pigs, birds: S.line.length + (S.cur ? 1 : 0), fly: S.fly.length, res: G.res && { ok: G.res.ok, n: G.res.n }, objs: S.objs.length, cam: +S.cam.x.toFixed(2), full: S.cam.full, s: +S.cam.s.toFixed(1) }; },
      audio() { return { ctx: AU.a && AU.a.state, buf: !!AU.buf, on: AU.on }; } }
  };
  size();
  return inst;
}

/* ═════════ лицо баннера: живая сцена — рогатка, очередь птиц, домик и башня свиней; раз в несколько секунд выстрел ═════════ */
function face(cv, opts) {
  opts = opts || {};
  const sc = Scene(cv, { face: true }), S = sc.S, g = sc.g, red = reduced();
  let cw = 0, ch = 0, raf = 0, on = true, paused = false, vis = true, last = 0, acc = 0;
  const F = { phase: "idle", t: 0, next: 2.2, shots: 0, fade: 0, aim: null };
  sc.build(FACE);
  function nextBird() { const q = S.line.shift(); if (!q) return; const P = sc.pouch(); S.load = { t: q.t, x0: q.x, y0: BIRD[q.t].r, x1: P.x, y1: P.y, k: 0 }; S.line.forEach(z => { z.tx = z.x + (S.sp || 1.15); }); }
  nextBird(); S.load.k = 1;
  function size() {                                           // диорама наклонена (3D) — размер берём из вёрстки
    if (!cv.clientWidth || !cv.clientHeight) return;
    cw = cv.clientWidth; ch = cv.clientHeight; const d = DPR(); cv.width = Math.round(cw * d); cv.height = Math.round(ch * d);
    sc.layout(cw, ch, false);
    const im = pic(cw * d > 1100 ? "ab-land.webp" : "ab-land-m.webp");
    const send = () => { if (!ready(im) || !opts.onMap) return; S.cam.sx0 = S.cam.sy0 = 0; const c = S.cam, iw = im.naturalWidth, ih = im.naturalHeight, si = Math.max(c.gs / (LAND.gy * ih), (c.ch - c.gs) / ((1 - LAND.gy) * ih), c.cw / iw);
      opts.onMap({ src: im.getAttribute("src"), w: iw * si, h: ih * si, x: (c.cw - iw * si) / 2, y: c.gs - LAND.gy * ih * si }); };
    if (ready(im)) send(); else im.addEventListener("load", send, { once: true });
    draw();
  }
  function target() {                                         // цель выстрела: живая свинья (сначала нижние), с разбросом
    const pigs = S.objs.filter(b => b.getUserData().k === "pig"); if (!pigs.length) return null;
    const b = pigs[F.shots % pigs.length], p = b.getPosition(); return { x: p.x + rnd(-0.15, 0.25), y: p.y + rnd(-0.1, 0.2) };
  }
  function update(dt) {
    F.t += dt; sc.step();
    S.line.forEach(z => { if (z.tx != null) { z.x = lerp(z.x, z.tx, 0.12); if (Math.abs(z.x - z.tx) < 0.01) { z.x = z.tx; z.tx = null; } } });
    if (S.load) { S.load.k += STEP / 0.45; if (S.load.k >= 1) { S.cur = { t: S.load.t }; S.load = null; } }
    if (F.phase === "idle" && S.cur && F.t > F.next) {
      const tg = target(); if (!tg) { F.phase = "out"; F.t = 0; return; }
      const v = sc.solve(tg.x, tg.y, VMAX * rnd(0.84, 0.9)); if (!v) { F.next = F.t + 1; return; }
      F.aim = { x: -v.vx / VMAX * MAXP, y: -v.vy / VMAX * MAXP, v }; F.phase = "pull"; F.t = 0;
    } else if (F.phase === "pull") {
      const k = clamp(F.t / 0.75, 0, 1), e = 1 - (1 - k) ** 3; S.pull = { x: F.aim.x * e, y: F.aim.y * e };
      if (k >= 1 && F.t > 1) { const b = sc.launch(F.aim.v.vx, F.aim.v.vy); F.phase = "fly"; F.t = 0; F.shots++; F.bird = b; F.used = false; }
    } else if (F.phase === "fly") {
      const b = F.bird, u = b && b.getUserData();
      if (b && S.fly.includes(b) && !F.used && u.t !== "red") {                // умения в показе: рывок на вершине, взрыв после удара
        const v = b.getLinearVelocity();
        if (u.t === "chuck" && v.y < 1 && !u.hit) { sc.ability(); F.used = true; }
        if (u.t === "bomb" && u.hit && S.t - u.ht > 0.35) { sc.ability(); F.used = true; }
      }
      if (!S.fly.length && (sc.calm() || F.t > 4.5)) {
        if (S.pigs <= 0 || (!S.line.length && !S.cur)) { F.phase = "out"; F.t = 0; }
        else { F.phase = "idle"; F.t = 0; F.next = rnd(1.6, 2.6); nextBird(); }
      }
    } else if (F.phase === "out") {                           // всё сбито — гаснем и строим заново
      F.fade = clamp(F.t / 0.6, 0, 1);
      if (F.t > 1.8) { sc.build(FACE); nextBird(); S.load.k = 1; F.phase = "in"; F.t = 0; F.shots = 0; }
    } else if (F.phase === "in") { F.fade = 1 - clamp(F.t / 0.5, 0, 1); if (F.t > 0.5) { F.phase = "idle"; F.t = 0; F.next = 2.4; } }
  }
  function draw() {
    if (!cw) return; const d = DPR(); g.setTransform(d, 0, 0, d, 0, 0); g.clearRect(0, 0, cw, ch);
    sc.drawWorld(false);
    if (F.fade > 0) {                                         // «пуф» белого облака между раундами
      g.fillStyle = `rgba(255,255,255,${F.fade * 0.85})`; g.fillRect(0, S.cam.gs * 0.35, cw, ch);
    }
  }
  function loop(now) {
    if (!on) return; raf = 0;
    if (paused || !vis || document.hidden) return;
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.1, (now - last) / 1000); last = now; acc += dt; let n = 0;
    while (acc >= STEP && n < 3) { update(STEP); acc -= STEP; n++; } if (n === 3) acc = 0;
    if (F.phase === "idle" && !S.fx.length && !S.load) { F.odd = !F.odd; if (F.odd) return; }    // в простое — 30 кадров/с (телефону легче)
    draw();
  }
  function go() { if (!on || red) { draw(); return; } if (!raf && !paused && vis && !document.hidden) { last = performance.now(); acc = 0; raf = requestAnimationFrame(loop); } }
  const ro = new ResizeObserver(() => size()); ro.observe(cv);
  const io = new IntersectionObserver(es => { vis = es[0].isIntersecting; go(); }); io.observe(cv);
  const onVis = () => go(); document.addEventListener("visibilitychange", onVis);
  [pic("ab-chars.webp"), pic("ab-blocks.webp")].forEach(im => { if (!ready(im)) im.addEventListener("load", () => draw(), { once: true }); });
  size(); go();
  return {
    pause(p) { paused = !!p; if (paused) { cancelAnimationFrame(raf); raf = 0; } else go(); },
    destroy() { on = false; cancelAnimationFrame(raf); ro.disconnect(); io.disconnect(); document.removeEventListener("visibilitychange", onVis); },
    relayout: size, dbg: { S, F }
  };
}
function mute(off) { AU.on = !off; LSS("unitka.abMute", off ? "1" : "0"); if (!off) loadSfx(); }
window.BirdsGame = { mount, face, mute, stars, LEVELS };
})();
