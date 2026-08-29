"use strict";
/* Shape Defense — a shapes-only remake of the fortress-TD genre.
 * Vanilla JS + Canvas 2D. No assets, no dependencies. */

/* ============================== helpers ============================== */
const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const dist = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);
const rand = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(rand(a, b + 1));
const pick = arr => arr[(Math.random() * arr.length) | 0];

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/* ============================== canvas ============================== */
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
let W = 0, H = 0, CX = 0, CY = 0, SCALE = 1;

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width = W + "px";
  canvas.style.height = H + "px";
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  CX = W / 2;
  CY = H / 2;
  SCALE = clamp(Math.min(W, H) / 700, 0.62, 1.25);
  layoutSlots();
  makeStars();
}
window.addEventListener("resize", resize);

function poly(x, y, r, sides, rot = 0) {
  ctx.beginPath();
  for (let i = 0; i < sides; i++) {
    const a = rot + (i / sides) * TAU - Math.PI / 2;
    const px = x + Math.cos(a) * r;
    const py = y + Math.sin(a) * r;
    i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
  }
  ctx.closePath();
}

/* ============================== audio ============================== */
let audioCtx = null;
let muted = localStorage.getItem("shapeDefense.muted") === "1";

function ensureAudio() {
  if (!audioCtx) {
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { /* no audio */ }
  }
  if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
  startMusic();
}

function blip(freq, dur, type = "square", vol = 0.05, slide = 0) {
  if (muted || !audioCtx || audioCtx.state !== "running") return;
  const t = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
  gain.gain.setValueAtTime(vol, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(gain).connect(audioCtx.destination);
  osc.start(t);
  osc.stop(t + dur);
}
const sfx = {
  shoot: () => blip(rand(680, 760), 0.06, "square", 0.015, -300),
  boom: () => blip(rand(120, 160), 0.25, "sawtooth", 0.05, -80),
  bigBoom: () => blip(90, 0.5, "sawtooth", 0.09, -60),
  hitFort: () => blip(70, 0.3, "triangle", 0.09, -30),
  build: () => blip(330, 0.12, "triangle", 0.06, 220),
  upgrade: () => blip(440, 0.15, "triangle", 0.06, 320),
  sell: () => blip(300, 0.15, "triangle", 0.05, -160),
  card: () => blip(520, 0.2, "sine", 0.07, 260),
  waveStart: () => blip(220, 0.3, "sawtooth", 0.05, 110),
  waveClear: () => { blip(392, 0.12, "triangle", 0.06); setTimeout(() => blip(523, 0.12, "triangle", 0.06), 110); setTimeout(() => blip(659, 0.22, "triangle", 0.06), 220); },
  deny: () => blip(140, 0.12, "square", 0.05, -40),
  zap: () => blip(rand(1200, 1600), 0.1, "sawtooth", 0.03, -900),
  snipe: () => blip(500, 0.12, "square", 0.02, -250),
  warn: () => { blip(180, 0.22, "square", 0.05, -40); setTimeout(() => blip(180, 0.22, "square", 0.05, -40), 280); },
  gameOver: () => { blip(220, 0.4, "sawtooth", 0.08, -120); setTimeout(() => blip(150, 0.7, "sawtooth", 0.08, -90), 250); },
};

/* ---- generative soundtrack ---- */
const MUSIC_NOTES = [110, 130.81, 146.83, 164.81, 196]; // A minor pentatonic
let musicTimer = null;
let musicStep = 0;
function musicTick() {
  if (muted || !audioCtx || audioCtx.state !== "running") return;
  const bossWave = G.wave > 0 && G.wave % 5 === 0 && G.state === "playing";
  const inGame = G.state === "playing" || G.state === "intermission";
  if (musicStep % 2 === 0) blip(bossWave ? 82.4 : 55, 0.32, "sine", 0.04, -8);
  if (Math.random() < (inGame ? 0.55 : 0.3)) {
    const note = MUSIC_NOTES[(Math.random() * MUSIC_NOTES.length) | 0] * (Math.random() < 0.3 ? 2 : 1);
    blip(note, 0.5, "triangle", 0.016);
  }
  if (bossWave && musicStep % 4 === 2) blip(41.2, 0.4, "sawtooth", 0.028, -5);
  musicStep++;
}
function startMusic() {
  if (!musicTimer) musicTimer = setInterval(musicTick, 280);
}

/* ============================== data ============================== */
const TURRET_TYPES = {
  blaster: { name: "BLASTER", color: "#35e0ff", cls: "tri", sides: 3, kind: "bullet",
    cost: 40, dmg: 8, rate: 3.0, range: 250, speed: 540,
    desc: "Rapid single-target fire" },
  cannon: { name: "CANNON", color: "#ffb03a", cls: "sq", sides: 4, kind: "bullet",
    cost: 70, dmg: 24, rate: 0.8, range: 290, speed: 380, splash: 70,
    desc: "Slow splash damage" },
  laser: { name: "LASER", color: "#ff53d4", cls: "dia", sides: 4, kind: "beam",
    cost: 90, dps: 30, range: 320,
    desc: "Piercing beam" },
  frost: { name: "FROST", color: "#8aa6ff", cls: "hex", sides: 6, kind: "pulse",
    cost: 60, pulse: 1.3, pulseDmg: 5, slow: 0.45, slowDur: 1.7, range: 185,
    desc: "Slows nearby enemies" },
  missile: { name: "MISSILE", color: "#6dff8c", cls: "pent", sides: 5, kind: "missile",
    cost: 110, dmg: 40, rate: 0.7, range: 9999, speed: 300, turn: 4.2, splash: 55,
    desc: "Homing, hunts the biggest threat" },
  tesla: { name: "TESLA", color: "#ffe94d", cls: "oct", sides: 8, kind: "tesla",
    cost: 130, dmg: 26, rate: 1.1, range: 240, chains: 2, chainRange: 120,
    desc: "Chain lightning arcs between enemies" },
};
const TURRET_ORDER = ["blaster", "cannon", "frost", "laser", "missile", "tesla"];
const MAX_LEVEL = 3;
const upgradeCost = (type, level) => Math.round(TURRET_TYPES[type].cost * (level === 1 ? 1.2 : 2.0));
const levelMul = level => Math.pow(1.65, level - 1);

const ENEMY_TYPES = {
  tri:  { sides: 3, r: 10, hp: 14, speed: 66, dmg: 12, energy: 4,  color: "#ff6161" },
  sq:   { sides: 4, r: 13, hp: 36, speed: 46, dmg: 20, energy: 7,  color: "#ff9a3d" },
  pent: { sides: 5, r: 17, hp: 95, speed: 33, dmg: 34, energy: 13, color: "#d05cff" },
  hex:  { sides: 6, r: 15, hp: 62, speed: 52, dmg: 26, energy: 15, color: "#ffd23f", splits: 3 },
  shoot:{ sides: 4, r: 12, hp: 55, speed: 42, dmg: 22, energy: 12, color: "#ff4d9b", shooter: true, shotEvery: 2.4, holdRange: 300 },
  boss: { sides: 8, r: 40, hp: 950, speed: 26, dmg: 0, energy: 170, color: "#ff3d6e", boss: true, pulseDmg: 55, pulseEvery: 2.0 },
  boss2:{ sides: 10, r: 36, hp: 800, speed: 30, dmg: 0, energy: 170, color: "#b44dff", boss: true, carrier: true, pulseEvery: 3.0, holdRange: 280 },
};

const PERKS = [
  { id: "dmg",    name: "DAMAGE CORE",    cls: "tri",  color: "#ff6161", desc: "All turret damage +20%" },
  { id: "rate",   name: "OVERCLOCK",      cls: "sq",   color: "#ffb03a", desc: "Turret fire rate +15%" },
  { id: "repair", name: "NANO REPAIR",    cls: "hex",  color: "#38ffb0", desc: "Restore 40% fortress hull", once: true },
  { id: "hull",   name: "REINFORCED HULL",cls: "hex",  color: "#8aa6ff", desc: "Max hull +25% (and heal it)" },
  { id: "energy", name: "ENERGY SIPHON",  cls: "dia",  color: "#35e0ff", desc: "Energy from kills +25%" },
  { id: "crit",   name: "CRITICAL MATRIX",cls: "dia",  color: "#ff53d4", desc: "+10% crit chance (x2.5 dmg)" },
  { id: "velo",   name: "VELOCITY ROUNDS",cls: "pent", color: "#6dff8c", desc: "Projectile speed +30%, range +10%" },
  { id: "fort",   name: "FORTRESS GUNNERY", cls: "hex", color: "#fff06a", desc: "Fortress cannon damage +60%" },
];

/* ---- permanent meta-progression (persists across runs) ---- */
const META_UPGRADES = [
  { id: "hull",  name: "HULL PLATING", desc: "+10% max hull per level",      cls: "hex",  color: "#8aa6ff", max: 5 },
  { id: "dmg",   name: "DAMAGE AMP",   desc: "+5% turret damage per level",  cls: "tri",  color: "#ff6161", max: 5 },
  { id: "react", name: "REACTOR",      desc: "+15 starting energy per level", cls: "dia",  color: "#35e0ff", max: 5 },
  { id: "harv",  name: "HARVESTER",    desc: "+5% kill energy per level",    cls: "pent", color: "#6dff8c", max: 5 },
];
let meta = { hull: 0, dmg: 0, react: 0, harv: 0 };
try { meta = { ...meta, ...JSON.parse(localStorage.getItem("shapeDefense.meta") || "{}") }; } catch (e) { /* fresh start */ }
let cores = +(localStorage.getItem("shapeDefense.cores") || 0) || 0;
const metaCost = level => Math.round(10 * Math.pow(1.7, level));
let elite = localStorage.getItem("shapeDefense.elite") === "1";
const enemyDmgMul = () => (elite ? 1.4 : 1);
function saveMeta() {
  localStorage.setItem("shapeDefense.meta", JSON.stringify(meta));
  localStorage.setItem("shapeDefense.cores", String(cores));
}

/* ============================== state ============================== */
const G = {
  state: "menu", // menu | intermission | playing | picking | paused | gameover
  pausedFrom: null,
  wave: 0,
  energy: 0,
  kills: 0,
  score: 0,
  time: 0,
  countdown: 0,
  fortress: { hp: 500, maxHp: 500, r: 46, rot: 0, gunAngle: 0, gunCd: 0, gunTarget: null, flash: 0 },
  perks: {},
  slots: [],
  selectedSlot: -1,
  enemies: [],
  bullets: [],
  missiles: [],
  beams: [],
  particles: [],
  rings: [],
  floaters: [],
  motes: [],
  enemyShots: [],
  bolts: [],
  ambient: [],
  hitStop: 0,
  spawnQueue: [],
  spawnTimer: 0,
  spawnInterval: 1,
  shake: 0,
  highScore: +(localStorage.getItem("shapeDefense.highScore") || 0),
};

const perkCount = id => G.perks[id] || 0;
const dmgMul = () => (1 + 0.2 * perkCount("dmg")) * (1 + 0.05 * meta.dmg);
const rateMul = () => 1 + 0.15 * perkCount("rate");
const energyMul = () => (1 + 0.25 * perkCount("energy")) * (1 + 0.05 * meta.harv);
const critChance = () => 0.1 * perkCount("crit");
const projSpeedMul = () => 1 + 0.3 * perkCount("velo");
const rangeMul = () => 1 + 0.1 * perkCount("velo");
const fortDmgMul = () => 1 + 0.6 * perkCount("fort");

function layoutSlots() {
  const fr = 46 * SCALE;
  G.fortress.r = fr;
  const ring = fr * 2.35;
  const prev = G.slots;
  G.slots = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU - Math.PI / 2 + TAU / 16;
    G.slots.push({
      x: CX + Math.cos(a) * ring,
      y: CY + Math.sin(a) * ring,
      angle: a,
      r: 24 * SCALE,
      turret: prev[i] ? prev[i].turret : null,
    });
  }
}

