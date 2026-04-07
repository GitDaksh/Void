/* ==============================================
   VOID — Main Game Script
   Physics Puzzle Game using Matter.js
   ============================================== */

'use strict';

// ─────────────────────────────────────────────
//  ENGINE ALIASES
// ─────────────────────────────────────────────
const { Engine, Render, Runner, Bodies, Body, World, Events, Mouse, Query,
        Composite, Constraint, Vector, Common } = Matter;

// ─────────────────────────────────────────────
//  GLOBAL STATE
// ─────────────────────────────────────────────
const State = {
  currentLevel: 0,
  totalScore: 0,
  throws: 0,
  fragmentsCollected: 0,
  totalFragments: 0,
  levelStartTime: 0,
  isDragging: false,
  dragStart: { x: 0, y: 0 },
  dragCurrent: { x: 0, y: 0 },
  orb: null,
  orbLaunched: false,
  levelComplete: false,
};

// ─────────────────────────────────────────────
//  CANVAS & ENGINE SETUP
// ─────────────────────────────────────────────
const canvas   = document.getElementById('game-canvas');
const ctx      = canvas.getContext('2d');
let W, H;

let engine, world, runner;
let bodies   = [];    // all physics bodies in scene
let fragments = [];   // collectible fragment bodies
let portal    = null; // exit portal body
let walls     = [];   // invisible walls

// ─────────────────────────────────────────────
//  SOUND ENGINE (Web Audio API)
// ─────────────────────────────────────────────
const AudioCtx = window.AudioContext || window.webkitAudioContext;
let audioCtx = null;

function initAudio() {
  if (audioCtx) return;
  audioCtx = new AudioCtx();
}

function playTone(freq, type = 'sine', duration = 0.15, volume = 0.08) {
  if (!audioCtx) return;
  const osc  = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.type = type;
  osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
  gain.gain.setValueAtTime(volume, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);
  osc.start();
  osc.stop(audioCtx.currentTime + duration);
}

function sfxLaunch()   { playTone(220, 'sawtooth', 0.08, 0.06); setTimeout(() => playTone(330, 'sine', 0.1, 0.05), 60); }
function sfxCollect()  { playTone(660, 'sine', 0.2, 0.1); setTimeout(() => playTone(880, 'sine', 0.15, 0.08), 80); }
function sfxCollide()  { playTone(80, 'square', 0.1, 0.05); }
function sfxComplete() {
  [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => playTone(f, 'sine', 0.3, 0.08), i * 100));
}
function sfxReset()    { playTone(200, 'sine', 0.2, 0.06); }

// ─────────────────────────────────────────────
//  RESIZE
// ─────────────────────────────────────────────
function resize() {
  const wrapper = document.getElementById('canvas-wrapper');
  W = wrapper.clientWidth;
  H = wrapper.clientHeight;
  canvas.width  = W;
  canvas.height = H;
}

