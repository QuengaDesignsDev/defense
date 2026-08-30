"use strict";
/* Shape Defense — a shapes-only remake of the vertical fortress-defense
 * genre: a lone gunner guards the base at the bottom of the screen while
 * meteors and alien shapes rain down. Vanilla JS + Canvas 2D, no assets. */

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

/* ============================== canvas & layout ============================== */
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
let W = 0, H = 0, SCALE = 1;
let groundY = 0, heroX = 0;
let dome = { x: 0, y: 0, r: 0, h: 0 };
let buildings = [];

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width = W + "px";
  canvas.style.height = H + "px";
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  SCALE = clamp(Math.min(W, H) / 700, 0.6, 1.2);
  groundY = H - Math.max(64, H * 0.085);
  heroX = W / 2;
  // shield dome: circle through (W/2, groundY - h) and (0, groundY), center below ground
  const h = Math.min(170, H * 0.17);
  const a = ((W / 2) ** 2 - h * h) / (2 * h);
  dome = { x: W / 2, y: groundY + a, r: a + h, h };
  layoutMounts();
  makeStars();
  makeCity();
  makeSkyline();
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
  shoot: () => blip(rand(680, 760), 0.06, "square", 0.012, -300),
  boom: () => blip(rand(120, 160), 0.25, "sawtooth", 0.05, -80),
  bigBoom: () => blip(90, 0.5, "sawtooth", 0.09, -60),
  hitBase: () => blip(70, 0.3, "triangle", 0.09, -30),
  build: () => blip(330, 0.12, "triangle", 0.06, 220),
  upgrade: () => blip(440, 0.15, "triangle", 0.06, 320),
  sell: () => blip(300, 0.15, "triangle", 0.05, -160),
  card: () => blip(520, 0.2, "sine", 0.07, 260),
  levelUp: () => { blip(392, 0.12, "triangle", 0.06); setTimeout(() => blip(523, 0.12, "triangle", 0.06), 100); setTimeout(() => blip(784, 0.2, "triangle", 0.06), 200); },
  stageStart: () => blip(220, 0.3, "sawtooth", 0.05, 110),
  stageClear: () => { blip(392, 0.12, "triangle", 0.06); setTimeout(() => blip(523, 0.12, "triangle", 0.06), 110); setTimeout(() => blip(659, 0.22, "triangle", 0.06), 220); },
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
  const boss = G.state === "playing" && G.bossActive;
  const inGame = G.state === "playing";
  if (musicStep % 2 === 0) blip(boss ? 82.4 : 55, 0.32, "sine", 0.04, -8);
  if (Math.random() < (inGame ? 0.55 : 0.3)) {
    const note = MUSIC_NOTES[(Math.random() * MUSIC_NOTES.length) | 0] * (Math.random() < 0.3 ? 2 : 1);
    blip(note, 0.5, "triangle", 0.016);
  }
  if (boss && musicStep % 4 === 2) blip(41.2, 0.4, "sawtooth", 0.028, -5);
  musicStep++;
}
function startMusic() {
  if (!musicTimer) musicTimer = setInterval(musicTick, 280);
}

/* ============================== data ============================== */
const TURRET_TYPES = {
  blaster: { name: "BLASTER", color: "#35e0ff", cls: "tri", sides: 3, kind: "bullet",
    cost: 40, dmg: 8, rate: 3.0, range: 300, speed: 560,
    desc: "Rapid single-target fire" },
  cannon: { name: "CANNON", color: "#ffb03a", cls: "sq", sides: 4, kind: "bullet",
    cost: 70, dmg: 24, rate: 0.8, range: 340, speed: 400, splash: 70,
    desc: "Slow splash damage" },
  laser: { name: "LASER", color: "#ff53d4", cls: "dia", sides: 4, kind: "beam",
    cost: 90, dps: 30, range: 380,
    desc: "Piercing beam" },
  frost: { name: "FROST", color: "#8aa6ff", cls: "hex", sides: 6, kind: "pulse",
    cost: 60, pulse: 1.3, pulseDmg: 5, slow: 0.45, slowDur: 1.7, range: 230,
    desc: "Slows nearby enemies" },
  missile: { name: "MISSILE", color: "#6dff8c", cls: "pent", sides: 5, kind: "missile",
    cost: 110, dmg: 40, rate: 0.7, range: 9999, speed: 320, turn: 4.2, splash: 55,
    desc: "Homing, hunts the biggest threat" },
  tesla: { name: "TESLA", color: "#ffe94d", cls: "oct", sides: 8, kind: "tesla",
    cost: 130, dmg: 26, rate: 1.1, range: 280, chains: 2, chainRange: 130,
    desc: "Chain lightning arcs between enemies" },
};
const TURRET_ORDER = ["blaster", "cannon", "frost", "laser", "missile", "tesla"];
const MAX_LEVEL = 3;
const upgradeCost = (type, level) => Math.round(TURRET_TYPES[type].cost * (level === 1 ? 1.2 : 2.0));
const levelMul = level => Math.pow(1.65, level - 1);

/* enemies fall from the top of the screen toward the base */
const ENEMY_TYPES = {
  meteor:  { sides: 7, r: 14, hp: 26, fall: 62,  dmg: 90,  energy: 6,  xp: 3, color: "#cf8a5b", flame: true },
  zig:     { sides: 3, r: 11, hp: 16, fall: 96,  dmg: 55,  energy: 5,  xp: 3, color: "#ff9a3d", zig: true },
  blob:    { sides: 5, r: 16, hp: 55, fall: 42,  dmg: 130, energy: 9,  xp: 5, color: "#ff5d5d", wobble: true },
  split:   { sides: 6, r: 15, hp: 48, fall: 52,  dmg: 70,  energy: 10, xp: 5, color: "#ffd23f", splits: 3 },
  shard:   { sides: 3, r: 8,  hp: 10, fall: 110, dmg: 35,  energy: 3,  xp: 1, color: "#ffd23f", zig: true },
  tank:    { sides: 5, r: 22, hp: 170, fall: 26, dmg: 260, energy: 16, xp: 9, color: "#d05cff" },
  shooter: { sides: 4, r: 13, hp: 60, fall: 55,  dmg: 60,  energy: 12, xp: 7, color: "#ff4d9b", shooter: true, shotEvery: 2.6, hoverY: 0.34 },
  boss:    { sides: 8, r: 44, hp: 1500, fall: 55, dmg: 0,  energy: 180, xp: 40, color: "#ff3d6e", boss: true, volleyEvery: 2.6, hoverY: 0.24 },
  carrier: { sides: 10, r: 40, hp: 1300, fall: 58, dmg: 0, energy: 180, xp: 40, color: "#b44dff", boss: true, carrier: true, spawnEvery: 3.2, hoverY: 0.22 },
};

const PERKS = [
  { id: "dmg",    name: "DAMAGE CORE",    cls: "tri",  color: "#ff6161", desc: "All damage +20%" },
  { id: "rate",   name: "OVERCLOCK",      cls: "sq",   color: "#ffb03a", desc: "Fire rate +15%" },
  { id: "multi",  name: "SPLIT FIRE",     cls: "tri",  color: "#35e0ff", desc: "Hero fires +1 projectile" },
  { id: "repair", name: "NANO REPAIR",    cls: "hex",  color: "#38ffb0", desc: "Restore 40% base hull", once: true },
  { id: "hull",   name: "REINFORCED HULL",cls: "hex",  color: "#8aa6ff", desc: "Max hull +25% (and heal it)" },
  { id: "energy", name: "ENERGY SIPHON",  cls: "dia",  color: "#35e0ff", desc: "Energy from kills +25%" },
  { id: "crit",   name: "CRITICAL MATRIX",cls: "dia",  color: "#ff53d4", desc: "+10% crit chance (x2.5 dmg)" },
  { id: "velo",   name: "VELOCITY ROUNDS",cls: "pent", color: "#6dff8c", desc: "Projectile speed +30%, range +10%" },
  { id: "hero",   name: "GUN MODS",       cls: "oct",  color: "#fff06a", desc: "Hero damage +30%" },
];