/* ============================== starfield ============================== */
let stars = [];
function makeStars() {
  stars = [];
  const n = Math.floor((W * H) / 4200);
  for (let i = 0; i < n; i++) {
    stars.push({
      x: Math.random() * W,
      y: Math.random() * H,
      z: rand(0.25, 1),
      tw: rand(0, TAU),
    });
  }
}

/* ============================== DOM refs ============================== */
const $ = id => document.getElementById(id);
const hudEl = $("hud"), waveEl = $("waveNum"), energyEl = $("energyNum"), hpfillEl = $("hpfill");
const bottombarEl = $("bottombar"), hintEl = $("hint"), startWaveBtn = $("startWaveBtn");
const buildpanelEl = $("buildpanel"), overlayEl = $("overlay");
const muteBtn = $("muteBtn"), pauseBtn = $("pauseBtn");

let hintTimer = null;
function showHint(text, ms = 2600) {
  hintEl.textContent = text;
  hintEl.style.opacity = 1;
  clearTimeout(hintTimer);
  if (ms) hintTimer = setTimeout(() => (hintEl.style.opacity = 0), ms);
}

function shapeIcon(cls, color, extra = "") {
  return `<span class="shape ${cls}" style="color:${color};${extra}"><i></i></span>`;
}

/* ============================== waves ============================== */
function hpMulFor(wave) {
  return 1 + (wave - 1) * 0.24 + Math.pow(Math.max(0, wave - 1), 1.55) * 0.045;
}
function speedMulFor(wave) {
  return Math.min(1.55, 1 + (wave - 1) * 0.02);
}

function buildWave(wave) {
  const q = [];
  const push = (type, n) => { for (let i = 0; i < n; i++) q.push(type); };
  const bossWave = wave % 5 === 0;
  const density = bossWave ? 0.5 : 1;
  push("tri", Math.round((5 + wave * 2) * density));
  if (wave >= 2) push("sq", Math.round((1 + wave) * density));
  if (wave >= 4) push("pent", Math.round(Math.floor(wave / 2) * density));
  if (wave >= 6) push("hex", Math.round(Math.floor(wave / 3) * density));
  if (wave >= 7) push("shoot", Math.max(1, Math.round(Math.floor((wave - 5) / 2) * density)));
  shuffle(q);
  if (bossWave) q.push(wave % 10 === 0 ? "boss2" : "boss");
  G.spawnQueue = q;
  G.spawnInterval = clamp(1.15 - wave * 0.045, 0.35, 1.15);
  G.spawnTimer = 0.4;
}

function spawnEnemy(type, x, y) {
  const def = ENEMY_TYPES[type];
  const hpMul = hpMulFor(G.wave) * (def.boss ? 1 + Math.floor(G.wave / 5 - 1) * 0.6 : 1) * (elite ? 1.5 : 1);
  if (x === undefined) {
    const a = rand(0, TAU);
    const rad = Math.hypot(W, H) / 2 + 60;
    x = CX + Math.cos(a) * rad;
    y = CY + Math.sin(a) * rad;
  }
  G.enemies.push({
    type, def,
    x, y,
    r: def.r * SCALE * (def.boss ? 1 : rand(0.9, 1.1)),
    hp: def.hp * hpMul,
    maxHp: def.hp * hpMul,
    speed: def.speed * speedMulFor(G.wave) * SCALE * rand(0.9, 1.1),
    rot: rand(0, TAU),
    spin: rand(-2, 2),
    wob: rand(0, TAU),
    slow: 0, slowAmt: 0,
    flash: 0,
    siege: false,
    pulseCd: def.pulseEvery || 0,
    shotCd: def.shotEvery ? def.shotEvery * rand(0.5, 1.2) : 0,
  });
}

function startWave() {
  G.wave++;
  buildWave(G.wave);
  setState("playing");
  sfx.waveStart();
  showHint(G.wave % 5 === 0 ? "!! BOSS INCOMING !!" : `WAVE ${G.wave}`, 1800);
}

function waveCleared() {
  const bonus = Math.round((20 + G.wave * 5) * energyMul());
  G.energy += bonus;
  addFloater(CX, CY - G.fortress.r - 30, `+${bonus}`, "#35e0ff");
  G.beams = [];
  G.enemyShots = [];
  sfx.waveClear();
  showCards();
}