// ─────────────────────────────────────────────
//  LEVEL DEFINITIONS
//  Each level: { fragments, platforms, pegs, title }
//  Positions are in normalized 0-1 space, resolved at runtime
// ─────────────────────────────────────────────
const LEVELS = [
  // ── LEVEL 1: Tutorial — clear open space ──
  {
    title: 'LEVEL  01',
    orbStart: { x: 0.18, y: 0.75 },
    portalPos: { x: 0.82, y: 0.3 },
    platforms: [
      { x: 0.5, y: 0.88, w: 0.9, h: 0.025, angle: 0 },
      { x: 0.35, y: 0.6,  w: 0.22, h: 0.02,  angle: 0 },
      { x: 0.65, y: 0.48, w: 0.2,  h: 0.02,  angle: -0.1 },
    ],
    fragments: [
      { x: 0.35, y: 0.54 },
      { x: 0.65, y: 0.42 },
      { x: 0.82, y: 0.55 },
    ],
    pegs: [],
  },

  // ── LEVEL 2: Bouncing pegs ──
  {
    title: 'LEVEL  02',
    orbStart: { x: 0.12, y: 0.8 },
    portalPos: { x: 0.88, y: 0.22 },
    platforms: [
      { x: 0.5,  y: 0.9,  w: 0.95, h: 0.022, angle: 0 },
      { x: 0.28, y: 0.62, w: 0.18, h: 0.018, angle: 0.15 },
      { x: 0.58, y: 0.5,  w: 0.18, h: 0.018, angle: -0.12 },
      { x: 0.78, y: 0.38, w: 0.14, h: 0.018, angle: 0 },
    ],
    fragments: [
      { x: 0.28, y: 0.55 },
      { x: 0.55, y: 0.44 },
      { x: 0.78, y: 0.31 },
      { x: 0.88, y: 0.55 },
    ],
    pegs: [
      { x: 0.42, y: 0.76 },
      { x: 0.62, y: 0.68 },
      { x: 0.52, y: 0.62 },
    ],
  },

  // ── LEVEL 3: Walled corridor ──
  {
    title: 'LEVEL  03',
    orbStart: { x: 0.1, y: 0.82 },
    portalPos: { x: 0.88, y: 0.15 },
    platforms: [
      { x: 0.5,  y: 0.92, w: 0.95, h: 0.022, angle: 0 },
      { x: 0.25, y: 0.68, w: 0.3,  h: 0.018, angle: 0 },
      { x: 0.25, y: 0.35, w: 0.018, h: 0.45,  angle: 0 }, // left wall
      { x: 0.6,  y: 0.55, w: 0.018, h: 0.5,   angle: 0 }, // mid wall
      { x: 0.75, y: 0.42, w: 0.22,  h: 0.018, angle: 0 },
      { x: 0.75, y: 0.28, w: 0.22,  h: 0.018, angle: 0 },
    ],
    fragments: [
      { x: 0.42, y: 0.62 },
      { x: 0.42, y: 0.42 },
      { x: 0.75, y: 0.35 },
      { x: 0.88, y: 0.42 },
      { x: 0.15, y: 0.62 },
    ],
    pegs: [
      { x: 0.42, y: 0.78 },
      { x: 0.55, y: 0.7 },
    ],
  },

  // ── LEVEL 4: Stacked blocks to demolish ──
  {
    title: 'LEVEL  04',
    orbStart: { x: 0.08, y: 0.82 },
    portalPos: { x: 0.88, y: 0.78 },
    platforms: [
      { x: 0.5,  y: 0.92, w: 0.95, h: 0.022, angle: 0 },
      { x: 0.15, y: 0.68, w: 0.2,  h: 0.018, angle: 0.05 },
    ],
    fragments: [
      { x: 0.72, y: 0.86 },
      { x: 0.88, y: 0.5  },
      { x: 0.5,  y: 0.3  },
      { x: 0.15, y: 0.62 },
      { x: 0.38, y: 0.55 },
    ],
    // Dynamic blocks (will be stacked towers)
    blocks: [
      { x: 0.55, y: 0.86, w: 0.06, h: 0.04 },
      { x: 0.55, y: 0.82, w: 0.06, h: 0.04 },
      { x: 0.55, y: 0.78, w: 0.06, h: 0.04 },
      { x: 0.65, y: 0.86, w: 0.04, h: 0.04 },
      { x: 0.65, y: 0.82, w: 0.04, h: 0.04 },
      { x: 0.65, y: 0.78, w: 0.04, h: 0.04 },
      { x: 0.6,  y: 0.74, w: 0.09, h: 0.03 },
    ],
    pegs: [
      { x: 0.3,  y: 0.62 },
      { x: 0.4,  y: 0.74 },
      { x: 0.35, y: 0.82 },
    ],
  },

  // ── LEVEL 5: Gauntlet ──
  {
    title: 'LEVEL  05',
    orbStart: { x: 0.08, y: 0.88 },
    portalPos: { x: 0.5, y: 0.08 },
    platforms: [
      { x: 0.5,  y: 0.94, w: 0.95, h: 0.022, angle: 0 },
      { x: 0.28, y: 0.78, w: 0.28, h: 0.016, angle: -0.08 },
      { x: 0.72, y: 0.65, w: 0.28, h: 0.016, angle: 0.08 },
      { x: 0.3,  y: 0.52, w: 0.28, h: 0.016, angle: -0.06 },
      { x: 0.7,  y: 0.38, w: 0.28, h: 0.016, angle: 0.06 },
      { x: 0.35, y: 0.25, w: 0.28, h: 0.016, angle: 0 },
      { x: 0.0,  y: 0.5,  w: 0.02, h: 1.0,   angle: 0 }, // left boundary
      { x: 1.0,  y: 0.5,  w: 0.02, h: 1.0,   angle: 0 }, // right boundary
    ],
    fragments: [
      { x: 0.28, y: 0.72 },
      { x: 0.72, y: 0.59 },
      { x: 0.3,  y: 0.46 },
      { x: 0.7,  y: 0.32 },
      { x: 0.35, y: 0.19 },
      { x: 0.65, y: 0.12 },
    ],
    blocks: [
      { x: 0.5,  y: 0.78, w: 0.04, h: 0.04 },
      { x: 0.5,  y: 0.74, w: 0.04, h: 0.04 },
      { x: 0.5,  y: 0.65, w: 0.04, h: 0.04 },
      { x: 0.5,  y: 0.61, w: 0.04, h: 0.04 },
    ],
    pegs: [
      { x: 0.5,  y: 0.86 },
      { x: 0.15, y: 0.65 },
      { x: 0.85, y: 0.52 },
      { x: 0.15, y: 0.38 },
      { x: 0.82, y: 0.25 },
    ],
  },
];