/* ---- permanent meta-progression (persists across runs) ---- */
const META_UPGRADES = [
  { id: "hull",  name: "HULL PLATING", desc: "+10% max hull per level",      cls: "hex",  color: "#8aa6ff", max: 5 },
  { id: "dmg",   name: "DAMAGE AMP",   desc: "+5% all damage per level",     cls: "tri",  color: "#ff6161", max: 5 },
  { id: "react", name: "REACTOR",      desc: "+15 starting energy per level", cls: "dia",  color: "#35e0ff", max: 5 },
  { id: "harv",  name: "HARVESTER",    desc: "+5% kill energy per level",    cls: "pent", color: "#6dff8c", max: 5 },
];
let meta = { hull: 0, dmg: 0, react: 0, harv: 0 };
try { meta = { ...meta, ...JSON.parse(localStorage.getItem("shapeDefense.meta") || "{}") }; } catch (e) { /* fresh start */ }
let cores = +(localStorage.getItem("shapeDefense.cores") || 0) || 0;
const metaCost = level => Math.round(10 * Math.pow(1.7, level));
function saveMeta() {
  localStorage.setItem("shapeDefense.meta", JSON.stringify(meta));
  localStorage.setItem("shapeDefense.cores", String(cores));
}
let elite = localStorage.getItem("shapeDefense.elite") === "1";
const enemyDmgMul = () => (elite ? 1.4 : 1);
let bestCleared = +(localStorage.getItem("shapeDefense.bestStage") || 0) || 0;
let menuStage = bestCleared + 1;