/* ============================== combat ============================== */
function addFloater(x, y, text, color) {
  G.floaters.push({ x, y, text, color, life: 1 });
}

function burst(x, y, color, n, size = 3, speed = 160) {
  for (let i = 0; i < n; i++) {
    const a = rand(0, TAU);
    const s = rand(speed * 0.3, speed);
    G.particles.push({
      x, y,
      vx: Math.cos(a) * s, vy: Math.sin(a) * s,
      r: rand(size * 0.5, size * 1.5),
      sides: randInt(3, 6),
      rot: rand(0, TAU), spin: rand(-8, 8),
      color, life: rand(0.35, 0.8),
    });
  }
}

function addRing(x, y, color, maxR, width = 3) {
  G.rings.push({ x, y, color, r: 8, maxR, width, life: 1 });
}

function damageEnemy(e, amt, canCrit = true) {
  let crit = false;
  if (canCrit && Math.random() < critChance()) {
    amt *= 2.5;
    crit = true;
  }
  e.hp -= amt;
  e.flash = 0.08;
  if (crit) addFloater(e.x, e.y - e.r - 6, Math.round(amt), "#ffd23f");
  if (e.hp <= 0 && !e.dead) killEnemy(e);
}

function killEnemy(e) {
  e.dead = true;
  G.kills++;
  const gain = Math.round(e.def.energy * energyMul());
  G.energy += gain;
  burst(e.x, e.y, e.def.color, e.def.boss ? 46 : 10, e.def.boss ? 6 : 3, e.def.boss ? 320 : 170);
  addRing(e.x, e.y, e.def.color, e.def.boss ? 160 : 42);
  for (let i = 0; i < (e.def.boss ? 6 : 2); i++) {
    G.motes.push({ x: e.x + rand(-8, 8), y: e.y + rand(-8, 8), vx: rand(-60, 60), vy: rand(-60, 60), t: 0 });
  }
  if (e.def.splits) {
    for (let i = 0; i < e.def.splits; i++) {
      spawnEnemy("tri", e.x + rand(-14, 14), e.y + rand(-14, 14));
    }
  }
  if (e.def.boss) { sfx.bigBoom(); G.shake = Math.max(G.shake, 14); G.hitStop = Math.max(G.hitStop, 0.3); }
  else sfx.boom();
}

function damageFortress(amt) {
  const f = G.fortress;
  f.hp = Math.max(0, f.hp - amt);
  f.flash = 0.25;
  G.shake = Math.max(G.shake, clamp(amt * 0.35, 4, 16));
  if (amt >= 30) G.hitStop = Math.max(G.hitStop, 0.12);
  sfx.hitFort();
  if (f.hp <= 0) gameOver();
}

/* nearest live enemy to (x,y) within range, else null */
function nearestEnemy(x, y, range) {
  let best = null, bestD = range;
  for (const e of G.enemies) {
    if (e.dead) continue;
    const d = dist(x, y, e.x, e.y) - e.r;
    if (d < bestD) { bestD = d; best = e; }
  }
  return best;
}
function biggestEnemy() {
  let best = null;
  for (const e of G.enemies) {
    if (e.dead) continue;
    if (!best || e.maxHp > best.maxHp) best = e;
  }
  return best;
}

/* ============================== update ============================== */
function update(dt) {
  G.time += dt;
  const f = G.fortress;
  f.rot += dt * 0.25;
  f.flash = Math.max(0, f.flash - dt);
  if (G.shake > 0) G.shake = Math.max(0, G.shake - dt * 30);

  if (G.state === "intermission") {
    G.countdown -= dt;
    startWaveBtn.textContent = `START WAVE ${G.wave + 1}  (${Math.ceil(G.countdown)})`;
    if (G.countdown <= 0) startWave();
  }

  if (G.state === "playing") {
    // spawning
    if (G.spawnQueue.length) {
      G.spawnTimer -= dt;
      if (G.spawnTimer <= 0) {
        G.spawnTimer = G.spawnInterval * rand(0.7, 1.3);
        spawnEnemy(G.spawnQueue.pop());
      }
    }
    updateEnemies(dt);
    updateTurrets(dt);
    updateFortressGun(dt);
    updateProjectiles(dt);
    // wave clear
    if (!G.spawnQueue.length && !G.enemies.length) waveCleared();
  }

  updateFx(dt);
  updateHud();
}

function updateEnemies(dt) {
  const f = G.fortress;
  for (const e of G.enemies) {
    if (e.dead) continue;
    e.rot += e.spin * dt;
    e.flash = Math.max(0, e.flash - dt);
    if (e.slow > 0) e.slow -= dt;

    const dx = CX - e.x, dy = CY - e.y;
    const d = Math.hypot(dx, dy) || 1;
    const contact = f.r + e.r + 2;

    if (e.def.boss) {
      const sp = e.speed * (e.slow > 0 ? 1 - e.slowAmt : 1);
      if (e.def.carrier) {
        const hold = e.def.holdRange * SCALE;
        if (d > hold) {
          e.x += (dx / d) * sp * dt;
          e.y += (dy / d) * sp * dt;
        } else {
          e.x += (-dy / d) * sp * 0.4 * dt;
          e.y += (dx / d) * sp * 0.4 * dt;
          e.pulseCd -= dt;
          if (e.pulseCd <= 0) {
            e.pulseCd = e.def.pulseEvery;
            for (let k = 0; k < 3; k++) {
              spawnEnemy("tri", e.x + rand(-24, 24), e.y + rand(-24, 24));
            }
            addRing(e.x, e.y, e.def.color, 70, 3);
            sfx.warn();
          }
        }
        continue;
      }
      if (d > contact + 14) {
        e.x += (dx / d) * sp * dt;
        e.y += (dy / d) * sp * dt;
      } else {
        e.siege = true;
        e.pulseCd -= dt;
        if (e.pulseCd <= 0) {
          e.pulseCd = e.def.pulseEvery;
          const dmg = Math.round((e.def.pulseDmg + G.wave * 2) * enemyDmgMul());
          damageFortress(dmg);
          addRing(e.x, e.y, e.def.color, 90, 5);
          addFloater(CX, CY - f.r - 16, `-${dmg}`, "#ff5d5d");
        }
      }
      continue;
    }

    if (e.def.shooter) {
      const hold = e.def.holdRange * SCALE;
      const sp = e.speed * (e.slow > 0 ? 1 - e.slowAmt : 1);
      if (d > hold) {
        e.x += (dx / d) * sp * dt;
        e.y += (dy / d) * sp * dt;
      } else {
        // strafe slowly around the fortress while firing
        e.x += (-dy / d) * sp * 0.35 * dt;
        e.y += (dx / d) * sp * 0.35 * dt;
        e.shotCd -= dt;
        if (e.shotCd <= 0) {
          e.shotCd = e.def.shotEvery * (e.slow > 0 ? 1.5 : 1);
          const a = Math.atan2(CY - e.y, CX - e.x);
          const shotSpeed = 150 * SCALE;
          G.enemyShots.push({
            x: e.x, y: e.y,
            vx: Math.cos(a) * shotSpeed, vy: Math.sin(a) * shotSpeed,
            dmg: Math.round((8 + G.wave * 0.8) * enemyDmgMul()), life: 5,
          });
          addRing(e.x, e.y, e.def.color, 22, 2);
          sfx.snipe();
        }
      }
      continue;
    }

    e.wob += dt * 3;
    const wobble = Math.sin(e.wob) * 22;
    const px = -dy / d, py = dx / d; // perpendicular
    const sp = e.speed * (e.slow > 0 ? 1 - e.slowAmt : 1);
    e.x += ((dx / d) * sp + px * wobble * 0.4) * dt;
    e.y += ((dy / d) * sp + py * wobble * 0.4) * dt;

    if (d <= contact) {
      const dmg = Math.round(e.def.dmg * enemyDmgMul());
      damageFortress(dmg);
      addFloater(CX, CY - f.r - 16, `-${dmg}`, "#ff5d5d");
      burst(e.x, e.y, e.def.color, 8, 3, 150);
      e.dead = true; // kamikaze: no energy reward
    }
  }
  G.enemies = G.enemies.filter(e => !e.dead);
}