// ─────────────────────────────────────────────
//  INIT PHYSICS ENGINE
// ─────────────────────────────────────────────
function initEngine() {
  if (engine) {
    Runner.stop(runner);
    World.clear(world);
    Engine.clear(engine);
  }

  engine = Engine.create({
    gravity: { x: 0, y: 1.4 },
    positionIterations: 10,
    velocityIterations: 8,
  });
  world = engine.world;
  runner = Runner.create();
  Runner.run(runner, engine);

  // Collision events
  Events.on(engine, 'collisionStart', onCollision);
}

// ─────────────────────────────────────────────
//  LOAD LEVEL
// ─────────────────────────────────────────────
function loadLevel(idx) {
  // Reset state
  State.throws = 0;
  State.fragmentsCollected = 0;
  State.orbLaunched = false;
  State.levelComplete = false;
  State.isDragging = false;
  State.levelStartTime = Date.now();
  State.orb = null;
  bodies = [];
  fragments = [];
  portal = null;
  walls = [];

  resize();
  initEngine();

  const lvl = LEVELS[idx];
  State.totalFragments = lvl.fragments.length;

  // ── Invisible boundary walls ──
  const wt = 30;
  const bLeft   = Bodies.rectangle(-wt/2, H/2, wt, H * 2, { isStatic: true, label: 'wall' });
  const bRight  = Bodies.rectangle(W + wt/2, H/2, wt, H * 2, { isStatic: true, label: 'wall' });
  const bTop    = Bodies.rectangle(W/2, -wt/2, W * 2, wt, { isStatic: true, label: 'wall' });
  const bBottom = Bodies.rectangle(W/2, H + wt/2, W * 2, wt, { isStatic: true, label: 'wall' });
  World.add(world, [bLeft, bRight, bTop, bBottom]);
  walls = [bLeft, bRight, bTop, bBottom];

  // ── Platforms ──
  lvl.platforms.forEach(p => {
    const b = Bodies.rectangle(p.x * W, p.y * H, p.w * W, p.h * H, {
      isStatic: true,
      angle: p.angle || 0,
      restitution: 0.3,
      friction: 0.6,
      label: 'platform',
      render: { fillStyle: '#ffffff' },
    });
    World.add(world, b);
    bodies.push(b);
  });

  // ── Dynamic Blocks (if any) ──
  (lvl.blocks || []).forEach(bl => {
    const b = Bodies.rectangle(bl.x * W, bl.y * H, bl.w * W, bl.h * H, {
      restitution: 0.15,
      friction: 0.4,
      density: 0.002,
      label: 'block',
    });
    World.add(world, b);
    bodies.push(b);
  });

  // ── Pegs ──
  lvl.pegs.forEach(p => {
    const b = Bodies.circle(p.x * W, p.y * H, 9, {
      isStatic: true,
      restitution: 0.8,
      friction: 0.1,
      label: 'peg',
    });
    World.add(world, b);
    bodies.push(b);
  });

  // ── Fragments ──
  lvl.fragments.forEach((f, i) => {
    const b = Bodies.circle(f.x * W, f.y * H, 10, {
      isStatic: true,
      isSensor: true,
      label: `fragment_${i}`,
      collectedAt: null,
    });
    World.add(world, b);
    fragments.push(b);
    bodies.push(b);
  });

  // ── Portal ──
  portal = Bodies.circle(lvl.portalPos.x * W, lvl.portalPos.y * H, 22, {
    isStatic: true,
    isSensor: true,
    label: 'portal',
  });
  World.add(world, portal);

  // ── Orb (player projectile) ──
  spawnOrb(lvl.orbStart.x * W, lvl.orbStart.y * H);

  // Update UI
  updateHUD();
  updateFragmentPips();
}

function spawnOrb(x, y) {
  State.orb = Bodies.circle(x, y, 14, {
    restitution: 0.45,
    friction: 0.05,
    frictionAir: 0.008,
    density: 0.004,
    label: 'orb',
    isStatic: true,
  });
  World.add(world, State.orb);
  State.orbLaunched = false;
}