/* ============================== state ============================== */
const G = {
  state: "menu", // menu | playing | picking | paused | gameover
  pausedFrom: null,
  stage: 0,
  stageTimer: 0,
  stageBreak: 0,   // countdown between stages
  spawnDelay: 0,   // banner delay before spawns begin
  spawnTimer: 0,
  bossActive: false,
  bossSpawned: false,
  speed: 1,
  energy: 0,
  kills: 0,
  score: 0,
  time: 0,
  hero: { level: 1, xp: 0, cd: 0, aim: -Math.PI / 2, flash: 0, pending: 0 },
  base: { hp: 3200, maxHp: 3200, flash: 0 },
  perks: {},
  mounts: [],
  selectedMount: -1,
  enemies: [],
  bullets: [],
  missiles: [],
  beams: [],
  bolts: [],
  enemyShots: [],
  particles: [],
  rings: [],
  floaters: [],
  motes: [],
  ambient: [],
  hitStop: 0,
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
const heroDmgMul = () => 1 + 0.3 * perkCount("hero");
const xpNeeded = level => 10 + (level - 1) * 12;

function layoutMounts() {
  const prev = G.mounts;
  G.mounts = [];
  const offsets = [-0.36, -0.19, 0.19, 0.36];
  for (let i = 0; i < 4; i++) {
    G.mounts.push({
      x: W / 2 + W * offsets[i],
      y: groundY - 10,
      r: 26 * SCALE,
      turret: prev[i] ? prev[i].turret : null,
    });
  }
}

/* ============================== backdrop ============================== */
let stars = [];
function makeStars() {
  stars = [];
  const n = Math.floor((W * H) / 4200);
  for (let i = 0; i < n; i++) {
    stars.push({ x: Math.random() * W, y: Math.random() * groundY, z: rand(0.25, 1), tw: rand(0, TAU) });
  }
}

/* menu planet: a besieged world ringed by city silhouettes */
let skyline = [];
function makeSkyline() {
  skyline = [];
  const n = 26;
  for (let i = 0; i < n; i++) {
    skyline.push({
      ang: (i / n) * TAU + rand(-0.04, 0.04),
      w: rand(0.05, 0.12),
      h: rand(0.06, 0.2),
      spire: Math.random() < 0.2,
    });
  }
}

function drawPlanet() {
  const px = W / 2, py = H * 0.47, pr = Math.min(W, H) * 0.27;
  const rot = G.time * 0.02;
  ctx.save();

  // atmosphere glow + body
  ctx.shadowColor = "#7db8ff";
  ctx.shadowBlur = 46;
  ctx.fillStyle = "#111a30";
  ctx.beginPath();
  ctx.arc(px, py, pr, 0, TAU);
  ctx.fill();
  ctx.shadowBlur = 0;

  // continents: dark polygon blobs clipped to the disc
  ctx.save();
  ctx.beginPath();
  ctx.arc(px, py, pr, 0, TAU);
  ctx.clip();
  ctx.fillStyle = "rgba(6,9,20,0.75)";
  const blobs = [[-0.35, -0.25, 0.42, 7], [0.3, 0.05, 0.34, 8], [-0.05, 0.42, 0.3, 6], [0.42, -0.42, 0.24, 7]];
  for (const [ox, oy, s, sides] of blobs) {
    poly(px + ox * pr, py + oy * pr, s * pr, sides, rot * 2 + ox);
    ctx.fill();
  }
  // terminator shadow on the lower-left
  const sh = ctx.createRadialGradient(px + pr * 0.4, py - pr * 0.4, pr * 0.2, px, py, pr * 1.05);
  sh.addColorStop(0, "rgba(0,0,0,0)");
  sh.addColorStop(1, "rgba(0,0,0,0.55)");
  ctx.fillStyle = sh;
  ctx.fillRect(px - pr, py - pr, pr * 2, pr * 2);
  ctx.restore();

  // rim highlight
  ctx.strokeStyle = "rgba(150,195,255,0.35)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(px, py, pr, 0, TAU);
  ctx.stroke();

  // city silhouettes around the rim, slowly rotating
  ctx.fillStyle = "#070b18";
  for (const b of skyline) {
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(b.ang + rot);
    const bw = pr * b.w, bh = pr * b.h;
    ctx.fillRect(-bw / 2, -pr - bh + 2, bw, bh + 4);
    if (b.spire) ctx.fillRect(-1.5, -pr - bh - pr * 0.06 + 2, 3, pr * 0.06);
    ctx.restore();
  }

  // burning impact sites on the rim
  for (let i = 0; i < 3; i++) {
    const a = [0.6, 2.3, 4.4][i] + rot - Math.PI / 2;
    const fx = px + Math.cos(a) * pr;
    const fy = py + Math.sin(a) * pr;
    const flick = 0.5 + 0.5 * Math.sin(G.time * 7 + i * 2.1);
    ctx.globalAlpha = 0.35 + 0.4 * flick;
    ctx.fillStyle = "#ff9a3d";
    ctx.shadowColor = "#ff9a3d";
    ctx.shadowBlur = 16;
    poly(fx, fy, pr * 0.045 * (0.7 + flick * 0.5), 5, G.time * 3 + i);
    ctx.fill();
    ctx.shadowBlur = 0;
  }
  ctx.globalAlpha = 1;

  // incoming meteor, upper right, with a flame tail
  const ma = -0.85 + Math.sin(G.time * 0.35) * 0.04;
  const mx = px + Math.cos(ma) * pr * 1.3;
  const my = py + Math.sin(ma) * pr * 1.3;
  if (Math.random() < 0.4) {
    G.particles.push({
      x: mx + rand(-4, 4), y: my - rand(6, 14),
      vx: rand(20, 45), vy: rand(-55, -25),
      r: rand(2, 4.5), sides: randInt(3, 5),
      rot: rand(0, TAU), spin: rand(-6, 6),
      color: pick(["#ff9a3d", "#ffd23f", "#ff5d3d"]), life: rand(0.3, 0.55),
    });
  }
  ctx.fillStyle = "#cf8a5b";
  ctx.shadowColor = "#ff9a3d";
  ctx.shadowBlur = 14;
  poly(mx, my, pr * 0.11, 7, G.time * 0.8);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  poly(mx - pr * 0.03, my - pr * 0.02, pr * 0.035, 6, 0);
  ctx.fill();

  ctx.restore();
}

function makeCity() {
  buildings = [];
  let x = -20;
  while (x < W + 20) {
    const w = rand(30, 80);
    buildings.push({ x, w, h: rand(H * 0.05, H * 0.16), spire: Math.random() < 0.25 });
    x += w + rand(4, 18);
  }
}

/* ============================== DOM refs ============================== */
const $ = id => document.getElementById(id);
const hudEl = $("hud"), stageEl = $("stageNum"), timerEl = $("timerNum"), energyEl = $("energyNum");
const lvlEl = $("lvlNum"), xpfillEl = $("xpfill");
const bottombarEl = $("bottombar"), hintEl = $("hint");
const buildpanelEl = $("buildpanel"), overlayEl = $("overlay");
const muteBtn = $("muteBtn"), pauseBtn = $("pauseBtn"), speedBtn = $("speedBtn");

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

/* ============================== stages ============================== */
function hpMulFor(stage) {
  return (1 + (stage - 1) * 0.26 + Math.pow(Math.max(0, stage - 1), 1.5) * 0.05) * (elite ? 1.5 : 1);
}
const stageDuration = stage => Math.min(45, 22 + stage * 3);
const isBossStage = stage => stage % 5 === 0;

function stagePool(stage) {
  const pool = ["meteor", "meteor"];
  if (stage >= 2) pool.push("zig");
  if (stage >= 3) pool.push("blob");
  if (stage >= 4) pool.push("split", "zig");
  if (stage >= 6) pool.push("tank");
  if (stage >= 7) pool.push("shooter");
  if (stage >= 9) pool.push("blob", "tank");
  return pool;
}

function startStage() {
  G.stage++;
  G.bossSpawned = false;
  G.bossActive = false;
  G.stageBreak = 0;
  G.spawnDelay = 2.0;
  G.spawnTimer = 0;
  G.stageTimer = isBossStage(G.stage) ? -1 : stageDuration(G.stage); // -1 = boss stage, no timer
  sfx.stageStart();
  if (isBossStage(G.stage)) {
    sfx.warn();
    showHint("!! BOSS INCOMING !!", 2200);
  } else {
    showHint(`STAGE ${G.stage}`, 1800);
  }
}

function spawnInterval(stage) {
  return clamp(1.7 - stage * 0.1, 0.45, 1.7);
}

function updateSpawning(dt) {
  if (G.spawnDelay > 0) { G.spawnDelay -= dt; return; }
  if (isBossStage(G.stage)) {
    if (!G.bossSpawned) {
      G.bossSpawned = true;
      G.bossActive = true;
      spawnEnemy(G.stage % 10 === 0 ? "carrier" : "boss", W / 2 + rand(-60, 60));
    }
    // light meteor trickle while the boss lives
    if (G.bossActive) {
      G.spawnTimer -= dt;
      if (G.spawnTimer <= 0) {
        G.spawnTimer = 3.2;
        spawnEnemy("meteor");
      }
    }
    return;
  }
  if (G.stageTimer > 0) {
    G.stageTimer -= dt;
    G.spawnTimer -= dt;
    if (G.spawnTimer <= 0) {
      // spawns speed up as the stage progresses
      const progress = 1 - G.stageTimer / stageDuration(G.stage);
      G.spawnTimer = spawnInterval(G.stage) * lerp(1.15, 0.65, progress) * rand(0.75, 1.25);
      spawnEnemy(pick(stagePool(G.stage)));
    }
  }
}

function stageDone() {
  if (G.spawnDelay > 0 || G.stageBreak > 0) return false;
  if (isBossStage(G.stage)) return G.bossSpawned && !G.bossActive && G.enemies.length === 0;
  return G.stageTimer <= 0 && G.enemies.length === 0;
}

function stageClear() {
  if (G.stage > bestCleared) {
    bestCleared = G.stage;
    localStorage.setItem("shapeDefense.bestStage", String(bestCleared));
  }
  const bonus = Math.round((30 + G.stage * 6) * energyMul());
  G.energy += bonus;
  addFloater(W / 2, groundY - dome.h - 30, `STAGE CLEAR  +${bonus}`, "#35e0ff");
  sfx.stageClear();
  G.stageBreak = 2.5;
}

/* ============================== enemies ============================== */
function spawnEnemy(type, x, y) {
  const def = ENEMY_TYPES[type];
  const hpMul = hpMulFor(G.stage) * (def.boss ? 1 + Math.floor(G.stage / 5 - 1) * 0.5 : 1);
  G.enemies.push({
    type, def,
    x: x !== undefined ? x : rand(30, W - 30),
    y: y !== undefined ? y : -40 - rand(0, 30),
    r: def.r * SCALE * (def.boss ? 1 : rand(0.9, 1.1)),
    hp: def.hp * hpMul,
    maxHp: def.hp * hpMul,
    fall: def.fall * SCALE * rand(0.9, 1.1) * Math.min(1.4, 1 + (G.stage - 1) * 0.02),
    vx: def.zig ? rand(60, 110) * SCALE * (Math.random() < 0.5 ? 1 : -1) : 0,
    zigT: rand(0.4, 0.9),
    wob: rand(0, TAU),
    rot: rand(0, TAU),
    spin: rand(-2, 2),
    slow: 0, slowAmt: 0,
    flash: 0,
    hovering: false,
    shotCd: def.shotEvery ? def.shotEvery * rand(0.6, 1.2) : 0,
    volleyCd: def.volleyEvery || 0,
    spawnCd: def.spawnEvery || 0,
  });
}

function updateEnemies(dt) {
  for (const e of G.enemies) {
    if (e.dead) continue;
    e.rot += e.spin * dt;
    e.flash = Math.max(0, e.flash - dt);
    if (e.slow > 0) e.slow -= dt;
    const slowMul = e.slow > 0 ? 1 - e.slowAmt : 1;
    const def = e.def;

    // hover-type enemies stop partway down; bosses start attacking mid-descent
    const hoverAt = def.hoverY ? H * def.hoverY : null;
    if (hoverAt !== null) {
      if (e.y >= hoverAt) {
        e.hovering = true;
        // gentle strafing
        e.wob += dt;
        e.x += Math.sin(e.wob * 0.9) * 30 * SCALE * dt * (def.boss ? 1.4 : 1);
        e.x = clamp(e.x, e.r + 10, W - e.r - 10);
      } else {
        e.y += e.fall * slowMul * dt;
      }
      const acting = e.hovering || (def.boss && e.y > H * 0.1);
      if (!acting) continue;
      if (def.shooter) {
        e.shotCd -= dt;
        if (e.shotCd <= 0) {
          e.shotCd = def.shotEvery * (e.slow > 0 ? 1.5 : 1);
          fireEnemyShot(e, heroX + rand(-40, 40), groundY);
          sfx.snipe();
        }
      }
      if (def.boss && !def.carrier) {
        e.volleyCd -= dt;
        if (e.volleyCd <= 0) {
          e.volleyCd = def.volleyEvery;
          for (let i = -1; i <= 1; i++) fireEnemyShot(e, heroX + i * 90 * SCALE, groundY);
          addRing(e.x, e.y, def.color, 70, 4);
          sfx.warn();
        }
      }
      if (def.carrier) {
        e.spawnCd -= dt;
        if (e.spawnCd <= 0) {
          e.spawnCd = def.spawnEvery;
          for (let k = 0; k < 3; k++) spawnEnemy("zig", e.x + rand(-30, 30), e.y + e.r);
          addRing(e.x, e.y, def.color, 70, 3);
          sfx.warn();
        }
      }
      continue;
    }

    // falling movement
    if (def.zig) {
      e.zigT -= dt;
      if (e.zigT <= 0) { e.zigT = rand(0.5, 0.9); e.vx *= -1; }
      e.x += e.vx * slowMul * dt;
      if (e.x < e.r || e.x > W - e.r) e.vx *= -1;
    } else if (def.wobble) {
      e.wob += dt * 2.2;
      e.x += Math.sin(e.wob) * 40 * SCALE * dt;
    }
    e.y += e.fall * slowMul * dt;

    // meteor flame trail
    if (def.flame && Math.random() < 0.45) {
      G.particles.push({
        x: e.x + rand(-4, 4), y: e.y - e.r - rand(0, 6),
        vx: rand(-15, 15), vy: rand(-60, -20),
        r: rand(2, 4.5), sides: randInt(3, 5),
        rot: rand(0, TAU), spin: rand(-6, 6),
        color: pick(["#ff9a3d", "#ffd23f", "#ff5d3d"]), life: rand(0.25, 0.5),
      });
    }

    // splitter breaks apart partway down
    if (def.splits && !e.hasSplit && e.y > H * 0.55) {
      e.hasSplit = true;
      e.dead = true;
      for (let i = 0; i < def.splits; i++) spawnEnemy("shard", e.x + rand(-16, 16), e.y + rand(-8, 8));
      burst(e.x, e.y, def.color, 10, 3, 160);
      sfx.boom();
      continue;
    }

    // impact with the shield dome / ground
    if (dist(e.x, e.y, dome.x, dome.y) <= dome.r + e.r * 0.4 || e.y >= groundY - e.r) {
      const dmg = Math.round(def.dmg * enemyDmgMul());
      damageBase(dmg);
      addFloater(e.x, e.y - 16, `-${dmg}`, "#ff5d5d");
      burst(e.x, e.y, def.color, 12, 3, 170);
      addRing(e.x, e.y, "#9fdcff", 60, 3);
      e.dead = true;
    }
  }
  G.enemies = G.enemies.filter(e => !e.dead);
  if (G.bossActive && !G.enemies.some(e => e.def.boss)) G.bossActive = false;
}

function fireEnemyShot(e, tx, ty) {
  const a = Math.atan2(ty - e.y, tx - e.x);
  const sp = 230 * SCALE;
  G.enemyShots.push({
    x: e.x, y: e.y + e.r * 0.6,
    vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
    dmg: Math.round((30 + G.stage * 3) * enemyDmgMul()), life: 8,
  });
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
  if (e.dead) return;
  let crit = false;
  if (canCrit && Math.random() < critChance()) {
    amt *= 2.5;
    crit = true;
  }
  e.hp -= amt;
  e.flash = 0.08;
  addFloater(e.x + rand(-6, 6), e.y - e.r - 8, `-${Math.round(amt)}`, crit ? "#ffd23f" : "#dfe8ff");
  if (e.hp <= 0 && !e.dead) killEnemy(e);
}

function killEnemy(e) {
  e.dead = true;
  G.kills++;
  G.energy += Math.round(e.def.energy * energyMul());
  gainXp(e.def.xp);
  burst(e.x, e.y, e.def.color, e.def.boss ? 46 : 10, e.def.boss ? 6 : 3, e.def.boss ? 320 : 170);
  addRing(e.x, e.y, e.def.color, e.def.boss ? 160 : 42);
  for (let i = 0; i < (e.def.boss ? 6 : 2); i++) {
    G.motes.push({ x: e.x + rand(-8, 8), y: e.y + rand(-8, 8), vx: rand(-60, 60), vy: rand(-60, 60), t: 0 });
  }
  if (e.def.splits && !e.hasSplit) {
    for (let i = 0; i < e.def.splits; i++) spawnEnemy("shard", e.x + rand(-16, 16), e.y + rand(-8, 8));
  }
  if (e.def.boss) { sfx.bigBoom(); G.shake = Math.max(G.shake, 14); G.hitStop = Math.max(G.hitStop, 0.3); }
  else sfx.boom();
}

function gainXp(amt) {
  const h = G.hero;
  h.xp += amt;
  while (h.xp >= xpNeeded(h.level)) {
    h.xp -= xpNeeded(h.level);
    h.level++;
    h.pending++;
  }
  if (h.pending > 0 && G.state === "playing") {
    sfx.levelUp();
    addRing(heroX, groundY - 20, "#6dff8c", 90, 4);
    showCards();
  }
}

function damageBase(amt) {
  const b = G.base;
  b.hp = Math.max(0, b.hp - amt);
  b.flash = 0.3;
  G.shake = Math.max(G.shake, clamp(amt * 0.06, 3, 14));
  if (amt >= 200) G.hitStop = Math.max(G.hitStop, 0.12);
  sfx.hitBase();
  if (b.hp <= 0) gameOver();
}

/* target pickers: prioritize the enemy closest to the base */
function lowestEnemy(range, fromX, fromY) {
  let best = null, bestY = -Infinity;
  for (const e of G.enemies) {
    if (e.dead || e.y < -10) continue;
    if (range && dist(fromX, fromY, e.x, e.y) - e.r > range) continue;
    if (e.y > bestY) { bestY = e.y; best = e; }
  }
  return best;
}
function nearestEnemy(x, y, range) {
  let best = null, bestD = range;
  for (const e of G.enemies) {
    if (e.dead || e.y < -10) continue;
    const d = dist(x, y, e.x, e.y) - e.r;
    if (d < bestD) { bestD = d; best = e; }
  }
  return best;
}
function biggestEnemy() {
  let best = null;
  for (const e of G.enemies) {
    if (e.dead || e.y < -10) continue;
    if (!best || e.maxHp > best.maxHp) best = e;
  }
  return best;
}

/* ============================== hero & turrets ============================== */
function updateHero(dt) {
  const h = G.hero;
  h.cd -= dt;
  h.flash = Math.max(0, h.flash - dt);
  const gunY = groundY - 34 * SCALE;
  const target = lowestEnemy(0, heroX, gunY);
  if (target) {
    const want = Math.atan2(target.y - gunY, target.x - heroX);
    let diff = want - h.aim;
    while (diff > Math.PI) diff -= TAU;
    while (diff < -Math.PI) diff += TAU;
    h.aim += clamp(diff, -8 * dt, 8 * dt);
    const rate = 3.4 * rateMul();
    if (h.cd <= 0 && Math.abs(diff) < 0.5) {
      h.cd = 1 / rate;
      h.flash = 0.05;
      const shots = 1 + perkCount("multi");
      const dmg = (13 + (h.level - 1) * 1.6) * dmgMul() * heroDmgMul();
      for (let i = 0; i < shots; i++) {
        const a = h.aim + (i - (shots - 1) / 2) * 0.09;
        const sp = 760 * SCALE * projSpeedMul();
        G.bullets.push({
          x: heroX + Math.cos(a) * 20, y: gunY + Math.sin(a) * 20,
          vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
          dmg, splash: 0, color: "#7df3ff", r: 3, life: 2, tracer: true,
        });
      }
      sfx.shoot();
    }
  }
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
  for (const mount of G.mounts) {
    const t = mount.turret;
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
          if (dist(mount.x, mount.y, e.x, e.y) <= s.range + e.r) {
            e.slow = s.slowDur;
            e.slowAmt = s.slow;
            damageEnemy(e, s.pulseDmg, false);
            hit = true;
          }
        }
        if (hit || G.enemies.length) addRing(mount.x, mount.y, def.color, s.range, 2);
      }
      continue;
    }

    if (def.kind === "beam") {
      let target = t.target;
      if (!target || target.dead || dist(mount.x, mount.y, target.x, target.y) - target.r > s.range) {
        target = t.target = nearestEnemy(mount.x, mount.y, s.range);
      }
      if (target) {
        t.aim = Math.atan2(target.y - mount.y, target.x - mount.x);
        const bx = target.x - mount.x, by = target.y - mount.y;
        const blen = Math.hypot(bx, by) || 1;
        for (const e of G.enemies) {
          if (e.dead) continue;
          const ex = e.x - mount.x, ey = e.y - mount.y;
          const proj = clamp((ex * bx + ey * by) / (blen * blen), 0, 1);
          if (Math.hypot(ex - bx * proj, ey - by * proj) <= e.r + 5) {
            e.hp -= s.dps * dt;
            e.flash = 0.06;
            if (e.hp <= 0 && !e.dead) killEnemy(e);
          }
        }
        G.beams.push({ x1: mount.x, y1: mount.y - 10, x2: target.x, y2: target.y, color: def.color, level: t.level });
        if (Math.random() < 0.35) {
          G.particles.push({ x: target.x + rand(-4, 4), y: target.y + rand(-4, 4), vx: rand(-50, 50), vy: rand(-50, 50), r: 1.8, sides: 4, rot: rand(0, TAU), spin: 6, color: "#ffffff", life: 0.2 });
        }
      }
      continue;
    }

    if (def.kind === "tesla") {
      const target = nearestEnemy(mount.x, mount.y, s.range);
      if (target) t.aim = Math.atan2(target.y - mount.y, target.x - mount.x);
      if (target && t.cd <= 0) {
        t.cd = 1 / s.rate;
        const pts = [{ x: mount.x, y: mount.y - 10 }];
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
      ? biggestEnemy()
      : nearestEnemy(mount.x, mount.y, s.range);
    if (target) t.aim = Math.atan2(target.y - mount.y, target.x - mount.x);
    if (target && t.cd <= 0) {
      t.cd = 1 / s.rate;
      if (def.kind === "missile") {
        G.missiles.push({
          x: mount.x, y: mount.y - 10,
          angle: t.aim + rand(-0.5, 0.5),
          speed: s.speed, turn: def.turn,
          dmg: s.dmg, splash: s.splash,
          target, color: def.color, life: 6,
        });
      } else {
        const a = t.aim;
        G.bullets.push({
          x: mount.x + Math.cos(a) * mount.r, y: mount.y - 10 + Math.sin(a) * mount.r,
          vx: Math.cos(a) * s.speed, vy: Math.sin(a) * s.speed,
          dmg: s.dmg, splash: s.splash,
          color: def.color, r: def.splash ? 5 : 3,
          life: 2.2,
        });
        burst(mount.x + Math.cos(a) * mount.r, mount.y - 10 + Math.sin(a) * mount.r, def.color, 2, 1.5, 70);
      }
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
    if (b.life <= 0 || b.y < -60 || b.x < -60 || b.x > W + 60) { b.dead = true; continue; }
    for (const e of G.enemies) {
      if (e.dead || e.y < -10) continue;
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
      if (e.dead || e.y < -10) continue;
      if (dist(m.x, m.y, e.x, e.y) <= e.r + 5) {
        m.dead = true;
        damageEnemy(e, m.dmg);
        explodeAt(m.x, m.y, m.dmg * 0.5, m.splash, m.color);
        break;
      }
    }
  }
  G.missiles = G.missiles.filter(m => !m.dead);

  for (const s of G.enemyShots) {
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.life -= dt;
    if (s.life <= 0) { s.dead = true; continue; }
    if (dist(s.x, s.y, dome.x, dome.y) <= dome.r || s.y >= groundY - 6) {
      s.dead = true;
      damageBase(s.dmg);
      addFloater(s.x, s.y - 14, `-${s.dmg}`, "#ff5d5d");
      addRing(s.x, s.y, "#9fdcff", 40, 2);
    }
  }
  G.enemyShots = G.enemyShots.filter(s => !s.dead);
}

/* ============================== fx ============================== */
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

  const tx = W - 130, ty = 28;
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
    const def = ENEMY_TYPES[pick(["meteor", "zig", "blob", "split", "shooter"])];
    G.ambient.push({
      def,
      x: rand(30, W - 30),
      y: -50,
      vx: rand(-8, 8),
      vy: rand(14, 34),
      r: def.r * SCALE * rand(0.8, 1.6),
      rot: rand(0, TAU),
      spin: rand(-1.2, 1.2),
    });
  }
  for (const a of G.ambient) {
    a.x += a.vx * dt;
    a.y += a.vy * dt;
    a.rot += a.spin * dt;
  }
  G.ambient = G.ambient.filter(a => a.y < H + 60);
}