function turretStats(t) {
  const def = TURRET_TYPES[t.type];
  const mul = levelMul(t.level);
  return {
    dmg: (def.dmg || 0) * mul * dmgMul(),
    dps: (def.dps || 0) * mul * dmgMul(),
    pulseDmg: (def.pulseDmg || 0) * mul * dmgMul(),
    rate: (def.rate || 0) * Math.pow(1.12, t.level - 1) * rateMul(),
    range: def.range * (1 + 0.12 * (t.level - 1)) * rangeMul() * SCALE,
    speed: (def.speed || 0) * projSpeedMul() * SCALE,
    splash: (def.splash || 0) * SCALE,
    slow: def.slow ? Math.min(0.8, def.slow + 0.06 * (t.level - 1)) : 0,
    slowDur: def.slowDur || 0,
    pulse: def.pulse ? def.pulse / (Math.pow(1.12, t.level - 1) * rateMul()) : 0,
  };
}

function updateTurrets(dt) {
  G.beams = [];
  for (const slot of G.slots) {
    const t = slot.turret;
    if (!t) continue;
    const def = TURRET_TYPES[t.type];
    const s = turretStats(t);
    t.cd = (t.cd || 0) - dt;
    t.rot = (t.rot || 0) + dt;

    if (def.kind === "pulse") {
      if (t.cd <= 0) {
        t.cd = s.pulse;
        let hit = false;
        for (const e of G.enemies) {
          if (e.dead) continue;
          if (dist(slot.x, slot.y, e.x, e.y) <= s.range + e.r) {
            e.slow = s.slowDur;
            e.slowAmt = s.slow;
            damageEnemy(e, s.pulseDmg, false);
            hit = true;
          }
        }
        if (hit || G.enemies.length) addRing(slot.x, slot.y, def.color, s.range, 2);
      }
      continue;
    }

    if (def.kind === "beam") {
      let target = t.target;
      if (!target || target.dead || dist(slot.x, slot.y, target.x, target.y) - target.r > s.range) {
        target = t.target = nearestEnemy(slot.x, slot.y, s.range);
      }
      if (target) {
        t.aim = Math.atan2(target.y - slot.y, target.x - slot.x);
        // pierce: hurt every enemy near the beam segment
        const bx = target.x - slot.x, by = target.y - slot.y;
        const blen = Math.hypot(bx, by) || 1;
        for (const e of G.enemies) {
          if (e.dead) continue;
          const ex = e.x - slot.x, ey = e.y - slot.y;
          const proj = clamp((ex * bx + ey * by) / (blen * blen), 0, 1);
          const cx = bx * proj, cy = by * proj;
          if (Math.hypot(ex - cx, ey - cy) <= e.r + 5) {
            damageEnemy(e, s.dps * dt, false);
          }
        }
        G.beams.push({ x1: slot.x, y1: slot.y, x2: target.x, y2: target.y, color: def.color, level: t.level });
        if (Math.random() < 0.35) {
          G.particles.push({ x: target.x + rand(-4, 4), y: target.y + rand(-4, 4), vx: rand(-50, 50), vy: rand(-50, 50), r: 1.8, sides: 4, rot: rand(0, TAU), spin: 6, color: "#ffffff", life: 0.2 });
        }
      }
      continue;
    }

    if (def.kind === "tesla") {
      const target = nearestEnemy(slot.x, slot.y, s.range);
      if (target) t.aim = Math.atan2(target.y - slot.y, target.x - slot.x);
      if (target && t.cd <= 0) {
        t.cd = 1 / s.rate;
        const pts = [{ x: slot.x, y: slot.y }];
        const hit = new Set();
        let cur = target;
        let dmg = s.dmg;
        const jumps = def.chains + (t.level - 1);
        for (let j = 0; j <= jumps && cur; j++) {
          hit.add(cur);
          pts.push({ x: cur.x, y: cur.y });
          damageEnemy(cur, dmg);
          burst(cur.x, cur.y, def.color, 3, 2, 90);
          dmg *= 0.7;
          let next = null;
          let best = def.chainRange * SCALE;
          for (const e of G.enemies) {
            if (e.dead || hit.has(e)) continue;
            const dd = dist(cur.x, cur.y, e.x, e.y);
            if (dd < best) { best = dd; next = e; }
          }
          cur = next;
        }
        G.bolts.push({ pts, color: def.color, life: 0.18 });
        sfx.zap();
      }
      continue;
    }

    // bullet & missile turrets
    const target = def.kind === "missile"
      ? (biggestEnemy() && dist(slot.x, slot.y, biggestEnemy().x, biggestEnemy().y) < s.range ? biggestEnemy() : null)
      : nearestEnemy(slot.x, slot.y, s.range);
    if (target) t.aim = Math.atan2(target.y - slot.y, target.x - slot.x);
    if (target && t.cd <= 0) {
      t.cd = 1 / s.rate;
      if (def.kind === "missile") {
        G.missiles.push({
          x: slot.x, y: slot.y,
          angle: t.aim + rand(-0.5, 0.5),
          speed: s.speed, turn: def.turn,
          dmg: s.dmg, splash: s.splash,
          target, color: def.color, life: 6,
        });
      } else {
        const a = t.aim;
        G.bullets.push({
          x: slot.x + Math.cos(a) * slot.r, y: slot.y + Math.sin(a) * slot.r,
          vx: Math.cos(a) * s.speed, vy: Math.sin(a) * s.speed,
          dmg: s.dmg, splash: s.splash,
          color: def.color, r: def.kind === "bullet" && def.splash ? 5 : 3,
          life: 2.2,
        });
        burst(slot.x + Math.cos(a) * slot.r, slot.y + Math.sin(a) * slot.r, def.color, 2, 1.5, 70);
      }
      sfx.shoot();
    }
  }
}

function updateFortressGun(dt) {
  const f = G.fortress;
  f.gunCd -= dt;
  const range = 300 * SCALE;
  let target = f.gunTarget;
  if (!target || target.dead || dist(CX, CY, target.x, target.y) > range + target.r) {
    target = f.gunTarget = nearestEnemy(CX, CY, range);
  }
  if (target) {
    const want = Math.atan2(target.y - CY, target.x - CX);
    let diff = want - f.gunAngle;
    while (diff > Math.PI) diff -= TAU;
    while (diff < -Math.PI) diff += TAU;
    f.gunAngle += clamp(diff, -6 * dt, 6 * dt);
    if (f.gunCd <= 0 && Math.abs(diff) < 0.35) {
      f.gunCd = 1 / (2.2 * rateMul());
      const a = f.gunAngle;
      G.bullets.push({
        x: CX + Math.cos(a) * f.r, y: CY + Math.sin(a) * f.r,
        vx: Math.cos(a) * 500 * SCALE * projSpeedMul(), vy: Math.sin(a) * 500 * SCALE * projSpeedMul(),
        dmg: 9 * dmgMul() * fortDmgMul(), splash: 0,
        color: "#fff06a", r: 3, life: 2,
      });
      sfx.shoot();
    }
  }
}

function explodeAt(x, y, dmg, splash, color) {
  if (splash > 0) {
    for (const e of G.enemies) {
      if (e.dead) continue;
      const d = dist(x, y, e.x, e.y) - e.r;
      if (d <= splash) damageEnemy(e, dmg * (d <= 0 ? 1 : 1 - (d / splash) * 0.5));
    }
    addRing(x, y, color, splash, 2);
    burst(x, y, color, 8, 3, 140);
  }
}