// ─────────────────────────────────────────────
//  COLLISION HANDLER
// ─────────────────────────────────────────────
function onCollision(event) {
  const pairs = event.pairs;
  pairs.forEach(pair => {
    const a = pair.bodyA, b = pair.bodyB;
    const labels = [a.label, b.label];

    // Orb vs fragment
    const orb = labels.includes('orb');
    const fragIdx = labels.findIndex(l => l.startsWith('fragment_'));

    if (orb && fragIdx !== -1) {
      const fragBody = labels[fragIdx] === a.label ? a : b;
      collectFragment(fragBody);
    }

    // Orb vs platform/block (sound)
    if (orb && (labels.includes('platform') || labels.includes('block') || labels.includes('peg'))) {
      const v = State.orb ? Vector.magnitude(State.orb.velocity) : 0;
      if (v > 2) sfxCollide();
    }

    // Orb vs portal
    if (orb && labels.includes('portal')) {
      if (State.fragmentsCollected >= State.totalFragments && !State.levelComplete) {
        triggerLevelComplete();
      }
    }
  });
}

function collectFragment(fragBody) {
  if (fragBody.collected) return;
  fragBody.collected = true;

  // Remove from physics
  World.remove(world, fragBody);
  fragments = fragments.filter(f => f !== fragBody);

  State.fragmentsCollected++;
  sfxCollect();
  updateFragmentPips();

  // Visual burst (handled in draw loop via particles)
  spawnParticles(fragBody.position.x, fragBody.position.y, 12);

  // HUD bump
  bumpValue('hud-score');
}

// ─────────────────────────────────────────────
//  PARTICLES
// ─────────────────────────────────────────────
let particles = [];

function spawnParticles(x, y, count) {
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
    const speed = 1.5 + Math.random() * 3;
    particles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 1.0,
      decay: 0.04 + Math.random() * 0.04,
      r: 1.5 + Math.random() * 2,
    });
  }
}

function updateParticles() {
  particles = particles.filter(p => p.life > 0);
  particles.forEach(p => {
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.08;
    p.life -= p.decay;
    p.vx *= 0.96;
    p.vy *= 0.96;
  });
}

function drawParticles() {
  particles.forEach(p => {
    ctx.save();
    ctx.globalAlpha = p.life * 0.9;
    ctx.fillStyle = '#ffffff';
    ctx.shadowBlur = 6;
    ctx.shadowColor = 'rgba(255,255,255,0.8)';
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r * p.life, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });
}

// ─────────────────────────────────────────────
//  DRAW LOOP
// ─────────────────────────────────────────────
let animFrame;
let portalPulse = 0;
let orbGlow = 0;
let time = 0;

function gameLoop() {
  animFrame = requestAnimationFrame(gameLoop);
  time++;
  portalPulse = (Math.sin(time * 0.05) + 1) / 2;
  orbGlow     = (Math.sin(time * 0.08) + 1) / 2;

  // Clear
  ctx.clearRect(0, 0, W, H);

  // Background grid (very subtle)
  drawGrid();

  // Platforms & blocks
  Composite.allBodies(world).forEach(body => {
    if (walls.includes(body)) return;
    if (body === State.orb) return;
    if (body === portal) return;
    if (body.isSensor) return;
    drawBody(body);
  });

  // Fragments
  fragments.forEach(f => drawFragment(f));

  // Portal
  if (portal) drawPortal();

  // Orb
  if (State.orb) drawOrb();

  // Trajectory preview
  if (State.isDragging && !State.orbLaunched) drawTrajectory();

  // Particles
  updateParticles();
  drawParticles();

  // HUD score (live)
  const elapsed = Math.floor((Date.now() - State.levelStartTime) / 1000);
  const liveScore = computeScore(State.throws, elapsed, State.fragmentsCollected);
  document.getElementById('hud-score').textContent = String(liveScore).padStart(4, '0');
  document.getElementById('hud-throws').textContent = String(State.throws).padStart(2, '0');
}

function drawGrid() {
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.022)';
  ctx.lineWidth = 1;
  const step = 50;
  for (let x = 0; x < W; x += step) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
  }
  for (let y = 0; y < H; y += step) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }
  ctx.restore();
}