/* ============================== update ============================== */
function update(dt) {
  G.time += dt;
  G.base.flash = Math.max(0, G.base.flash - dt);
  if (G.shake > 0) G.shake = Math.max(0, G.shake - dt * 30);

  if (G.state === "playing") {
    if (G.stageBreak > 0) {
      G.stageBreak -= dt;
      if (G.stageBreak <= 0) startStage();
    } else {
      updateSpawning(dt);
    }
    updateHero(dt);
    updateTurrets(dt);
    updateEnemies(dt);
    updateProjectiles(dt);
    if (G.stageBreak <= 0 && stageDone()) stageClear();
  }

  updateFx(dt);
  updateHud();
}

/* ============================== HUD ============================== */
let lastStage = -1, lastEnergy = -1, lastTimer = "", lastLvl = -1, lastXp = -1;
function updateHud() {
  if (G.stage !== lastStage) { stageEl.textContent = Math.max(1, G.stage); lastStage = G.stage; }
  const en = Math.floor(G.energy);
  if (en !== lastEnergy) { energyEl.textContent = en; lastEnergy = en; refreshPanelAffordability(); }
  let tstr;
  if (isBossStage(G.stage)) tstr = "BOSS";
  else {
    const t = Math.max(0, Math.ceil(G.stageTimer));
    tstr = `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
  }
  if (tstr !== lastTimer) { timerEl.textContent = tstr; lastTimer = tstr; }
  if (G.hero.level !== lastLvl) { lvlEl.textContent = G.hero.level; lastLvl = G.hero.level; }
  const xpPct = Math.round((G.hero.xp / xpNeeded(G.hero.level)) * 100);
  if (xpPct !== lastXp) { xpfillEl.style.width = xpPct + "%"; lastXp = xpPct; }
}

/* ============================== render ============================== */
function render() {
  ctx.clearRect(0, 0, W, H);

  // sky
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, "#04060f");
  grad.addColorStop(0.75, "#0a1128");
  grad.addColorStop(1, "#0d1530");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  for (const s of stars) {
    const tw = 0.5 + 0.5 * Math.sin(G.time * 1.4 + s.tw);
    ctx.globalAlpha = 0.25 + 0.6 * s.z * tw;
    ctx.fillStyle = "#bcd2ff";
    const sz = s.z * 1.8;
    ctx.fillRect(s.x, s.y, sz, sz);
  }
  ctx.globalAlpha = 1;

  drawCity();

  ctx.save();
  if (G.shake > 0) {
    ctx.translate(rand(-G.shake, G.shake) * 0.5, rand(-G.shake, G.shake) * 0.5);
  }

  if (G.state === "menu") { drawPlanet(); drawAmbient(); }
  else if (G.state === "gameover") drawAmbient();
  drawDome();
  drawGround();
  drawBase();
  drawMounts();
  drawTurrets();
  drawHero();
  drawRings();
  drawBeams();
  drawBolts();
  drawEnemies();
  drawProjectiles();
  drawParticles();
  drawFloaters();
  ctx.restore();

  drawMotes();
}

function drawCity() {
  ctx.fillStyle = "#080d1c";
  for (const b of buildings) {
    ctx.fillRect(b.x, groundY - b.h, b.w, b.h);
    if (b.spire) ctx.fillRect(b.x + b.w / 2 - 2, groundY - b.h - 14, 4, 14);
  }
}

function drawDome() {
  const b = G.base;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, W, groundY);
  ctx.clip();
  ctx.beginPath();
  ctx.arc(dome.x, dome.y, dome.r, 0, TAU);
  ctx.strokeStyle = b.flash > 0 ? "rgba(255,120,120,0.9)" : "rgba(120,200,255,0.35)";
  ctx.lineWidth = b.flash > 0 ? 3 : 1.5;
  ctx.shadowColor = "#4de3ff";
  ctx.shadowBlur = 12;
  ctx.stroke();
  ctx.globalAlpha = b.flash > 0 ? 0.12 : 0.05;
  ctx.fillStyle = "#4de3ff";
  ctx.fill();
  ctx.restore();
  ctx.globalAlpha = 1;
}

function drawGround() {
  ctx.fillStyle = "#05070f";
  ctx.fillRect(0, groundY, W, H - groundY);
  ctx.strokeStyle = "rgba(120,160,255,0.35)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, groundY);
  ctx.lineTo(W, groundY);
  ctx.stroke();
}

function drawBase() {
  // little bunker behind the hero
  const bw = 92 * SCALE, bh = 44 * SCALE;
  const bx = heroX - bw / 2, by = groundY - bh;
  ctx.save();
  ctx.fillStyle = "#0d1428";
  ctx.strokeStyle = "rgba(120,160,255,0.4)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(bx, groundY);
  ctx.lineTo(bx, by + 10 * SCALE);
  ctx.lineTo(heroX, by - 10 * SCALE);
  ctx.lineTo(bx + bw, by + 10 * SCALE);
  ctx.lineTo(bx + bw, groundY);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // windows
  ctx.fillStyle = "rgba(120,200,255,0.35)";
  for (let i = 0; i < 3; i++) {
    ctx.fillRect(bx + bw * 0.22 + i * bw * 0.22, by + bh * 0.42, bw * 0.1, bh * 0.2);
  }
  // hull bar arc above the hero
  const pct = clamp(G.base.hp / G.base.maxHp, 0, 1);
  const ar = 52 * SCALE;
  const cy = groundY - 30 * SCALE;
  ctx.lineWidth = 5;
  ctx.lineCap = "round";
  ctx.strokeStyle = "rgba(255,255,255,0.1)";
  ctx.beginPath();
  ctx.arc(heroX, cy, ar, Math.PI * 1.25, Math.PI * 1.75);
  ctx.stroke();
  ctx.strokeStyle = pct > 0.5 ? "#38ffb0" : pct > 0.25 ? "#ffd23f" : "#ff5d5d";
  ctx.shadowColor = ctx.strokeStyle;
  ctx.shadowBlur = 8;
  ctx.beginPath();
  ctx.arc(heroX, cy, ar, Math.PI * 1.25, Math.PI * (1.25 + 0.5 * pct));
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.lineCap = "butt";
  ctx.fillStyle = ctx.strokeStyle;
  ctx.font = `800 ${Math.round(15 * SCALE + 4)}px "Avenir Next","Segoe UI",system-ui,sans-serif`;
  ctx.textAlign = "center";
  ctx.fillText(Math.ceil(G.base.hp), heroX, cy - ar - 8);
  ctx.restore();
}

function drawHero() {
  const h = G.hero;
  const gunY = groundY - 34 * SCALE;
  ctx.save();
  // legs + body: stacked shapes, dark with cyan glow
  ctx.strokeStyle = "#35e0ff";
  ctx.fillStyle = "#0b1226";
  ctx.lineWidth = 2;
  ctx.shadowColor = "#35e0ff";
  ctx.shadowBlur = 10;
  poly(heroX, groundY - 12 * SCALE, 11 * SCALE, 4, Math.PI / 4); // hips
  ctx.fill();
  ctx.stroke();
  poly(heroX, gunY, 12 * SCALE, 3, h.aim + Math.PI / 2); // torso aims
  ctx.fill();
  ctx.stroke();
  poly(heroX, gunY - 15 * SCALE, 6 * SCALE, 6, G.time * 0.5); // head
  ctx.fillStyle = "#9fdcff";
  ctx.fill();
  ctx.shadowBlur = 0;
  // gun
  ctx.save();
  ctx.translate(heroX, gunY);
  ctx.rotate(h.aim);
  ctx.fillStyle = "#dfe8ff";
  ctx.fillRect(6 * SCALE, -2, 18 * SCALE, 4);
  if (h.flash > 0) {
    ctx.fillStyle = "#ffffff";
    ctx.shadowColor = "#7df3ff";
    ctx.shadowBlur = 14;
    poly(26 * SCALE, 0, 7, 4, G.time * 30);
    ctx.fill();
  }
  ctx.restore();
  ctx.restore();
}

function drawMounts() {
  for (let i = 0; i < G.mounts.length; i++) {
    const m = G.mounts[i];
    const selected = i === G.selectedMount;
    ctx.save();
    ctx.fillStyle = "#0d1428";
    ctx.fillRect(m.x - m.r * 0.8, groundY - 8, m.r * 1.6, 8);
    if (!m.turret) {
      ctx.globalAlpha = selected ? 0.95 : 0.4 + 0.15 * Math.sin(G.time * 2 + i);
      ctx.strokeStyle = selected ? "#35e0ff" : "#4a6bb0";
      ctx.lineWidth = selected ? 2 : 1.2;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.arc(m.x, m.y - 8, m.r * 0.7, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
      const c = m.r * 0.26;
      ctx.beginPath();
      ctx.moveTo(m.x - c, m.y - 8); ctx.lineTo(m.x + c, m.y - 8);
      ctx.moveTo(m.x, m.y - 8 - c); ctx.lineTo(m.x, m.y - 8 + c);
      ctx.stroke();
    }
    ctx.restore();
  }
}

function drawTurrets() {
  for (let i = 0; i < G.mounts.length; i++) {
    const m = G.mounts[i];
    const t = m.turret;
    if (!t) continue;
    const def = TURRET_TYPES[t.type];
    const selected = i === G.selectedMount;
    const size = m.r * (0.62 + 0.14 * t.level);
    ctx.save();

    if (selected) {
      const st = turretStats(t);
      if (st.range < Math.max(W, H)) {
        ctx.globalAlpha = 0.12;
        ctx.fillStyle = def.color;
        ctx.beginPath();
        ctx.arc(m.x, m.y - 10, st.range, 0, TAU);
        ctx.fill();
        ctx.globalAlpha = 0.5;
        ctx.strokeStyle = def.color;
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }

    ctx.strokeStyle = "rgba(120,160,255,0.5)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(m.x, m.y - 8, m.r * 0.8, 0, TAU);
    ctx.stroke();

    const aim = (t.aim ?? -Math.PI / 2) + Math.PI / 2;
    ctx.shadowColor = def.color;
    ctx.shadowBlur = selected ? 20 : 12;
    ctx.fillStyle = def.color;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = selected ? 2 : 1;
    poly(m.x, m.y - 10, size, def.sides, def.kind === "pulse" ? t.rot * 0.8 : aim);
    ctx.fill();
    if (selected) ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.fillStyle = "#ffffff";
    for (let l = 0; l < t.level; l++) {
      ctx.beginPath();
      ctx.arc(m.x - 8 + l * 8, groundY - 3, 2.2, 0, TAU);
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
  ctx.globalAlpha = 1;
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
    if (b.tracer) {
      // hero tracers: bright streaks like the reference game
      const len = 0.08;
      ctx.strokeStyle = b.color;
      ctx.shadowColor = b.color;
      ctx.shadowBlur = 10;
      ctx.lineWidth = 2.5;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(b.x - b.vx * len, b.y - b.vy * len);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.lineCap = "butt";
    } else {
      ctx.fillStyle = b.color;
      ctx.shadowColor = b.color;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, TAU);
      ctx.fill();
    }
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
  ctx.font = `700 ${Math.round(13 * SCALE + 4)}px "Avenir Next","Segoe UI",system-ui,sans-serif`;
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

/* ============================== build panel ============================== */
function turretInvested(t) {
  let total = TURRET_TYPES[t.type].cost;
  for (let l = 1; l < t.level; l++) total += upgradeCost(t.type, l);
  return total;
}

function openPanelForMount(i) {
  G.selectedMount = i;
  const mount = G.mounts[i];
  buildpanelEl.innerHTML = "";
  buildpanelEl.style.display = "flex";
  bottombarEl.style.visibility = "hidden";

  if (!mount.turret) {
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
        mount.turret = { type: key, level: 1, cd: 0, rot: 0 };
        sfx.build();
        addRing(mount.x, mount.y - 10, def.color, 40);
        burst(mount.x, mount.y - 10, def.color, 8, 2, 120);
        closePanel();
      });
      buildpanelEl.appendChild(btn);
    }
  } else {
    const t = mount.turret;
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
        addRing(mount.x, mount.y - 10, def.color, 50);
        openPanelForMount(i);
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
      mount.turret = null;
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
  G.selectedMount = -1;
  buildpanelEl.style.display = "none";
  bottombarEl.style.visibility = "visible";
}

/* ============================== input ============================== */
canvas.addEventListener("pointerdown", ev => {
  ensureAudio();
  if (G.state !== "playing") return;
  const x = ev.clientX, y = ev.clientY;
  for (let i = 0; i < G.mounts.length; i++) {
    const m = G.mounts[i];
    if (dist(x, y, m.x, m.y - 10) <= Math.max(m.r * 1.5, 32)) {
      if (G.selectedMount === i) closePanel();
      else openPanelForMount(i);
      return;
    }
  }
  closePanel();
});

document.addEventListener("keydown", ev => {
  if (ev.key === "p" || ev.key === "P" || ev.key === "Escape") {
    if (G.state === "playing") pauseGame();
    else if (G.state === "paused") resumeGame();
  }
  if (ev.key === "s" || ev.key === "S") toggleSpeed();
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
  if (G.state === "playing") pauseGame();
});

function toggleSpeed() {
  G.speed = G.speed === 1 ? 2 : 1;
  speedBtn.textContent = "x" + G.speed;
}
speedBtn.addEventListener("click", () => {
  ensureAudio();
  toggleSpeed();
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden && G.state === "playing") pauseGame();
});

/* ============================== states & screens ============================== */
function setState(next) {
  G.state = next;
  overlayEl.classList.remove("home");
  hudEl.style.display = next === "menu" || next === "gameover" ? "none" : "flex";
  bottombarEl.style.display = next === "playing" ? "flex" : "none";
  if (next !== "playing") closePanel();
  overlayEl.style.display = "none";
}

function resetRun() {
  G.stage = 0;
  G.stageTimer = 0;
  G.stageBreak = 0;
  G.spawnDelay = 0;
  G.bossActive = false;
  G.bossSpawned = false;
  G.speed = 1;
  speedBtn.textContent = "x1";
  G.energy = 90 + meta.react * 15;
  G.kills = 0;
  G.time = 0;
  G.perks = {};
  G.hero = { level: 1, xp: 0, cd: 0, aim: -Math.PI / 2, flash: 0, pending: 0 };
  G.enemies = [];
  G.bullets = [];
  G.missiles = [];
  G.beams = [];
  G.bolts = [];
  G.enemyShots = [];
  G.particles = [];
  G.rings = [];
  G.floaters = [];
  G.motes = [];
  G.ambient = [];
  G.hitStop = 0;
  G.base.maxHp = Math.round(3200 * (1 + 0.1 * meta.hull));
  G.base.hp = G.base.maxHp;
  for (const m of G.mounts) m.turret = null;
  $("eliteTag").hidden = !elite;
  lastStage = lastEnergy = lastLvl = lastXp = -1;
  lastTimer = "";
}

function beginRun() {
  resetRun();
  // start at the selected stage; later starts bring extra starting energy
  G.stage = menuStage - 1;
  G.energy += (menuStage - 1) * 30;
  setState("playing");
  startStage();
  showHint("TAP A GROUND SOCKET TO BUILD A TURRET", 4500);
}

function showMenu() {
  setState("menu");
  overlayEl.classList.add("home");
  overlayEl.style.display = "flex";
  menuStage = clamp(menuStage, 1, bestCleared + 1);
  const metaLv = meta.hull + meta.dmg + meta.react + meta.harv;
  const cleared = bestCleared >= menuStage;
  const diff = elite ? "ELITE" : "NORMAL";
  overlayEl.innerHTML = `
    <div class="home-wrap">
      <div>
        <div class="home-top">
          <div class="avatar">${shapeIcon("hex", "#35e0ff")}<b>${metaLv}</b></div>
          <div class="pname">COMMANDER<small>SHAPE DEFENSE</small></div>
          <div class="chips">
            <button class="res-chip" id="coresChip" title="Cores — spend in Upgrades">${shapeIcon("hex", "#ffd23f", "width:13px;height:13px")} ${cores}<span class="plus">+</span></button>
            <button class="res-chip" id="bestChip" title="Best score">${shapeIcon("dia", "#35e0ff", "width:12px;height:12px")} ${G.highScore.toLocaleString()}</button>
          </div>
        </div>
        <div class="home-head">
          <div class="stage-pill ${elite ? "elite" : ""}">${diff} STAGE ${menuStage}</div>
          <div class="record">Highest Stage Cleared: ${bestCleared || "&mdash;"}</div>
          <div class="seg">
            <button id="segNormal" class="${elite ? "" : "on"}">NORMAL</button>
            <button id="segElite" class="${elite ? "on elite" : ""}">ELITE</button>
          </div>
        </div>
      </div>
      <div class="home-bottom">
        <div class="task-chip">CLEAR ${diff} STAGE ${menuStage}<br><b style="color:${cleared ? "#38ffb0" : "#ff5d5d"}">${cleared ? 1 : 0}/1</b></div>
        <div class="home-actions">
          <button class="tile" id="shopTile">${shapeIcon("hex", "#ffd23f")}UPGRADES</button>
          <div style="flex:1">
            <button class="battle-btn" id="playBtn">BATTLE</button>
            <div class="battle-cost">${shapeIcon("dia", "#35e0ff", "width:10px;height:10px")} STAGE ${menuStage}${menuStage > 1 ? ` &middot; +${(menuStage - 1) * 30} ENERGY` : ""}</div>
          </div>
          <button class="tile" id="intelTile">${shapeIcon("tri", "#ff6161")}INTEL</button>
        </div>
      </div>
    </div>
    <button class="arrow left" id="prevStage" ${menuStage <= 1 ? "disabled" : ""}><i></i></button>
    <button class="arrow right" id="nextStage" ${menuStage >= bestCleared + 1 ? "disabled" : ""}><i></i></button>`;
  $("playBtn").addEventListener("click", () => {
    ensureAudio();
    beginRun();
  });
  const setElite = val => {
    ensureAudio();
    if (elite === val) return;
    elite = val;
    localStorage.setItem("shapeDefense.elite", elite ? "1" : "0");
    sfx.card();
    showMenu();
  };
  $("segNormal").addEventListener("click", () => setElite(false));
  $("segElite").addEventListener("click", () => setElite(true));
  $("prevStage").addEventListener("click", () => {
    ensureAudio();
    if (menuStage > 1) { menuStage--; sfx.build(); showMenu(); }
  });
  $("nextStage").addEventListener("click", () => {
    ensureAudio();
    if (menuStage < bestCleared + 1) { menuStage++; sfx.build(); showMenu(); }
  });
  $("shopTile").addEventListener("click", showShop);
  $("coresChip").addEventListener("click", showShop);
  $("bestChip").addEventListener("click", showIntel);
  $("intelTile").addEventListener("click", showIntel);
}

function showShop() {
  setState("menu");
  overlayEl.style.display = "flex";
  overlayEl.innerHTML = `
    <div class="modal">
      <div class="title" style="font-size:clamp(24px,6vw,36px)">UPGRADES</div>
      <div class="legend" style="margin-top:14px">${shapeIcon("hex", "#ffd23f")}
        <div style="font-size:14px;color:#dfe8ff;font-weight:800">CORES <span style="color:#ffd23f">${cores}</span></div>
      </div>
      <div class="subtitle">Permanent upgrades, applied to every run. Earn cores by playing.</div>
      <div class="cards" style="margin-top:14px">
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
      </div>
      <button class="ghost-btn" id="backBtn">BACK</button>
    </div>`;
  $("backBtn").addEventListener("click", showMenu);
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
      showShop();
    });
  });
}

function showIntel() {
  setState("menu");
  overlayEl.style.display = "flex";
  overlayEl.innerHTML = `
    <div class="modal">
      <div class="title" style="font-size:clamp(24px,6vw,36px)">INTEL</div>
      <div class="subtitle">The sky is falling &mdash; in polygons. Your gunner auto-fires at the
      lowest threat. Tap ground sockets to build turrets with energy from kills.
      Level up to pick upgrade cards. Survive each stage's timer; every 5th stage a boss descends.</div>
      <div class="legend" style="margin-top:18px">
        <div>${shapeIcon("hex", "#cf8a5b")} METEOR</div>
        <div>${shapeIcon("tri", "#ff9a3d")} ZIGZAG</div>
        <div>${shapeIcon("pent", "#ff5d5d")} BLOB</div>
        <div>${shapeIcon("hex", "#ffd23f")} SPLITTER</div>
      </div>
      <div class="legend">
        <div>${shapeIcon("pent", "#d05cff")} TANK</div>
        <div>${shapeIcon("dia", "#ff4d9b")} SNIPER</div>
        <div>${shapeIcon("oct", "#ff3d6e")} BOSS</div>
        <div>${shapeIcon("hex", "#b44dff")} CARRIER</div>
      </div>
      <div class="subtitle" style="margin-top:14px">Elite mode: enemies +50% HP and +40% damage &middot; score &amp; cores x1.5.<br>
      Best score: <b style="color:#fff">${G.highScore.toLocaleString()}</b></div>
      <button class="ghost-btn" id="backBtn">BACK</button>
    </div>`;
  $("backBtn").addEventListener("click", showMenu);
}

function showCards() {
  setState("picking");
  let options = PERKS.filter(p => !(p.id === "repair" && G.base.hp >= G.base.maxHp));
  options = shuffle(options.slice()).slice(0, 3);
  overlayEl.style.display = "flex";
  overlayEl.innerHTML = `
    <div class="modal">
      <div class="title" style="font-size:clamp(22px,5vw,34px)">LEVEL UP &mdash; LV ${G.hero.level - G.hero.pending + 1}</div>
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
      G.hero.pending--;
      if (G.hero.pending > 0) showCards();
      else setState("playing");
    });
  });
}