function updateProjectiles(dt) {
  for (const b of G.bullets) {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    if (b.life <= 0) { b.dead = true; continue; }
    for (const e of G.enemies) {
      if (e.dead) continue;
      if (dist(b.x, b.y, e.x, e.y) <= e.r + b.r) {
        b.dead = true;
        if (b.splash) explodeAt(b.x, b.y, b.dmg, b.splash, b.color);
        else { damageEnemy(e, b.dmg); burst(b.x, b.y, b.color, 3, 2, 90); }
        break;
      }
    }
  }
  G.bullets = G.bullets.filter(b => !b.dead);

  for (const m of G.missiles) {
    m.life -= dt;
    if (m.life <= 0) { m.dead = true; continue; }
    if (!m.target || m.target.dead) m.target = nearestEnemy(m.x, m.y, 9999);
    if (m.target) {
      const want = Math.atan2(m.target.y - m.y, m.target.x - m.x);
      let diff = want - m.angle;
      while (diff > Math.PI) diff -= TAU;
      while (diff < -Math.PI) diff += TAU;
      m.angle += clamp(diff, -m.turn * dt, m.turn * dt);
    }
    m.speed += 260 * dt;
    m.x += Math.cos(m.angle) * m.speed * dt;
    m.y += Math.sin(m.angle) * m.speed * dt;
    if (Math.random() < 0.5) {
      G.particles.push({ x: m.x, y: m.y, vx: rand(-20, 20), vy: rand(-20, 20), r: 2, sides: 4, rot: 0, spin: 4, color: m.color, life: 0.25 });
    }
    for (const e of G.enemies) {
      if (e.dead) continue;
      if (dist(m.x, m.y, e.x, e.y) <= e.r + 5) {
        m.dead = true;
        damageEnemy(e, m.dmg);
        explodeAt(m.x, m.y, m.dmg * 0.5, m.splash, m.color);
        break;
      }
    }
  }
  G.missiles = G.missiles.filter(m => !m.dead);

  const f = G.fortress;
  for (const s of G.enemyShots) {
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.life -= dt;
    if (s.life <= 0) { s.dead = true; continue; }
    if (dist(s.x, s.y, CX, CY) <= f.r) {
      s.dead = true;
      damageFortress(s.dmg);
      addFloater(CX, CY - f.r - 16, `-${s.dmg}`, "#ff5d5d");
    }
  }
  G.enemyShots = G.enemyShots.filter(s => !s.dead);
}

function updateFx(dt) {
  for (const p of G.particles) {
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 1 - 2.5 * dt;
    p.vy *= 1 - 2.5 * dt;
    p.rot += p.spin * dt;
  }
  G.particles = G.particles.filter(p => p.life > 0);

  for (const r of G.rings) {
    r.r += (r.maxR - r.r) * 8 * dt;
    r.life -= dt * 2.2;
  }
  G.rings = G.rings.filter(r => r.life > 0);

  for (const b of G.bolts) b.life -= dt;
  G.bolts = G.bolts.filter(b => b.life > 0);

  for (const fl of G.floaters) {
    fl.y -= 34 * dt;
    fl.life -= dt * 0.85;
  }
  G.floaters = G.floaters.filter(fl => fl.life > 0);

  // energy motes fly to the HUD energy counter
  const tx = W - 180, ty = 28;
  for (const m of G.motes) {
    m.t += dt;
    if (m.t > 0.3) {
      const dx = tx - m.x, dy = ty - m.y;
      const d = Math.hypot(dx, dy) || 1;
      const sp = 380 + m.t * 900;
      m.vx = (dx / d) * sp;
      m.vy = (dy / d) * sp;
      if (d < 26) m.dead = true;
    }
    m.x += m.vx * dt;
    m.y += m.vy * dt;
  }
  G.motes = G.motes.filter(m => !m.dead);
}

/* ---- ambient drifting shapes behind the menu ---- */
let ambientTimer = 0;
function updateAmbient(dt) {
  ambientTimer -= dt;
  if (ambientTimer <= 0 && G.ambient.length < 9) {
    ambientTimer = rand(1.2, 2.6);
    const def = ENEMY_TYPES[pick(["tri", "sq", "pent", "hex", "shoot"])];
    const fromLeft = Math.random() < 0.5;
    G.ambient.push({
      def,
      x: fromLeft ? -50 : W + 50,
      y: rand(H * 0.08, H * 0.92),
      vx: (fromLeft ? 1 : -1) * rand(14, 38),
      vy: rand(-7, 7),
      r: def.r * SCALE * rand(0.8, 1.7),
      rot: rand(0, TAU),
      spin: rand(-1.2, 1.2),
    });
  }
  for (const a of G.ambient) {
    a.x += a.vx * dt;
    a.y += a.vy * dt;
    a.rot += a.spin * dt;
  }
  G.ambient = G.ambient.filter(a => a.x > -90 && a.x < W + 90);
}