function drawBody(body) {
  const verts = body.vertices;
  const isBlock = body.label === 'block';
  const isPeg   = body.label === 'peg';

  ctx.save();
  ctx.beginPath();

  if (isPeg) {
    ctx.arc(body.position.x, body.position.y, 9, 0, Math.PI * 2);
  } else {
    ctx.moveTo(verts[0].x, verts[0].y);
    for (let i = 1; i < verts.length; i++) ctx.lineTo(verts[i].x, verts[i].y);
    ctx.closePath();
  }

  ctx.fillStyle = isBlock ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.05)';
  ctx.strokeStyle = isBlock ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.35)';
  ctx.lineWidth = isBlock ? 1.5 : 1.5;
  ctx.fill();
  ctx.stroke();

  if (isPeg) {
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Peg center dot
    ctx.beginPath();
    ctx.arc(body.position.x, body.position.y, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fill();
  }

  ctx.restore();
}

function drawFragment(f) {
  const { x, y } = f.position;
  const wobble = Math.sin(time * 0.06 + f.id) * 2;

  ctx.save();
  ctx.translate(x, y + wobble);

  // Outer glow ring
  ctx.beginPath();
  ctx.arc(0, 0, 16, 0, Math.PI * 2);
  ctx.strokeStyle = `rgba(255,255,255,${0.08 + portalPulse * 0.08})`;
  ctx.lineWidth = 1;
  ctx.stroke();

  // Fragment diamond shape
  ctx.save();
  ctx.rotate(Math.PI / 4 + time * 0.01);
  ctx.beginPath();
  ctx.rect(-7, -7, 14, 14);
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  ctx.lineWidth = 1.5;
  ctx.shadowBlur = 12;
  ctx.shadowColor = 'rgba(255,255,255,0.6)';
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  // Center dot
  ctx.beginPath();
  ctx.arc(0, 0, 2.5, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.shadowBlur = 8;
  ctx.shadowColor = '#ffffff';
  ctx.fill();

  ctx.restore();
}

function drawPortal() {
  const { x, y } = portal.position;
  const allCollected = State.fragmentsCollected >= State.totalFragments;
  const alpha = allCollected ? 1 : 0.25;
  const pulseR = 22 + portalPulse * (allCollected ? 8 : 3);

  ctx.save();
  ctx.translate(x, y);

  // Outer rotating ring
  ctx.save();
  ctx.rotate(time * 0.012);
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI * 2 * i) / 6;
    const px = Math.cos(a) * pulseR;
    const py = Math.sin(a) * pulseR;
    ctx.beginPath();
    ctx.arc(px, py, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255,255,255,${alpha * 0.5})`;
    ctx.fill();
  }
  ctx.restore();

  // Inner ring
  ctx.save();
  ctx.rotate(-time * 0.02);
  ctx.beginPath();
  ctx.arc(0, 0, 18, 0, Math.PI * 2);
  ctx.strokeStyle = `rgba(255,255,255,${alpha * 0.8})`;
  ctx.lineWidth = allCollected ? 2 : 1;
  ctx.shadowBlur = allCollected ? 20 : 6;
  ctx.shadowColor = 'rgba(255,255,255,0.8)';
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(0, 0, 10, 0, Math.PI * 2);
  ctx.strokeStyle = `rgba(255,255,255,${alpha * 0.4})`;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();

  // Core
  ctx.beginPath();
  ctx.arc(0, 0, 5, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(255,255,255,${alpha})`;
  ctx.shadowBlur = allCollected ? 30 : 8;
  ctx.shadowColor = 'rgba(255,255,255,1)';
  ctx.fill();

  // Label
  ctx.font = '600 9px "DM Mono", monospace';
  ctx.fillStyle = `rgba(255,255,255,${alpha * 0.6})`;
  ctx.textAlign = 'center';
  ctx.shadowBlur = 0;
  ctx.fillText(allCollected ? '◈ EXIT' : '◈ LOCKED', 0, 38);

  ctx.restore();
}