function applyPerk(p) {
  G.perks[p.id] = (G.perks[p.id] || 0) + 1;
  const b = G.base;
  if (p.id === "repair") {
    b.hp = Math.min(b.maxHp, b.hp + b.maxHp * 0.4);
    G.perks[p.id] = 0; // repair is consumable, not a stacking stat
  }
  if (p.id === "hull") {
    const add = Math.round(b.maxHp * 0.25);
    b.maxHp += add;
    b.hp = Math.min(b.maxHp, b.hp + add);
  }
  addRing(heroX, groundY - 30, p.color, 120, 4);
}

function gameOver() {
  if (G.state === "gameover") return;
  sfx.gameOver();
  burst(heroX, groundY - 20, "#4de3ff", 60, 5, 380);
  addRing(heroX, groundY - 20, "#ff5d5d", Math.max(W, H) * 0.4, 6);
  G.shake = 22;
  G.beams = [];
  G.score = Math.round((G.kills * 10 + Math.max(0, G.stage - 1) * 150) * (elite ? 1.5 : 1));
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
      <div class="title" style="text-shadow:0 0 24px rgba(255,93,93,.8)">BASE DOWN</div>
      ${isBest ? `<div class="subtitle" style="color:#ffd23f;font-weight:800">NEW BEST SCORE</div>` : ""}
      <div class="stat-row">
        <div class="stat">SCORE<b>${G.score.toLocaleString()}</b></div>
        <div class="stat">STAGE<b>${G.stage}</b></div>
        <div class="stat">KILLS<b>${G.kills.toLocaleString()}</b></div>
        <div class="stat">BEST<b>${G.highScore.toLocaleString()}</b></div>
        <div class="stat">CORES EARNED<b style="color:#ffd23f">+${coresEarned}</b></div>
      </div>
      <div class="subtitle">Spend cores on permanent upgrades in the main menu</div>
      <button class="big-btn" id="retryBtn">REDEPLOY</button><br>
      <button class="ghost-btn" id="menuBtn">MAIN MENU</button>
    </div>`;
  $("retryBtn").addEventListener("click", beginRun);
  $("menuBtn").addEventListener("click", showMenu);
}

function pauseGame() {
  G.pausedFrom = G.state;
  G.state = "paused";
  overlayEl.style.display = "flex";
  overlayEl.innerHTML = `
    <div class="modal">
      <div class="title" style="font-size:clamp(26px,6vw,40px)">PAUSED</div>
      <div class="subtitle">STAGE ${G.stage} &middot; LV ${G.hero.level}</div>
      <button class="big-btn" id="resumeBtn">RESUME</button><br>
      <button class="ghost-btn" id="quitBtn">ABANDON RUN</button>
    </div>`;
  $("resumeBtn").addEventListener("click", resumeGame);
  $("quitBtn").addEventListener("click", showMenu);
}

function resumeGame() {
  setState(G.pausedFrom || "playing");
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
  if (G.state === "playing") {
    let gameDt = dt * G.speed;
    if (G.hitStop > 0) {
      G.hitStop = Math.max(0, G.hitStop - dt);
      gameDt = dt * 0.12;
    }
    acc += gameDt;
    let guard = 0;
    while (acc >= STEP && guard++ < 10) {
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
window.__game = { G, startStage, stageClear, gameOver, damageBase, spawnEnemy, setState, showCards, resetRun, beginRun, gainXp };