function drawAmbient() {
  ctx.save();
  ctx.globalAlpha = 0.4;
  for (const a of G.ambient) {
    ctx.fillStyle = a.def.color;
    ctx.shadowColor = a.def.color;
    ctx.shadowBlur = 8;
    poly(a.x, a.y, a.r, a.def.sides, a.rot);
    ctx.fill();
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

/* ============================== HUD ============================== */
let lastWaveShown = -1, lastEnergyShown = -1, lastHpShown = -1;
function updateHud() {
  if (G.wave !== lastWaveShown) { waveEl.textContent = Math.max(1, G.wave); lastWaveShown = G.wave; }
  const en = Math.floor(G.energy);
  if (en !== lastEnergyShown) { energyEl.textContent = en; lastEnergyShown = en; refreshPanelAffordability(); }
  const hpPct = Math.round((G.fortress.hp / G.fortress.maxHp) * 100);
  if (hpPct !== lastHpShown) {
    hpfillEl.style.width = hpPct + "%";
    hpfillEl.style.background = hpPct > 50
      ? "linear-gradient(90deg,#38ffb0,#35e0ff)"
      : hpPct > 25 ? "linear-gradient(90deg,#ffd23f,#ffb03a)" : "linear-gradient(90deg,#ff5d5d,#ff3d6e)";
    lastHpShown = hpPct;
  }
}

/* ============================== render ============================== */
function render() {
  ctx.clearRect(0, 0, W, H);

  // background
  const grad = ctx.createRadialGradient(CX, CY, 0, CX, CY, Math.max(W, H) * 0.7);
  grad.addColorStop(0, "#0a1128");
  grad.addColorStop(1, "#04060f");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // stars
  for (const s of stars) {
    const tw = 0.5 + 0.5 * Math.sin(G.time * 1.4 + s.tw);
    ctx.globalAlpha = 0.25 + 0.6 * s.z * tw;
    ctx.fillStyle = "#bcd2ff";
    const sz = s.z * 1.8;
    ctx.fillRect(s.x, s.y, sz, sz);
  }
  ctx.globalAlpha = 1;

  ctx.save();
  if (G.shake > 0) {
    ctx.translate(rand(-G.shake, G.shake) * 0.5, rand(-G.shake, G.shake) * 0.5);
  }

  if (G.state === "menu" || G.state === "gameover") drawAmbient();
  drawSlots();
  drawRings();
  drawBeams();
  drawBolts();
  drawFortress();
  drawTurrets();
  drawEnemies();
  drawProjectiles();
  drawParticles();
  drawFloaters();
  ctx.restore();

  drawMotes();
}

function drawSlots() {
  for (let i = 0; i < G.slots.length; i++) {
    const s = G.slots[i];
    if (s.turret) continue;
    const selected = i === G.selectedSlot;
    ctx.save();
    ctx.globalAlpha = selected ? 0.95 : 0.4 + 0.15 * Math.sin(G.time * 2 + i);
    ctx.strokeStyle = selected ? "#35e0ff" : "#4a6bb0";
    ctx.lineWidth = selected ? 2 : 1.2;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r * 0.8, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    // plus mark
    ctx.beginPath();
    const c = s.r * 0.3;
    ctx.moveTo(s.x - c, s.y); ctx.lineTo(s.x + c, s.y);
    ctx.moveTo(s.x, s.y - c); ctx.lineTo(s.x, s.y + c);
    ctx.stroke();
    ctx.restore();
  }
}

function drawFortress() {
  const f = G.fortress;
  ctx.save();
  ctx.shadowColor = "#35e0ff";
  ctx.shadowBlur = 24;
  ctx.strokeStyle = f.flash > 0 ? "#ffffff" : "#35e0ff";
  ctx.lineWidth = 3;
  ctx.fillStyle = f.flash > 0 ? "rgba(255,120,120,0.35)" : "rgba(20,60,110,0.55)";
  poly(CX, CY, f.r, 6, f.rot * 0.3);
  ctx.fill();
  ctx.stroke();
  ctx.shadowBlur = 0;
  // inner core
  ctx.strokeStyle = "rgba(140,220,255,0.8)";
  ctx.lineWidth = 1.5;
  poly(CX, CY, f.r * 0.55, 6, -f.rot * 0.6);
  ctx.stroke();
  ctx.fillStyle = "#9fdcff";
  poly(CX, CY, f.r * 0.2, 6, f.rot);
  ctx.fill();
  // gun
  ctx.save();
  ctx.translate(CX, CY);
  ctx.rotate(f.gunAngle);
  ctx.fillStyle = "#fff06a";
  ctx.shadowColor = "#fff06a";
  ctx.shadowBlur = 8;
  ctx.beginPath();
  ctx.moveTo(f.r * 0.9, 0);
  ctx.lineTo(f.r * 0.35, -5);
  ctx.lineTo(f.r * 0.35, 5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // hp arc
  const pct = f.hp / f.maxHp;
  ctx.lineWidth = 4;
  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.beginPath();
  ctx.arc(CX, CY, f.r + 10, 0, TAU);
  ctx.stroke();
  ctx.strokeStyle = pct > 0.5 ? "#38ffb0" : pct > 0.25 ? "#ffd23f" : "#ff5d5d";
  ctx.shadowColor = ctx.strokeStyle;
  ctx.shadowBlur = 8;
  ctx.beginPath();
  ctx.arc(CX, CY, f.r + 10, -Math.PI / 2, -Math.PI / 2 + TAU * pct);
  ctx.stroke();
  ctx.restore();
}

function drawTurrets() {
  for (let i = 0; i < G.slots.length; i++) {
    const s = G.slots[i];
    const t = s.turret;
    if (!t) continue;
    const def = TURRET_TYPES[t.type];
    const selected = i === G.selectedSlot;
    const size = s.r * (0.62 + 0.14 * t.level);
    ctx.save();

    if (selected) {
      const st = turretStats(t);
      if (st.range < Math.max(W, H)) {
        ctx.globalAlpha = 0.14;
        ctx.fillStyle = def.color;
        ctx.beginPath();
        ctx.arc(s.x, s.y, st.range, 0, TAU);
        ctx.fill();
        ctx.globalAlpha = 0.5;
        ctx.strokeStyle = def.color;
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }

    // base pad
    ctx.strokeStyle = "rgba(120,160,255,0.5)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r * 0.85, 0, TAU);
    ctx.stroke();

    // body (aims at target)
    const aim = (t.aim ?? s.angle) + Math.PI / 2; // poly() puts vertex 0 at top
    ctx.shadowColor = def.color;
    ctx.shadowBlur = selected ? 20 : 12;
    ctx.fillStyle = def.color;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = selected ? 2 : 1;
    poly(s.x, s.y, size, def.sides, def.kind === "pulse" ? t.rot * 0.8 : aim);
    ctx.fill();
    if (selected) ctx.stroke();
    ctx.shadowBlur = 0;

    // level pips
    ctx.fillStyle = "#ffffff";
    for (let l = 0; l < t.level; l++) {
      const a = s.angle + Math.PI + (l - (t.level - 1) / 2) * 0.45;
      ctx.beginPath();
      ctx.arc(s.x + Math.cos(a) * (s.r + 7), s.y + Math.sin(a) * (s.r + 7), 2.2, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }
}

function drawEnemies() {
  for (const e of G.enemies) {
    ctx.save();
    ctx.shadowColor = e.def.color;
    ctx.shadowBlur = e.def.boss ? 26 : 10;
    ctx.fillStyle = e.flash > 0 ? "#ffffff" : e.def.color;
    poly(e.x, e.y, e.r, e.def.sides, e.rot);
    ctx.fill();
    ctx.shadowBlur = 0;
    if (e.def.boss) {
      ctx.strokeStyle = "rgba(255,255,255,0.7)";
      ctx.lineWidth = 2;
      poly(e.x, e.y, e.r * 0.6, e.def.sides, -e.rot * 1.4);
      ctx.stroke();
    }
    // hp bar (only when hurt)
    if (e.hp < e.maxHp) {
      const w = e.r * 2;
      const pct = clamp(e.hp / e.maxHp, 0, 1);
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(e.x - w / 2, e.y - e.r - 9, w, 4);
      ctx.fillStyle = pct > 0.4 ? "#38ffb0" : "#ff5d5d";
      ctx.fillRect(e.x - w / 2, e.y - e.r - 9, w * pct, 4);
    }
    ctx.restore();
  }
}

function drawBeams() {
  for (const b of G.beams) {
    ctx.save();
    ctx.strokeStyle = b.color;
    ctx.shadowColor = b.color;
    ctx.shadowBlur = 14;
    ctx.globalAlpha = 0.9;
    ctx.lineWidth = 1.5 + b.level + Math.sin(G.time * 40) * 0.8;
    ctx.beginPath();
    ctx.moveTo(b.x1, b.y1);
    ctx.lineTo(b.x2, b.y2);
    ctx.stroke();
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }
}

function drawBolts() {
  for (const b of G.bolts) {
    ctx.save();
    ctx.globalAlpha = clamp(b.life * 6, 0, 1);
    ctx.strokeStyle = b.color;
    ctx.shadowColor = b.color;
    ctx.shadowBlur = 12;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < b.pts.length - 1; i++) {
      const a = b.pts[i], c = b.pts[i + 1];
      ctx.moveTo(a.x, a.y);
      const segs = 4;
      for (let si = 1; si <= segs; si++) {
        const t = si / segs;
        const jag = si < segs ? rand(-7, 7) : 0;
        ctx.lineTo(lerp(a.x, c.x, t) + jag, lerp(a.y, c.y, t) + jag);
      }
    }
    ctx.stroke();
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

function drawProjectiles() {
  ctx.save();
  for (const b of G.bullets) {
    ctx.fillStyle = b.color;
    ctx.shadowColor = b.color;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, TAU);
    ctx.fill();
  }
  for (const m of G.missiles) {
    ctx.fillStyle = m.color;
    ctx.shadowColor = m.color;
    ctx.shadowBlur = 10;
    ctx.save();
    ctx.translate(m.x, m.y);
    ctx.rotate(m.angle + Math.PI / 2);
    poly(0, 0, 7, 3, 0);
    ctx.fill();
    ctx.restore();
  }
  ctx.fillStyle = "#ff4d9b";
  ctx.shadowColor = "#ff4d9b";
  ctx.shadowBlur = 8;
  for (const s of G.enemyShots) {
    poly(s.x, s.y, 5, 4, 0);
    ctx.fill();
  }
  ctx.restore();
}

function drawParticles() {
  ctx.save();
  for (const p of G.particles) {
    ctx.globalAlpha = clamp(p.life * 2, 0, 1);
    ctx.fillStyle = p.color;
    poly(p.x, p.y, p.r, p.sides, p.rot);
    ctx.fill();
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

function drawRings() {
  ctx.save();
  for (const r of G.rings) {
    ctx.globalAlpha = clamp(r.life, 0, 1) * 0.7;
    ctx.strokeStyle = r.color;
    ctx.lineWidth = r.width;
    ctx.beginPath();
    ctx.arc(r.x, r.y, r.r, 0, TAU);
    ctx.stroke();
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

function drawFloaters() {
  ctx.save();
  ctx.font = `700 ${Math.round(14 * SCALE + 4)}px "Avenir Next","Segoe UI",system-ui,sans-serif`;
  ctx.textAlign = "center";
  for (const fl of G.floaters) {
    ctx.globalAlpha = clamp(fl.life, 0, 1);
    ctx.fillStyle = fl.color;
    ctx.shadowColor = fl.color;
    ctx.shadowBlur = 6;
    ctx.fillText(fl.text, fl.x, fl.y);
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

function drawMotes() {
  ctx.save();
  ctx.fillStyle = "#35e0ff";
  ctx.shadowColor = "#35e0ff";
  ctx.shadowBlur = 8;
  for (const m of G.motes) {
    ctx.save();
    ctx.translate(m.x, m.y);
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(-3, -3, 6, 6);
    ctx.restore();
  }
  ctx.restore();
}

/* ============================== build panel ============================== */
function turretInvested(t) {
  let total = TURRET_TYPES[t.type].cost;
  for (let l = 1; l < t.level; l++) total += upgradeCost(t.type, l);
  return total;
}

function openPanelForSlot(i) {
  G.selectedSlot = i;
  const slot = G.slots[i];
  buildpanelEl.innerHTML = "";
  buildpanelEl.style.display = "flex";
  bottombarEl.style.visibility = "hidden";

  if (!slot.turret) {
    for (const key of TURRET_ORDER) {
      const def = TURRET_TYPES[key];
      const btn = document.createElement("button");
      btn.className = "build-btn";
      btn.dataset.cost = def.cost;
      btn.title = def.desc;
      btn.innerHTML = `${shapeIcon(def.cls, def.color)}<span>${def.name}</span><span class="cost"><span class="gem"></span>${def.cost}</span>`;
      btn.addEventListener("click", ev => {
        ev.stopPropagation();
        if (G.energy < def.cost) { sfx.deny(); return; }
        G.energy -= def.cost;
        slot.turret = { type: key, level: 1, cd: 0, rot: 0 };
        sfx.build();
        addRing(slot.x, slot.y, def.color, 40);
        burst(slot.x, slot.y, def.color, 8, 2, 120);
        closePanel();
      });
      buildpanelEl.appendChild(btn);
    }
  } else {
    const t = slot.turret;
    const def = TURRET_TYPES[t.type];
    const info = document.createElement("div");
    info.className = "build-btn";
    info.style.cursor = "default";
    info.innerHTML = `${shapeIcon(def.cls, def.color)}<span>${def.name} LV${t.level}</span><span style="color:#8fa5d8">${def.desc}</span>`;
    buildpanelEl.appendChild(info);

    if (t.level < MAX_LEVEL) {
      const cost = upgradeCost(t.type, t.level);
      const up = document.createElement("button");
      up.className = "build-btn";
      up.dataset.cost = cost;
      up.innerHTML = `<span>UPGRADE</span><span>LV${t.level} &gt; LV${t.level + 1}</span><span class="cost"><span class="gem"></span>${cost}</span>`;
      up.addEventListener("click", ev => {
        ev.stopPropagation();
        if (G.energy < cost) { sfx.deny(); return; }
        G.energy -= cost;
        t.level++;
        sfx.upgrade();
        addRing(slot.x, slot.y, def.color, 50);
        openPanelForSlot(i); // refresh
      });
      buildpanelEl.appendChild(up);
    }

    const refund = Math.round(turretInvested(t) * 0.6);
    const sell = document.createElement("button");
    sell.className = "build-btn sell";
    sell.innerHTML = `<span>SELL</span><span class="cost"><span class="gem"></span>+${refund}</span>`;
    sell.addEventListener("click", ev => {
      ev.stopPropagation();
      G.energy += refund;
      slot.turret = null;
      sfx.sell();
      closePanel();
    });
    buildpanelEl.appendChild(sell);
  }
  refreshPanelAffordability();
}

function refreshPanelAffordability() {
  if (buildpanelEl.style.display !== "flex") return;
  for (const btn of buildpanelEl.querySelectorAll(".build-btn[data-cost]")) {
    btn.disabled = G.energy < +btn.dataset.cost;
  }
}

function closePanel() {
  G.selectedSlot = -1;
  buildpanelEl.style.display = "none";
  bottombarEl.style.visibility = "visible";
}

/* ============================== input ============================== */
canvas.addEventListener("pointerdown", ev => {
  ensureAudio();
  if (G.state !== "playing" && G.state !== "intermission") return;
  const x = ev.clientX, y = ev.clientY;
  for (let i = 0; i < G.slots.length; i++) {
    const s = G.slots[i];
    if (dist(x, y, s.x, s.y) <= Math.max(s.r * 1.5, 30)) {
      if (G.selectedSlot === i) closePanel();
      else openPanelForSlot(i);
      return;
    }
  }
  closePanel();
});

document.addEventListener("keydown", ev => {
  if (ev.key === "p" || ev.key === "P" || ev.key === "Escape") {
    if (G.state === "playing" || G.state === "intermission") pauseGame();
    else if (G.state === "paused") resumeGame();
  }
  if (ev.key === " " && G.state === "intermission") {
    ev.preventDefault();
    skipCountdown();
  }
});

muteBtn.addEventListener("click", () => {
  ensureAudio();
  muted = !muted;
  localStorage.setItem("shapeDefense.muted", muted ? "1" : "0");
  muteBtn.classList.toggle("muted", muted);
});
muteBtn.classList.toggle("muted", muted);

pauseBtn.addEventListener("click", () => {
  ensureAudio();
  if (G.state === "playing" || G.state === "intermission") pauseGame();
});

startWaveBtn.addEventListener("click", () => {
  ensureAudio();
  skipCountdown();
});

function skipCountdown() {
  if (G.state !== "intermission") return;
  const bonus = 15;
  G.energy += bonus;
  addFloater(CX, CY - G.fortress.r - 30, `+${bonus} RUSH`, "#35e0ff");
  startWave();
}

document.addEventListener("visibilitychange", () => {
  if (document.hidden && (G.state === "playing" || G.state === "intermission")) pauseGame();
});

/* ============================== states & screens ============================== */
function setState(next) {
  G.state = next;
  hudEl.style.display = next === "menu" || next === "gameover" ? "none" : "flex";
  bottombarEl.style.display = next === "playing" || next === "intermission" ? "flex" : "none";
  startWaveBtn.style.display = next === "intermission" ? "block" : "none";
  if (next !== "playing" && next !== "intermission") closePanel();
  overlayEl.style.display = "none";
}

function resetRun() {
  G.wave = 0;
  G.energy = 90 + meta.react * 15;
  G.kills = 0;
  G.time = 0;
  G.perks = {};
  G.enemies = [];
  G.bullets = [];
  G.missiles = [];
  G.beams = [];
  G.particles = [];
  G.rings = [];
  G.floaters = [];
  G.motes = [];
  G.spawnQueue = [];
  G.enemyShots = [];
  G.bolts = [];
  G.ambient = [];
  G.hitStop = 0;
  G.fortress.maxHp = Math.round(500 * (1 + 0.1 * meta.hull));
  G.fortress.hp = G.fortress.maxHp;
  G.fortress.gunTarget = null;
  for (const s of G.slots) s.turret = null;
  $("eliteTag").hidden = !elite;
  lastWaveShown = lastEnergyShown = lastHpShown = -1;
}

function showMenu() {
  setState("menu");
  overlayEl.style.display = "flex";
  const anyMeta = cores > 0 || Object.values(meta).some(v => v > 0);
  overlayEl.innerHTML = `
    <div class="modal">
      <div class="title">SHAPE<br>DEFENSE<small>FORTRESS TD</small></div>
      <div class="subtitle">Hostile geometry is closing in on your fortress.<br>
      Build turrets in the ring, pick power-ups between waves, survive.</div>
      <div class="legend">
        <div>${shapeIcon("tri", "#ff6161")} SWARM</div>
        <div>${shapeIcon("sq", "#ff9a3d")} GRUNT</div>
        <div>${shapeIcon("pent", "#d05cff")} TANK</div>
        <div>${shapeIcon("hex", "#ffd23f")} SPLITTER</div>
        <div>${shapeIcon("dia", "#ff4d9b")} SNIPER</div>
      </div>
      ${G.highScore ? `<div class="subtitle" style="margin-top:16px">BEST SCORE — <b style="color:#fff">${G.highScore.toLocaleString()}</b></div>` : ""}
      <button class="big-btn" id="playBtn">DEPLOY</button>
      <div><button class="ghost-btn" id="diffBtn" style="${elite ? "color:#ff3d6e;border-color:#ff3d6e" : ""}">DIFFICULTY: ${elite ? "ELITE" : "NORMAL"}</button></div>
      ${elite ? `<div class="subtitle" style="margin-top:8px;color:#ff3d6e">Elite: enemies +50% HP, +40% damage &middot; score &amp; cores x1.5</div>` : ""}
      ${anyMeta ? `
      <div class="legend" style="margin-top:26px">${shapeIcon("hex", "#ffd23f")}
        <div style="font-size:14px;color:#dfe8ff;font-weight:800">CORES <span style="color:#ffd23f">${cores}</span></div>
      </div>
      <div class="cards" style="margin-top:12px">
        ${META_UPGRADES.map(u => {
          const lvl = meta[u.id];
          const maxed = lvl >= u.max;
          const cost = metaCost(lvl);
          const afford = !maxed && cores >= cost;
          return `<button class="card" data-meta="${u.id}" style="width:132px;padding:14px 10px;${afford ? "" : "opacity:.55"}">
            ${shapeIcon(u.cls, u.color)}
            <b style="font-size:12px">${u.name}</b>
            <span>${u.desc}</span>
            <span style="color:${u.color};font-weight:800">LV ${lvl}/${u.max}</span>
            <span style="color:#ffd23f;font-weight:800">${maxed ? "MAX" : cost + " CORES"}</span>
          </button>`;
        }).join("")}
      </div>` : ""}
    </div>`;
  $("playBtn").addEventListener("click", () => {
    ensureAudio();
    resetRun();
    beginIntermission(6);
    showHint("TAP A DASHED SLOT TO BUILD A TURRET", 5000);
  });
  $("diffBtn").addEventListener("click", () => {
    ensureAudio();
    elite = !elite;
    localStorage.setItem("shapeDefense.elite", elite ? "1" : "0");
    sfx.card();
    showMenu();
  });
  overlayEl.querySelectorAll("[data-meta]").forEach(btn => {
    btn.addEventListener("click", () => {
      ensureAudio();
      const u = META_UPGRADES.find(x => x.id === btn.dataset.meta);
      const lvl = meta[u.id];
      const cost = metaCost(lvl);
      if (lvl >= u.max || cores < cost) { sfx.deny(); return; }
      cores -= cost;
      meta[u.id]++;
      saveMeta();
      sfx.upgrade();
      showMenu();
    });
  });
}

function beginIntermission(seconds) {
  setState("intermission");
  G.countdown = seconds;
  startWaveBtn.textContent = `START WAVE ${G.wave + 1}  (${Math.ceil(seconds)})`;
}

function showCards() {
  setState("picking");
  let options = PERKS.filter(p => !(p.id === "repair" && G.fortress.hp >= G.fortress.maxHp));
  options = shuffle(options.slice()).slice(0, 3);
  overlayEl.style.display = "flex";
  overlayEl.innerHTML = `
    <div class="modal">
      <div class="title" style="font-size:clamp(22px,5vw,34px)">WAVE ${G.wave} CLEARED</div>
      <div class="subtitle">Choose a system upgrade</div>
      <div class="cards">
        ${options.map((p, idx) => `
          <button class="card" data-idx="${idx}">
            ${shapeIcon(p.cls, p.color)}
            <b>${p.name}</b>
            <span>${p.desc}</span>
            ${perkCount(p.id) ? `<span style="color:${p.color}">owned x${perkCount(p.id)}</span>` : ""}
          </button>`).join("")}
      </div>
    </div>`;
  overlayEl.querySelectorAll(".card").forEach(btn => {
    btn.addEventListener("click", () => {
      applyPerk(options[+btn.dataset.idx]);
      sfx.card();
      beginIntermission(5);
    });
  });
}

function applyPerk(p) {
  G.perks[p.id] = (G.perks[p.id] || 0) + 1;
  const f = G.fortress;
  if (p.id === "repair") {
    f.hp = Math.min(f.maxHp, f.hp + f.maxHp * 0.4);
    G.perks[p.id] = 0; // repair is consumable, not a stacking stat
  }
  if (p.id === "hull") {
    const add = Math.round(f.maxHp * 0.25);
    f.maxHp += add;
    f.hp = Math.min(f.maxHp, f.hp + add);
  }
  addRing(CX, CY, p.color, G.fortress.r * 2.6, 4);
}

function gameOver() {
  if (G.state === "gameover") return;
  sfx.gameOver();
  burst(CX, CY, "#4de3ff", 60, 5, 380);
  addRing(CX, CY, "#ff5d5d", Math.max(W, H) * 0.4, 6);
  G.shake = 22;
  G.beams = [];
  G.score = Math.round((G.kills * 10 + Math.max(0, G.wave - 1) * 100) * (elite ? 1.5 : 1));
  const isBest = G.score > G.highScore;
  if (isBest) {
    G.highScore = G.score;
    localStorage.setItem("shapeDefense.highScore", String(G.score));
  }
  const coresEarned = Math.max(1, Math.round(G.score / 150));
  cores += coresEarned;
  saveMeta();
  setState("gameover");
  overlayEl.style.display = "flex";
  overlayEl.innerHTML = `
    <div class="modal">
      <div class="title" style="text-shadow:0 0 24px rgba(255,93,93,.8)">FORTRESS DOWN</div>
      ${isBest ? `<div class="subtitle" style="color:#ffd23f;font-weight:800">NEW BEST SCORE</div>` : ""}
      <div class="stat-row">
        <div class="stat">SCORE<b>${G.score.toLocaleString()}</b></div>
        <div class="stat">WAVE REACHED<b>${G.wave}</b></div>
        <div class="stat">KILLS<b>${G.kills.toLocaleString()}</b></div>
        <div class="stat">BEST<b>${G.highScore.toLocaleString()}</b></div>
        <div class="stat">CORES EARNED<b style="color:#ffd23f">+${coresEarned}</b></div>
      </div>
      <div class="subtitle">Spend cores on permanent upgrades in the main menu</div>
      <button class="big-btn" id="retryBtn">REDEPLOY</button><br>
      <button class="ghost-btn" id="menuBtn">MAIN MENU</button>
    </div>`;
  $("retryBtn").addEventListener("click", () => {
    resetRun();
    beginIntermission(6);
  });
  $("menuBtn").addEventListener("click", showMenu);
}

function pauseGame() {
  G.pausedFrom = G.state;
  G.state = "paused";
  overlayEl.style.display = "flex";
  overlayEl.innerHTML = `
    <div class="modal">
      <div class="title" style="font-size:clamp(26px,6vw,40px)">PAUSED</div>
      <button class="big-btn" id="resumeBtn">RESUME</button><br>
      <button class="ghost-btn" id="quitBtn">ABANDON RUN</button>
    </div>`;
  $("resumeBtn").addEventListener("click", resumeGame);
  $("quitBtn").addEventListener("click", showMenu);
}

function resumeGame() {
  const back = G.pausedFrom || "playing";
  setState(back);
  overlayEl.style.display = "none";
}

/* ============================== main loop ============================== */
let lastT = performance.now();
let acc = 0;
const STEP = 1 / 60;

function frame(now) {
  let dt = (now - lastT) / 1000;
  lastT = now;
  dt = Math.min(dt, 0.1);
  if (G.state === "playing" || G.state === "intermission") {
    let gameDt = dt;
    if (G.hitStop > 0) {
      G.hitStop = Math.max(0, G.hitStop - dt);
      gameDt = dt * 0.12;
    }
    acc += gameDt;
    let guard = 0;
    while (acc >= STEP && guard++ < 8) {
      update(STEP);
      acc -= STEP;
    }
  } else {
    G.time += dt;
    if (G.state === "menu" || G.state === "gameover") updateAmbient(dt);
    updateFx(dt);
    if (G.shake > 0) G.shake = Math.max(0, G.shake - dt * 30);
  }
  render();
  requestAnimationFrame(frame);
}

resize();
showMenu();
requestAnimationFrame(frame);

/* test hook (harmless in production) */
window.__game = { G, startWave, gameOver, damageFortress, spawnEnemy, setState, showCards, resetRun, beginIntermission };