function drawOrb() {
  const { x, y } = State.orb.position;
  const vel = State.orb.velocity;
  const speed = Vector.magnitude(vel);

  ctx.save();
  ctx.translate(x, y);

  // Motion trail (if moving fast)
  if (speed > 3 && State.orbLaunched) {
    const trailLen = Math.min(speed * 2, 20);
    const nx = vel.x / speed, ny = vel.y / speed;
    for (let i = 1; i <= 6; i++) {
      const t = i / 6;
      ctx.beginPath();
      ctx.arc(-nx * trailLen * t, -ny * trailLen * t, 14 * (1 - t * 0.8), 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,255,255,${0.04 * (1 - t)})`;
      ctx.fill();
    }
  }

  // Outer glow
  ctx.beginPath();
  ctx.arc(0, 0, 20 + orbGlow * 4, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.04)';
  ctx.fill();

  // Main orb
  ctx.beginPath();
  ctx.arc(0, 0, 14, 0, Math.PI * 2);
  const grad = ctx.createRadialGradient(-4, -4, 0, 0, 0, 14);
  grad.addColorStop(0, 'rgba(255,255,255,0.95)');
  grad.addColorStop(0.5, 'rgba(200,200,200,0.85)');
  grad.addColorStop(1, 'rgba(120,120,120,0.7)');
  ctx.fillStyle = grad;
  ctx.shadowBlur = 20 + orbGlow * 15;
  ctx.shadowColor = 'rgba(255,255,255,0.8)';
  ctx.fill();

  // Specular highlight
  ctx.beginPath();
  ctx.arc(-4, -4, 4, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.shadowBlur = 0;
  ctx.fill();

  // Cross-hair reticle (when stationary)
  if (!State.orbLaunched) {
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-20, 0); ctx.lineTo(20, 0); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -20); ctx.lineTo(0, 20); ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, 18, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.stroke();
  }

  ctx.restore();
}

function drawTrajectory() {
  const dx = State.dragStart.x - State.dragCurrent.x;
  const dy = State.dragStart.y - State.dragCurrent.y;
  const forceMag = Math.min(Math.sqrt(dx * dx + dy * dy), 200);
  if (forceMag < 5) return;

  const fx = (dx / 200) * 0.045;
  const fy = (dy / 200) * 0.045;

  const mass = State.orb.mass;
  const vx = (fx / mass) * 60;
  const vy = (fy / mass) * 60;

  let sx = State.orb.position.x;
  let sy = State.orb.position.y;
  let svx = vx;
  let svy = vy;
  const grav = 1.4 * 0.001 * 60 * 60 * 0.1;

  ctx.save();
  ctx.setLineDash([4, 6]);
  ctx.lineWidth = 1;

  const steps = 40;
  for (let i = 0; i < steps; i++) {
    const alpha = (1 - i / steps) * 0.6;
    const r = 3 * (1 - i / steps);

    ctx.beginPath();
    ctx.arc(sx, sy, Math.max(r, 1), 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255,255,255,${alpha})`;
    ctx.shadowBlur = r * 3;
    ctx.shadowColor = `rgba(255,255,255,${alpha})`;
    ctx.fill();

    sx  += svx * 0.6;
    sy  += svy * 0.6;
    svy += grav;
    svx *= 0.995;
    svy *= 0.995;
  }
  ctx.restore();

  // Draw force arrow from orb to drag point (inverted for throw direction)
  const orbX = State.orb.position.x;
  const orbY = State.orb.position.y;
  const power = forceMag / 200;

  ctx.save();
  ctx.strokeStyle = `rgba(255,255,255,${0.15 + power * 0.2})`;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(orbX, orbY);
  ctx.lineTo(State.dragCurrent.x, State.dragCurrent.y);
  ctx.stroke();

  // Power indicator
  ctx.font = '10px "DM Mono", monospace';
  ctx.fillStyle = `rgba(255,255,255,${0.4 + power * 0.4})`;
  ctx.textAlign = 'center';
  ctx.fillText(`${Math.round(power * 100)}%`, State.dragCurrent.x, State.dragCurrent.y - 20);
  ctx.restore();
}

// ─────────────────────────────────────────────
//  INPUT HANDLING
// ─────────────────────────────────────────────
function getEventPos(e) {
  const rect = canvas.getBoundingClientRect();
  const src = e.touches ? e.touches[0] : e;
  return {
    x: src.clientX - rect.left,
    y: src.clientY - rect.top,
  };
}

function onPointerDown(e) {
  if (State.orbLaunched || State.levelComplete || !State.orb) return;
  e.preventDefault();

  const pos = getEventPos(e);
  const dx = pos.x - State.orb.position.x;
  const dy = pos.y - State.orb.position.y;
  const dist = Math.sqrt(dx * dx + dy * dy);

  // Only start drag if clicking near orb (generous 60px radius)
  if (dist > 60) return;

  State.isDragging = true;
  State.dragStart = { ...pos };
  State.dragCurrent = { ...pos };
  canvas.style.cursor = 'grabbing';
}

function onPointerMove(e) {
  if (!State.isDragging) return;
  e.preventDefault();
  State.dragCurrent = getEventPos(e);
}

function onPointerUp(e) {
  if (!State.isDragging) return;
  e.preventDefault();
  State.isDragging = false;
  canvas.style.cursor = 'crosshair';

  const dx = State.dragStart.x - State.dragCurrent.x;
  const dy = State.dragStart.y - State.dragCurrent.y;
  const forceMag = Math.sqrt(dx * dx + dy * dy);

  if (forceMag < 8) return; // ignore micro-drags

  // Launch orb
  Body.setStatic(State.orb, false);
  State.orbLaunched = true;
  State.throws++;

  const forceScale = Math.min(forceMag / 200, 1) * 0.045;
  const fx = (dx / forceMag) * forceScale;
  const fy = (dy / forceMag) * forceScale;
  Body.applyForce(State.orb, State.orb.position, { x: fx, y: fy });

  sfxLaunch();
  updateHUD();

  // After orb settles or goes off-screen, reset orb
  checkOrbSettle();
}

function checkOrbSettle() {
  let checkCount = 0;
  const interval = setInterval(() => {
    if (!State.orb || State.levelComplete) { clearInterval(interval); return; }
    checkCount++;

    const vel = Vector.magnitude(State.orb.velocity);
    const pos = State.orb.position;
    const outOfBounds = pos.x < -50 || pos.x > W + 50 || pos.y > H + 100 || pos.y < -200;

    if ((vel < 0.4 && checkCount > 30) || outOfBounds) {
      clearInterval(interval);
      if (!State.levelComplete) resetOrb();
    }

    if (checkCount > 400) { clearInterval(interval); if (!State.levelComplete) resetOrb(); }
  }, 50);
}

function resetOrb() {
  if (!State.orb) return;
  World.remove(world, State.orb);
  const lvl = LEVELS[State.currentLevel];
  spawnOrb(lvl.orbStart.x * W, lvl.orbStart.y * H);
  sfxReset();
}

// ─────────────────────────────────────────────
//  LEVEL COMPLETE
// ─────────────────────────────────────────────
function triggerLevelComplete() {
  if (State.levelComplete) return;
  State.levelComplete = true;

  sfxComplete();
  spawnParticles(portal.position.x, portal.position.y, 30);

  const elapsed = Math.floor((Date.now() - State.levelStartTime) / 1000);
  const score = computeScore(State.throws, elapsed, State.fragmentsCollected);
  State.totalScore += score;

  setTimeout(() => {
    document.getElementById('stat-throws').textContent = State.throws;
    document.getElementById('stat-time').textContent = `${elapsed}s`;
    document.getElementById('stat-score').textContent = String(score).padStart(4, '0');

    cancelAnimationFrame(animFrame);
    showScreen('complete-screen');

    // Is last level?
    const isLast = State.currentLevel >= LEVELS.length - 1;
    document.getElementById('next-btn').textContent = isLast ? 'FINISH →' : 'NEXT LEVEL →';
    document.getElementById('next-btn').onclick = isLast ? showEndScreen : nextLevel;
  }, 1200);
}

function computeScore(throws, seconds, fragments) {
  const base = fragments * 100;
  const throwPenalty = (throws - 1) * 15;
  const timePenalty  = Math.floor(seconds / 10) * 5;
  return Math.max(base - throwPenalty - timePenalty, fragments * 20);
}

function nextLevel() {
  State.currentLevel++;
  if (State.currentLevel >= LEVELS.length) { showEndScreen(); return; }
  showScreen('game-screen');
  runLevelTransition(LEVELS[State.currentLevel].title, () => {
    loadLevel(State.currentLevel);
    startGameLoop();
  });
}

function showEndScreen() {
  document.getElementById('final-score').textContent = String(State.totalScore).padStart(5, '0');
  showScreen('gameover-screen');
}

// ─────────────────────────────────────────────
//  LEVEL TRANSITION ANIMATION
// ─────────────────────────────────────────────
function runLevelTransition(title, cb) {
  let el = document.getElementById('level-transition');
  if (!el) {
    el = document.createElement('div');
    el.id = 'level-transition';
    document.body.appendChild(el);
  }
  el.textContent = title;
  el.style.transition = 'none';
  el.style.opacity = '0';
  el.style.display = 'flex';

  requestAnimationFrame(() => {
    el.style.transition = 'opacity 0.4s ease';
    el.style.opacity = '1';

    setTimeout(() => {
      cb && cb();
      setTimeout(() => {
        el.style.opacity = '0';
        setTimeout(() => { el.style.display = 'none'; }, 400);
      }, 600);
    }, 600);
  });
}

// ─────────────────────────────────────────────
//  UI HELPERS
// ─────────────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function updateHUD() {
  document.getElementById('hud-level').textContent = String(State.currentLevel + 1).padStart(2, '0');
  document.getElementById('hud-throws').textContent = String(State.throws).padStart(2, '0');
}

function updateFragmentPips() {
  const container = document.getElementById('fragment-pips');
  container.innerHTML = '';
  for (let i = 0; i < State.totalFragments; i++) {
    const pip = document.createElement('div');
    pip.className = 'pip' + (i < State.fragmentsCollected ? ' collected' : '');
    container.appendChild(pip);
  }
}

function bumpValue(id) {
  const el = document.getElementById(id);
  el.classList.remove('bump');
  void el.offsetWidth;
  el.classList.add('bump');
  setTimeout(() => el.classList.remove('bump'), 300);
}

// ─────────────────────────────────────────────
//  GAME LOOP
// ─────────────────────────────────────────────
function startGameLoop() {
  cancelAnimationFrame(animFrame);
  gameLoop();
}

// ─────────────────────────────────────────────
//  BUTTON WIRING
// ─────────────────────────────────────────────
document.getElementById('start-btn').onclick = () => {
  initAudio();
  State.currentLevel = 0;
  State.totalScore = 0;
  showScreen('game-screen');
  runLevelTransition(LEVELS[0].title, () => {
    loadLevel(0);
    startGameLoop();
  });
};

document.getElementById('restart-btn').onclick = () => {
  initAudio();
  cancelAnimationFrame(animFrame);
  sfxReset();
  loadLevel(State.currentLevel);
  startGameLoop();
};

document.getElementById('menu-btn').onclick = () => {
  cancelAnimationFrame(animFrame);
  showScreen('start-screen');
};

document.getElementById('retry-btn').onclick = () => {
  showScreen('game-screen');
  runLevelTransition(LEVELS[State.currentLevel].title, () => {
    loadLevel(State.currentLevel);
    startGameLoop();
  });
};

document.getElementById('playagain-btn').onclick = () => {
  State.currentLevel = 0;
  State.totalScore = 0;
  showScreen('game-screen');
  runLevelTransition(LEVELS[0].title, () => {
    loadLevel(0);
    startGameLoop();
  });
};

// ─────────────────────────────────────────────
//  EVENT LISTENERS
// ─────────────────────────────────────────────
canvas.addEventListener('mousedown', onPointerDown);
canvas.addEventListener('mousemove', onPointerMove);
canvas.addEventListener('mouseup', onPointerUp);
canvas.addEventListener('touchstart', onPointerDown, { passive: false });
canvas.addEventListener('touchmove', onPointerMove, { passive: false });
canvas.addEventListener('touchend', onPointerUp, { passive: false });

window.addEventListener('resize', () => {
  resize();
  // Reload level to recompute positions
  if (document.getElementById('game-screen').classList.contains('active')) {
    cancelAnimationFrame(animFrame);
    loadLevel(State.currentLevel);
    startGameLoop();
  }
});

// ─────────────────────────────────────────────
//  INITIAL RENDER
// ─────────────────────────────────────────────
resize();
showScreen('start-screen');

// Animate start screen canvas background (subtle orb drift)
(function startBg() {
  const bgCanvas = document.createElement('canvas');
  bgCanvas.style.cssText = `
    position:fixed;inset:0;z-index:0;pointer-events:none;opacity:0.5;
  `;
  document.getElementById('start-screen').prepend(bgCanvas);

  function resizeBg() {
    bgCanvas.width = window.innerWidth;
    bgCanvas.height = window.innerHeight;
  }
  resizeBg();
  window.addEventListener('resize', resizeBg);

  const bCtx = bgCanvas.getContext('2d');
  let bt = 0;
  const orbs = Array.from({ length: 5 }, () => ({
    x: Math.random() * window.innerWidth,
    y: Math.random() * window.innerHeight,
    vx: (Math.random() - 0.5) * 0.3,
    vy: (Math.random() - 0.5) * 0.3,
    r: 30 + Math.random() * 60,
  }));

  function bgLoop() {
    bt++;
    bCtx.clearRect(0, 0, bgCanvas.width, bgCanvas.height);
    orbs.forEach(o => {
      o.x += o.vx; o.y += o.vy;
      if (o.x < -o.r) o.x = bgCanvas.width + o.r;
      if (o.x > bgCanvas.width + o.r) o.x = -o.r;
      if (o.y < -o.r) o.y = bgCanvas.height + o.r;
      if (o.y > bgCanvas.height + o.r) o.y = -o.r;

      bCtx.beginPath();
      bCtx.arc(o.x, o.y, o.r, 0, Math.PI * 2);
      bCtx.fillStyle = 'rgba(255,255,255,0.018)';
      bCtx.fill();
    });
    requestAnimationFrame(bgLoop);
  }
  bgLoop();
})();