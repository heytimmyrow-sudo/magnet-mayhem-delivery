import { expansionRegistry } from "./expansions/expansion-registry.js";
import { exportSave, hasBackupSave, importSaveFile, loadSave, recordLevelResult, resetSave, restoreBackupSave, saveProgress } from "./save-system.js";

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const canvas = $("#gameCanvas");
const ctx = canvas.getContext("2d");
const W = canvas.width;
const H = canvas.height;
const G = 1650;
const PLAYER_SPEED = 330;
const JUMP_SPEED = 610;
const MAGNET_DRAG = .992;
const MAGNET_FORCE_MULT = 1.85;
const MAGNET_OBJECT_SPEED_CAP = 1080;
const MAGNET_IMPULSE_SPEED_CAP = 1220;
const MAGNET_IMPULSE_MULT = .72;
const PICKUP_COOLDOWN = .22;
const THROW_HOLD_TIME = .72;
const THROW_CHARGE_THRESHOLD = .16;
const keys = new Set();
const heldTouch = new Set();
const effects = [];
let save = loadSave();
let game = null;
let lastFrame = 0;
let audioCtx = null;
let musicTimer = null;
let frameRequest = 0;

const screens = ["titleScreen", "menuScreen", "packsScreen", "gameScreen"];
const colors = {
  steel: "#5c6b7e",
  dark: "#172033",
  red: "#ff566d",
  blue: "#4db7ff",
  yellow: "#ffd257",
  green: "#5ee098",
  lava: "#ff8c48"
};

const TUTORIALS = {
  training_pickup: [
    { id: "move", text: "Move to the package.", key: "A / D", test: (g) => g.player.x > g.level.spawn.x + 54 },
    { id: "pickup", text: "Press E to pick up the package.", key: "E", test: (g) => g.player.carry },
    { id: "carry", text: "Carry the package to the green SHIP chute.", key: "D", test: (g) => rects(g.player, g.level.delivery) || g.player.x > g.level.delivery.x - 90 },
    { id: "deliver", text: "Enter the chute with both robot and package.", key: "SHIP", test: (g) => rects(g.player, g.level.delivery) && rects(g.package, g.level.delivery) }
  ],
  first_flip: [
    { id: "drop", text: "Drop the package near the magnet.", key: "E", test: (g) => !g.player.carry && nearAnyMagnet(g.package, 235) },
    { id: "flip", text: "Press F to flip polarity.", key: "F", test: (g) => g.didFlip },
    { id: "watch", text: "Watch PUSH become PULL and follow the arrow.", key: "PUSH/PULL", test: (g) => g.package.x > 385 || g.package.vx > 120 },
    { id: "deliver", text: "Deliver both robot and package.", key: "SHIP", test: (g) => rects(g.player, g.level.delivery) && rects(g.package, g.level.delivery) }
  ]
};

function makeGame(expansionId = "base_game", levelIndex = 0) {
  const expansion = expansionRegistry.find((pack) => pack.id === expansionId) || expansionRegistry[0];
  const level = expansion.levels[levelIndex] || expansion.levels[0];
  const packageBody = body(level.package.x, level.package.y, 34, 34, true);
  return {
    expansion,
    level,
    levelIndex,
    mode: "playing",
    elapsed: 0,
    polarity: 1,
    shake: 0,
    flipFlash: 0,
    flipCooldown: 0,
    completionTimer: 0,
    restartTimer: 0,
    didFlip: false,
    result: null,
    failQueued: false,
    player: { ...body(level.spawn.x, level.spawn.y, 32, 42, false), speed: 0, grounded: false, coyote: 0, jumpBuffer: 0, facing: 1, carry: false, squash: 0, pickupCooldown: 0, holdPickup: false, pickupStartedCarrying: false, throwCharge: 0 },
    package: { ...packageBody, health: 3, carried: false, hitCooldown: 0, wobble: 0, pickupCooldown: 0, lastCarried: false },
    platforms: (level.platforms || []).map((p) => ({ ...p, baseX: p.x, baseY: p.y, targetX: p.x, targetY: p.y })),
    doors: (level.doors || []).map((d) => ({ ...d, open: false })),
    boxes: (level.boxes || []).map((b) => ({ ...body(b.x, b.y, b.w, b.h, true), startX: b.x, startY: b.y })),
    hazards: [...(level.hazards || []), ...(level.movingHazards || [])].map((h) => ({ ...h, baseX: h.x, baseY: h.y, t: Math.random() * 3 })),
    plates: (level.plates || []).map((p) => ({ ...p, pressed: false })),
    message: level.hint || "Deliver the robot and package to the green chute.",
    messageTimer: 7,
    tip: "",
    tutorial: makeTutorial(level.id)
  };
}

function makeTutorial(levelId) {
  const steps = TUTORIALS[levelId];
  if (!steps || save.tutorial.skipped || save.tutorial.completed[levelId]) return null;
  return { levelId, steps, index: 0, pulse: 0 };
}

function body(x, y, w, h, magnetic) {
  return { x, y, w, h, vx: 0, vy: 0, magnetic, magnetFxCooldown: 0, startX: x, startY: y };
}

function showScreen(id) {
  screens.forEach((screen) => $(`#${screen}`).classList.toggle("hidden", screen !== id));
  $("#overlay").classList.add("hidden");
  $("#settingsPanel").classList.add("hidden");
  if (id !== "gameScreen") game = null;
  renderMenus();
  updateTutorialUi();
}

function startLevel(expansionId, index) {
  game = makeGame(expansionId, index);
  lastFrame = 0;
  showScreen("gameScreen");
  updateHud();
  updateTutorialUi();
  ping(220, .04, "square");
  if (!frameRequest) frameRequest = requestAnimationFrame(loop);
}

function loop(now) {
  if (!game) {
    frameRequest = 0;
    return;
  }
  const dt = Math.min(.033, (now - (lastFrame || now)) / 1000);
  lastFrame = now;
  if (game.mode === "playing") update(dt);
  draw();
  frameRequest = requestAnimationFrame(loop);
}

function update(dt) {
  game.elapsed += dt;
  game.flipFlash = Math.max(0, game.flipFlash - dt * 2.6);
  game.flipCooldown = Math.max(0, game.flipCooldown - dt);
  game.shake = Math.max(0, game.shake - dt * 14);
  game.messageTimer = Math.max(0, game.messageTimer - dt);
  game.package.hitCooldown = Math.max(0, game.package.hitCooldown - dt);
  game.package.magnetFxCooldown = Math.max(0, game.package.magnetFxCooldown - dt);
  game.package.pickupCooldown = Math.max(0, game.package.pickupCooldown - dt);
  game.player.pickupCooldown = Math.max(0, game.player.pickupCooldown - dt);
  updatePlates();
  updateDoorsAndPlatforms(dt);
  updateHazards(dt);
  updatePlayer(dt);
  updatePackage(dt);
  game.boxes.forEach((box) => {
    box.magnetFxCooldown = Math.max(0, box.magnetFxCooldown - dt);
    applyMagnetism(box, dt, .8);
    moveBody(box, dt, solids());
    box.vx *= .985;
  });
  checkHazards();
  checkDelivery(dt);
  updateTutorial(dt);
  updateTip();
  updateHud();
  for (let i = effects.length - 1; i >= 0; i--) {
    effects[i].life -= dt;
    if (effects[i].life <= 0) effects.splice(i, 1);
  }
}

function updatePlayer(dt) {
  const p = game.player;
  const left = keys.has("arrowleft") || keys.has("a") || heldTouch.has("left");
  const right = keys.has("arrowright") || keys.has("d") || heldTouch.has("right");
  const dir = (right ? 1 : 0) - (left ? 1 : 0);
  if (dir) p.facing = dir;
  const target = dir * PLAYER_SPEED;
  p.vx += (target - p.vx) * Math.min(1, dt * (dir ? 16 : 10));
  p.vy += G * dt;
  applyRobotMagnetism(dt);
  p.coyote = p.grounded ? .1 : Math.max(0, p.coyote - dt);
  p.jumpBuffer = Math.max(0, p.jumpBuffer - dt);
  if (p.holdPickup && p.carry && p.pickupStartedCarrying) p.throwCharge = Math.min(1, p.throwCharge + dt / THROW_HOLD_TIME);
  if (p.jumpBuffer && p.coyote) {
    p.vy = -JUMP_SPEED;
    p.grounded = false;
    p.coyote = 0;
    p.jumpBuffer = 0;
    p.squash = .18;
    burst(p.x + p.w / 2, p.y + p.h, "#d8e8ff", 8);
    ping(420, .035, "triangle");
  }
  p.squash = Math.max(0, p.squash - dt);
  moveBody(p, dt, solids());
  if (p.carry) {
    const pack = game.package;
    pack.carried = true;
    pack.x += ((p.x + p.w / 2 + p.facing * 26) - (pack.x + pack.w / 2)) * .55;
    pack.y += ((p.y + 9) - pack.y) * .55;
    pack.vx = p.vx + p.facing * 38;
    pack.vy = p.vy * .35;
    pack.wobble += dt * 12;
  }
}

function applyRobotMagnetism(dt) {
  const p = game.player;
  const weight = p.carry ? .24 : .09;
  for (const m of game.level.magnets || []) {
    const cx = p.x + p.w / 2;
    const cy = p.y + p.h / 2;
    const dx = m.x - cx;
    const dy = m.y - cy;
    const dist = Math.max(36, Math.hypot(dx, dy));
    if (dist > Math.min(150, m.r * .42)) continue;
    const same = game.polarity === m.polarity;
    const falloff = 1 - dist / Math.min(150, m.r * .42);
    const force = (same ? -1 : 1) * m.strength * falloff * weight;
    p.vx += (dx / dist) * force * dt;
    p.vy += (dy / dist) * force * dt * .45;
    p.vx = clamp(p.vx, -430, 430);
    p.vy = clamp(p.vy, -720, 720);
  }
}

function updatePackage(dt) {
  const pack = game.package;
  if (pack.carried) return;
  applyMagnetism(pack, dt, 1);
  pack.vy += G * dt;
  const fallSpeed = pack.vy;
  moveBody(pack, dt, solids().concat(game.boxes));
  if (pack.grounded) pack.vx *= .91;
  else pack.vx *= MAGNET_DRAG;
  if (fallSpeed > 1240 && pack.grounded) damagePackage("hard impact");
  pack.wobble += Math.abs(pack.vx) * dt * .03;
}

function moveBody(entity, dt, solidList) {
  const wasGrounded = entity.grounded;
  const enteringVy = entity.vy;
  entity.grounded = false;
  entity.x += entity.vx * dt;
  for (const s of solidList) {
    if (!s || s.open || !rects(entity, s)) continue;
    if (entity.vx > 0) entity.x = s.x - entity.w;
    if (entity.vx < 0) entity.x = s.x + s.w;
    entity.vx = 0;
  }
  entity.y += entity.vy * dt;
  for (const s of solidList) {
    if (!s || s.open || !rects(entity, s)) continue;
    if (entity.vy > 0) {
      entity.y = s.y - entity.h;
      entity.grounded = true;
      if (entity === game.player) {
        entity.coyote = .1;
        if (!wasGrounded && enteringVy > 80) burst(entity.x + entity.w / 2, entity.y + entity.h, "#b9c7d8", 7);
      }
    }
    if (entity.vy < 0) entity.y = s.y + s.h;
    entity.vy = 0;
  }
  entity.x = clamp(entity.x, 20, W - entity.w - 20);
  if (entity.y > H + 80) handleFallout(entity);
}

function handleFallout(entity) {
  if (entity === game.player) {
    failLevel("The robot fell out of the delivery lane.");
    return;
  }
  if (entity === game.package) {
    failLevel("The package fell out of the delivery lane.");
    return;
  }
  if (game.boxes.includes(entity)) resetBox(entity);
}

function resetBox(box) {
  box.x = box.startX;
  box.y = box.startY;
  box.vx = 0;
  box.vy = 0;
  box.grounded = false;
  box.magnetFxCooldown = .2;
}

function solids() {
  return [...(game.level.walls || []), ...game.platforms, ...game.doors.filter((d) => !d.open)];
}

function updateDoorsAndPlatforms(dt) {
  game.doors.forEach((door) => {
    if (typeof door.openPolarity === "string") door.open = game.plates.some((p) => p.id === door.openPolarity && p.pressed);
    else door.open = game.polarity === door.openPolarity;
  });
  game.platforms.forEach((p) => {
    const active = game.polarity === p.polarity ? 1 : 0;
    p.targetX = p.baseX + p.dx * active;
    p.targetY = p.baseY + p.dy * active;
    p.x += (p.targetX - p.x) * Math.min(1, dt * 4.5);
    p.y += (p.targetY - p.y) * Math.min(1, dt * 4.5);
  });
}

function updatePlates() {
  game.plates.forEach((plate) => {
    plate.pressed = [game.player, game.package, ...game.boxes].some((b) => rects(b, { ...plate, y: plate.y - 8, h: 20 }));
  });
}

function updateHazards(dt) {
  game.hazards.forEach((h) => {
    h.t += dt * (h.speed || 1);
    if (h.type === "crusher") {
      const offset = Math.sin(h.t * Math.PI) * h.distance;
      h.x = h.baseX + (h.axis === "x" ? offset : 0);
      h.y = h.baseY + (h.axis === "y" ? offset : 0);
    }
  });
}

function applyMagnetism(entity, dt, weight) {
  if (!entity.magnetic) return;
  for (const m of game.level.magnets || []) {
    const ex = entity.x + entity.w / 2;
    const ey = entity.y + entity.h / 2;
    const dx = m.x - ex;
    const dy = m.y - ey;
    const dist = Math.max(32, Math.hypot(dx, dy));
    if (dist > m.r) continue;
    const same = game.polarity === m.polarity;
    const falloff = magnetFalloff(dist, m.r);
    const force = (same ? -1 : 1) * m.strength * MAGNET_FORCE_MULT * falloff * weight;
    entity.vx += (dx / dist) * force * dt;
    entity.vy += (dy / dist) * force * dt * .78;
    entity.vx = clamp(entity.vx, -MAGNET_OBJECT_SPEED_CAP, MAGNET_OBJECT_SPEED_CAP);
    entity.vy = clamp(entity.vy, -MAGNET_OBJECT_SPEED_CAP, MAGNET_OBJECT_SPEED_CAP);
    if (Math.random() < .44) effects.push({ x: ex, y: ey, vx: (same ? -dx : dx) / dist * 130 + (Math.random() - .5) * 60, vy: (same ? -dy : dy) / dist * 105, color: same ? colors.red : colors.blue, life: .42, r: 2.6 });
    if (Math.abs(force) > 1200 && entity.magnetFxCooldown <= 0) {
      entity.magnetFxCooldown = .18;
      burst(ex, ey, same ? colors.red : colors.blue, 7);
      effects.push({ x: ex, y: ey, vx: (same ? -dx : dx) / dist * 180, vy: (same ? -dy : dy) / dist * 160, color: same ? colors.red : colors.blue, life: .28, r: 7 });
    }
  }
}

function magnetFalloff(dist, range) {
  const proximity = clamp(1 - dist / range, 0, 1);
  return .14 + Math.pow(proximity, 1.7) * 1.75;
}

function polarityImpulse() {
  const targets = [game.package, ...game.boxes].filter((item) => item.magnetic && !item.carried);
  targets.forEach((entity) => {
    for (const m of game.level.magnets || []) {
      const ex = entity.x + entity.w / 2;
      const ey = entity.y + entity.h / 2;
      const dx = m.x - ex;
      const dy = m.y - ey;
      const dist = Math.max(30, Math.hypot(dx, dy));
      if (dist > m.r + 80) continue;
      const same = game.polarity === m.polarity;
      const proximity = clamp(1 - Math.min(dist, m.r) / (m.r + 1), 0, 1);
      const amount = (same ? -1 : 1) * Math.max(320, m.strength * MAGNET_IMPULSE_MULT * (.5 + Math.pow(proximity, 1.45)));
      entity.vx += (dx / dist) * amount;
      entity.vy += (dy / dist) * amount * .72;
      entity.vx = clamp(entity.vx, -MAGNET_IMPULSE_SPEED_CAP, MAGNET_IMPULSE_SPEED_CAP);
      entity.vy = clamp(entity.vy, -MAGNET_IMPULSE_SPEED_CAP, MAGNET_IMPULSE_SPEED_CAP);
      burst(entity.x + entity.w / 2, entity.y + entity.h / 2, same ? colors.red : colors.blue, 18);
    }
  });
}

function updateTip() {
  const p = game.player;
  const pack = game.package;
  const nearPackage = Math.hypot((p.x + p.w / 2) - (pack.x + pack.w / 2), (p.y + p.h / 2) - (pack.y + pack.h / 2)) < 74;
  if (!p.carry && nearPackage) game.tip = "Press E to pick up";
  else if (p.carry) game.tip = "Press E to toss or drop";
  else if ((game.level.magnets || []).length) game.tip = "Press F to flip polarity";
  else game.tip = "Reach the green SHIP chute";
}

function updateTutorial(dt) {
  if (!game.tutorial) {
    updateTutorialUi();
    return;
  }
  game.tutorial.pulse += dt;
  const step = currentTutorialStep();
  if (step?.test(game)) {
    game.tutorial.index += 1;
    burst(game.player.x + game.player.w / 2, game.player.y, colors.green, 12);
    ping(620, .035, "sine");
    if (game.tutorial.index >= game.tutorial.steps.length) {
      save.tutorial.completed[game.tutorial.levelId] = true;
      saveProgress(save);
      game.tutorial = null;
    }
  }
  updateTutorialUi();
}

function currentTutorialStep() {
  return game.tutorial?.steps[game.tutorial.index] || null;
}

function skipTutorial() {
  if (!game?.tutorial) return;
  save.tutorial.skipped = true;
  save.tutorial.completed[game.tutorial.levelId] = true;
  saveProgress(save);
  game.tutorial = null;
  updateTutorialUi();
}

function updateTutorialUi() {
  const step = game?.tutorial ? currentTutorialStep() : null;
  $("#skipTutorialBtn").classList.toggle("hidden", !step);
  $$("[data-touch]").forEach((button) => button.classList.toggle("tutorial-highlight", step && touchMatchesStep(button.dataset.touch, step.key)));
}

function touchMatchesStep(touch, key) {
  if (key.includes("A") || key === "D") return touch === "left" || touch === "right";
  if (key === "E") return touch === "pickup";
  if (key === "F") return touch === "flip";
  return false;
}

function nearAnyMagnet(entity, distance) {
  const cx = entity.x + entity.w / 2;
  const cy = entity.y + entity.h / 2;
  return (game.level.magnets || []).some((m) => Math.hypot(m.x - cx, m.y - cy) <= distance);
}

function checkHazards() {
  for (const h of game.hazards) {
    const active = h.activePolarity == null || h.activePolarity === game.polarity;
    if (!active) continue;
    if (h.type === "spikes" || h.type === "electric" || h.type === "crusher") {
      if (rects(game.player, h)) failLevel("The robot got scrambled.");
      if (rects(game.package, h)) damagePackage(h.type);
      game.boxes.forEach((box) => { if (rects(box, h) && h.type !== "electric") box.vx *= -1; });
    }
  }
}

function checkDelivery(dt) {
  const zone = game.level.delivery;
  const ok = rects(game.player, zone) && rects(game.package, zone);
  game.completionTimer = ok ? game.completionTimer + dt : 0;
  if (game.completionTimer > .35) completeLevel();
}

function completeLevel() {
  if (game.mode !== "playing") return;
  game.mode = "complete";
  const result = recordLevelResult(save, game.expansion.id, game.level.id, game.elapsed, game.package.health, game.level.targetTime);
  save.tutorial.completed[game.level.id] = true;
  saveProgress(save);
  game.result = result;
  burst(game.level.delivery.x + game.level.delivery.w / 2, game.level.delivery.y, colors.yellow, 30);
  ping(660, .08, "sine");
  showLevelComplete(result);
}

function showLevelComplete(result) {
  const isFinal = game.levelIndex === game.expansion.levels.length - 1;
  const previous = result.previousBest ? `${result.previousBest.toFixed(1)}s` : "None";
  const bestLine = result.isNewBest ? `New best: ${result.bestTime.toFixed(1)}s` : `Best remains: ${result.bestTime.toFixed(1)}s`;
  showOverlay("Delivery Complete", "", "", [
    [isFinal ? "Factory Results" : "Next", () => isFinal ? showFactoryCleared() : startLevel(game.expansion.id, game.levelIndex + 1), "primary"],
    ["Levels", () => showScreen("menuScreen")],
    ["Restart", () => startLevel(game.expansion.id, game.levelIndex)]
  ]);
  $("#overlayText").innerHTML = `
    <span class="result-line"><b>Final time</b>${game.elapsed.toFixed(1)}s</span>
    <span class="result-line"><b>Target time</b>${game.level.targetTime}s</span>
    <span class="result-line"><b>Previous best</b>${previous}</span>
    <span class="result-line highlight">${bestLine}</span>
    <span class="result-line"><b>Package durability</b>${game.package.health}/3</span>
    <span class="result-line"><b>Run stamps</b>${result.runStamps}/3</span>
    <span class="result-line"><b>Best stamps</b>${result.bestStamps}/3</span>
    <span class="result-line"><b>Progress</b>Level ${game.levelIndex + 1} of ${game.expansion.levels.length}</span>`;
  animateStamps(result.runStamps, result.bestStamps);
}

function showFactoryCleared() {
  showOverlay("Factory Cleared", "Every base-game delivery is complete. Future expansion slots are already wired in.", "", [
    ["Expansion Packs", () => showScreen("packsScreen"), "primary"],
    ["Title", () => showScreen("titleScreen")]
  ]);
  $("#stampResult").innerHTML = `<span class="stamp-icon earned">★</span><span class="stamp-icon earned">★</span><span class="stamp-icon earned">★</span>`;
}

function animateStamps(runStamps, bestStamps) {
  $("#stampResult").innerHTML = "";
  for (let i = 0; i < 3; i++) {
    const stamp = document.createElement("span");
    stamp.className = `stamp-icon ${i < runStamps ? "earned" : ""} ${i < bestStamps ? "best" : ""}`;
    stamp.textContent = "★";
    stamp.style.animationDelay = `${i * 160}ms`;
    $("#stampResult").append(stamp);
  }
}

function failLevel(reason) {
  if (!game || game.mode !== "playing" || game.failQueued) return;
  game.failQueued = true;
  game.mode = "failed";
  game.shake = 10;
  ping(95, .08, "sawtooth");
  window.setTimeout(() => game && startLevel(game.expansion.id, game.levelIndex), 550);
  game.message = reason;
}

function damagePackage(reason) {
  const pack = game.package;
  if (pack.hitCooldown > 0) return;
  pack.health -= 1;
  pack.hitCooldown = .8;
  pack.vx *= -.45;
  pack.vy = Math.min(pack.vy, -260);
  game.shake = 6;
  burst(pack.x + pack.w / 2, pack.y + pack.h / 2, colors.red, 14);
  ping(140, .05, "square");
  if (pack.health <= 0) failLevel(`Package destroyed by ${reason}.`);
}

function draw() {
  ctx.save();
  ctx.clearRect(0, 0, W, H);
  const sx = save.settings.shake ? (Math.random() - .5) * game.shake : 0;
  const sy = save.settings.shake ? (Math.random() - .5) * game.shake : 0;
  ctx.translate(sx, sy);
  drawBackground();
  drawMagnets();
  drawMagneticArrows();
  drawRects(game.level.walls || [], colors.floor, "#344154");
  game.platforms.forEach((p) => drawRect(p, "#738091", "#3d4a5f"));
  game.doors.forEach((d) => { if (!d.open) drawDoor(d); });
  game.plates.forEach(drawPlate);
  game.boxes.forEach(drawBox);
  drawHazards();
  drawDelivery();
  drawPackageShadow();
  drawThrowPreview();
  drawPackage();
  drawPlayer();
  drawEffects();
  drawMessage();
  drawTutorial();
  if (game.flipFlash > 0) {
    ctx.globalAlpha = game.flipFlash * .3;
    ctx.fillStyle = game.polarity === 1 ? colors.red : colors.blue;
    ctx.fillRect(0, 0, W, H);
  }
  ctx.restore();
}

function drawBackground() {
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, "#132033");
  grad.addColorStop(1, "#0d1420");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "rgba(255,255,255,.05)";
  ctx.lineWidth = 2;
  for (let x = 40; x < W; x += 80) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
  }
  for (let y = 70; y < H; y += 70) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }
  ctx.fillStyle = "rgba(255,210,87,.7)";
  for (let x = 60; x < W; x += 180) ctx.fillRect(x, 32, 18, 8);
}

function drawMagnets() {
  for (const m of game.level.magnets || []) {
    const activePull = game.polarity !== m.polarity;
    ctx.save();
    ctx.globalAlpha = .12;
    ctx.strokeStyle = activePull ? colors.blue : colors.red;
    for (let r = 36; r <= m.r; r += 28) {
      ctx.beginPath(); ctx.arc(m.x, m.y, r, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = m.polarity === 1 ? colors.red : colors.blue;
    roundRect(m.x - 26, m.y - 26, 52, 52, 10, true);
    ctx.fillStyle = "#101825";
    ctx.font = "900 20px Nunito";
    ctx.textAlign = "center";
    ctx.fillText(m.polarity === 1 ? "N" : "S", m.x, m.y + 7);
    ctx.fillStyle = activePull ? "#cceeff" : "#ffd8df";
    ctx.font = "900 13px Nunito";
    ctx.fillText(activePull ? "PULL" : "PUSH", m.x, m.y - 38);
    ctx.restore();
  }
}

function drawMagneticArrows() {
  const targets = [game.package, ...game.boxes].filter((item) => item.magnetic && !item.carried);
  targets.forEach((entity) => {
    const force = magneticForceVector(entity);
    drawForceArrow(entity.x + entity.w / 2, entity.y - 10, entity.h, force, .055, 58);
  });
  const robotForce = robotForceVector();
  drawForceArrow(game.player.x + game.player.w / 2, game.player.y - 8, game.player.h, robotForce, .16, 45);
}

function drawForceArrow(cx, cy, height, force, scale, threshold) {
  const mag = Math.hypot(force.x, force.y);
  if (mag < threshold) return;
  const len = clamp(mag * scale, 18, 68);
  const nx = force.x / mag;
  const ny = force.y / mag;
  ctx.save();
  ctx.globalAlpha = .85;
  ctx.strokeStyle = game.polarity === 1 ? colors.red : colors.blue;
  ctx.fillStyle = ctx.strokeStyle;
  ctx.lineWidth = 5;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + nx * len, cy + ny * len);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx + nx * len, cy + ny * len);
  ctx.lineTo(cx + nx * (len - 10) - ny * 5, cy + ny * (len - 10) + nx * 5);
  ctx.lineTo(cx + nx * (len - 10) + ny * 5, cy + ny * (len - 10) - nx * 5);
  ctx.fill();
  ctx.restore();
}

function magneticForceVector(entity) {
  let x = 0;
  let y = 0;
  for (const m of game.level.magnets || []) {
    const ex = entity.x + entity.w / 2;
    const ey = entity.y + entity.h / 2;
    const dx = m.x - ex;
    const dy = m.y - ey;
    const dist = Math.max(32, Math.hypot(dx, dy));
    if (dist > m.r) continue;
    const same = game.polarity === m.polarity;
    const falloff = magnetFalloff(dist, m.r);
    const force = (same ? -1 : 1) * m.strength * MAGNET_FORCE_MULT * falloff;
    x += (dx / dist) * force;
    y += (dy / dist) * force * .78;
  }
  return { x, y };
}

function robotForceVector() {
  const p = game.player;
  let x = 0;
  let y = 0;
  const weight = p.carry ? .2 : .08;
  for (const m of game.level.magnets || []) {
    const cx = p.x + p.w / 2;
    const cy = p.y + p.h / 2;
    const dx = m.x - cx;
    const dy = m.y - cy;
    const range = Math.min(150, m.r * .42);
    const dist = Math.max(36, Math.hypot(dx, dy));
    if (dist > range) continue;
    const same = game.polarity === m.polarity;
    const force = (same ? -1 : 1) * m.strength * magnetFalloff(dist, range) * weight;
    x += (dx / dist) * force;
    y += (dy / dist) * force * .45;
  }
  return { x, y };
}

function drawHazards() {
  for (const h of game.hazards) {
    const active = h.activePolarity == null || h.activePolarity === game.polarity;
    ctx.globalAlpha = active ? 1 : .28;
    if (h.type === "spikes") {
      ctx.fillStyle = colors.lava;
      for (let x = h.x; x < h.x + h.w; x += 18) {
        ctx.beginPath(); ctx.moveTo(x, h.y + h.h); ctx.lineTo(x + 9, h.y); ctx.lineTo(x + 18, h.y + h.h); ctx.fill();
      }
    } else if (h.type === "electric") {
      ctx.fillStyle = "#1e2d43"; ctx.fillRect(h.x, h.y, h.w, h.h);
      ctx.strokeStyle = active ? colors.yellow : "#536272"; ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(h.x + h.w / 2, h.y + 4);
      for (let y = h.y + 12; y < h.y + h.h; y += 14) ctx.lineTo(h.x + (Math.random() > .5 ? 4 : h.w - 4), y);
      ctx.stroke();
    } else if (h.type === "crusher") {
      drawRect(h, "#a74657", "#642532");
      ctx.fillStyle = "#ffc4ce"; ctx.fillRect(h.x + 8, h.y + h.h - 8, h.w - 16, 5);
    }
    ctx.globalAlpha = 1;
  }
}

function drawDelivery() {
  const d = game.level.delivery;
  ctx.fillStyle = "#263851";
  roundRect(d.x, d.y, d.w, d.h, 8, true);
  ctx.fillStyle = colors.green;
  ctx.fillRect(d.x + 10, d.y + 10, d.w - 20, 10);
  ctx.fillStyle = "#bfffd8";
  ctx.font = "900 16px Nunito";
  ctx.textAlign = "center";
  ctx.fillText("SHIP", d.x + d.w / 2, d.y + d.h / 2 + 12);
}

function drawPackageShadow() {
  const p = game.package;
  const ground = findGroundY(p);
  const distance = clamp(ground - (p.y + p.h), 0, 220);
  ctx.save();
  ctx.globalAlpha = .34 * (1 - distance / 260);
  ctx.fillStyle = "#02050a";
  ctx.beginPath();
  ctx.ellipse(p.x + p.w / 2, ground + 3, clamp(22 - distance * .035, 11, 24), 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawThrowPreview() {
  const p = game.player;
  if (!p.carry || !p.holdPickup || !p.pickupStartedCarrying || p.throwCharge <= .05) return;
  const power = p.throwCharge;
  let x = game.package.x + game.package.w / 2;
  let y = game.package.y + game.package.h / 2;
  const throwVelocity = calculateThrowVelocity(p, power);
  let vx = throwVelocity.vx;
  let vy = throwVelocity.vy;
  ctx.save();
  ctx.fillStyle = "rgba(77,183,255,.75)";
  for (let i = 0; i < 18; i++) {
    vx *= .992;
    vy += G * .035;
    x += vx * .035;
    y += vy * .035;
    if (y > H - 34) break;
    ctx.globalAlpha = 1 - i / 18;
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = "#101825";
  roundRect(p.x - 8, p.y - 18, 48, 8, 4, true);
  ctx.fillStyle = colors.blue;
  roundRect(p.x - 8, p.y - 18, 48 * power, 8, 4, true);
  ctx.restore();
}

function findGroundY(entity) {
  const cx = entity.x + entity.w / 2;
  let ground = H - 40;
  for (const s of solids()) {
    if (cx >= s.x && cx <= s.x + s.w && s.y >= entity.y + entity.h) ground = Math.min(ground, s.y);
  }
  return ground;
}

function drawPlayer() {
  const p = game.player;
  const squish = p.squash ? 1 + p.squash : 1;
  ctx.save();
  ctx.translate(p.x + p.w / 2, p.y + p.h / 2);
  ctx.scale(1 / squish, squish);
  ctx.fillStyle = "#dce9f7";
  roundRect(-p.w / 2, -p.h / 2, p.w, p.h, 9, true);
  ctx.fillStyle = "#223148";
  ctx.fillRect(-9, -5, 6, 6);
  ctx.fillRect(5, -5, 6, 6);
  ctx.fillStyle = game.polarity === 1 ? colors.red : colors.blue;
  ctx.fillRect(-12, 12, 24, 5);
  ctx.restore();
}

function drawPackage() {
  const p = game.package;
  ctx.save();
  ctx.translate(p.x + p.w / 2, p.y + p.h / 2);
  ctx.rotate(Math.sin(p.wobble) * .08);
  ctx.fillStyle = p.health === 3 ? colors.yellow : p.health === 2 ? "#ffad57" : "#ff6b60";
  roundRect(-p.w / 2, -p.h / 2, p.w, p.h, 6, true);
  ctx.fillStyle = "rgba(37,36,25,.3)";
  ctx.fillRect(-p.w / 2 + 5, -3, p.w - 10, 6);
  if (p.health < 3) {
    ctx.strokeStyle = "#4a2b28"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(-8, -11); ctx.lineTo(0, -2); ctx.lineTo(-4, 9); ctx.stroke();
  }
  if (p.health < 2) {
    ctx.beginPath(); ctx.moveTo(8, -12); ctx.lineTo(3, 1); ctx.lineTo(11, 12); ctx.stroke();
  }
  ctx.restore();
}

function drawBox(b) {
  drawRect(b, "#8795a6", "#4a586b");
  ctx.fillStyle = "#cdd8e5"; ctx.fillRect(b.x + 8, b.y + 8, b.w - 16, 6);
}

function drawDoor(d) {
  drawRect(d, game.polarity === 1 ? "#9e3549" : "#2d78ad", "#172033");
  ctx.fillStyle = "#f2f6fb";
  ctx.fillRect(d.x + 8, d.y + 10, d.w - 16, d.h - 20);
}

function drawPlate(p) {
  ctx.fillStyle = p.pressed ? colors.green : "#506075";
  roundRect(p.x, p.y, p.w, p.h, 5, true);
}

function drawEffects() {
  effects.forEach((e) => {
    e.x += e.vx / 60;
    e.y += e.vy / 60;
    ctx.globalAlpha = Math.max(0, e.life * 3);
    ctx.fillStyle = e.color;
    ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2); ctx.fill();
    if (e.r > 5) {
      ctx.globalAlpha = Math.max(0, e.life * 1.8);
      ctx.strokeStyle = e.color;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(e.x, e.y, e.r * (1 + (1 - e.life)), 0, Math.PI * 2); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  });
}

function drawMessage() {
  const text = game.messageTimer > 0 ? game.message : game.tip;
  if (!text) return;
  ctx.fillStyle = "rgba(10,16,25,.72)";
  roundRect(190, 18, 580, 46, 8, true);
  ctx.fillStyle = "#f4f7fb";
  ctx.font = "900 16px Nunito";
  ctx.textAlign = "center";
  ctx.fillText(text, W / 2, 48);
}

function drawTutorial() {
  if (!game.tutorial) return;
  const step = currentTutorialStep();
  if (!step) return;
  const x = 228;
  const y = 74;
  ctx.save();
  ctx.fillStyle = "rgba(12,18,28,.92)";
  roundRect(x, y, 504, 76, 10, true);
  ctx.strokeStyle = game.polarity === 1 ? colors.red : colors.blue;
  ctx.lineWidth = 3;
  roundRect(x + 1.5, y + 1.5, 501, 73, 10, false);
  ctx.fillStyle = colors.yellow;
  roundRect(x + 18, y + 19, 86, 38, 8, true);
  ctx.fillStyle = "#1a2332";
  ctx.font = "900 18px Nunito";
  ctx.textAlign = "center";
  ctx.fillText(step.key, x + 61, y + 44);
  ctx.fillStyle = "#f4f7fb";
  ctx.font = "900 17px Nunito";
  ctx.textAlign = "left";
  ctx.fillText(step.text, x + 122, y + 33);
  ctx.fillStyle = "#9cafc6";
  ctx.font = "800 12px Nunito";
  ctx.fillText(`Step ${game.tutorial.index + 1} of ${game.tutorial.steps.length}`, x + 122, y + 54);
  ctx.restore();
}

function drawRects(list, fill, stroke) {
  list.forEach((r) => drawRect(r, fill, stroke));
}

function drawRect(r, fill, stroke) {
  ctx.fillStyle = fill;
  roundRect(r.x, r.y, r.w, r.h, 5, true);
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 3;
  roundRect(r.x + 1.5, r.y + 1.5, r.w - 3, r.h - 3, 5, false);
}

function roundRect(x, y, w, h, r, fill) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  fill ? ctx.fill() : ctx.stroke();
}

function renderMenus() {
  const base = expansionRegistry[0];
  $("#levelGrid").innerHTML = base.levels.map((level, index) => {
    const key = `${base.id}:${level.id}`;
    const stamps = Number(save.stamps[key]) || 0;
    const best = save.bestTimes[key] ? `${Number(save.bestTimes[key]).toFixed(1)}s` : "No time yet";
    return `<button class="level-card" data-level="${index}" type="button">
      <b>${index + 1}. ${level.name}</b>
      <small>Target ${level.targetTime}s - ${best}</small>
      <div class="stamps">${"*".repeat(stamps)}${"-".repeat(3 - stamps)}</div>
    </button>`;
  }).join("");
  $("#packGrid").innerHTML = expansionRegistry.map((pack) => {
    const possible = pack.levels.length * 3;
    const earned = pack.levels.reduce((sum, level) => sum + (Number(save.stamps[`${pack.id}:${level.id}`]) || 0), 0);
    const pct = possible ? Math.round((earned / possible) * 100) : 0;
    const status = pack.availability === "installed" ? "Play" : pack.availability === "locked" ? "Locked" : "Coming soon";
    return `<button class="pack-card ${pack.availability !== "installed" ? "locked" : ""}" data-pack="${pack.id}" type="button">
      <span class="pack-icon">${pack.cover}</span>
      <b>${pack.name}</b>
      <small>${pack.description}</small>
      <small>${pack.levels.length} levels - ${pct}% - ${earned}/${possible || 0} stamps</small>
      <div class="stamps">${status}</div>
    </button>`;
  }).join("");
}

function updateHud() {
  $("#hudLevel").textContent = `Level ${game.levelIndex + 1}: ${game.level.name}`;
  $("#hudPack").textContent = game.expansion.name;
  $("#timer").textContent = game.elapsed.toFixed(1);
  $$(".durability i").forEach((heart, i) => heart.classList.toggle("broken", i >= game.package.health));
  $("#polarityBadge").textContent = game.polarity === 1 ? "NORTH" : "SOUTH";
  $("#polarityBadge").className = `polarity ${game.polarity === 1 ? "north" : "south"}`;
}

function showOverlay(title, text, stamps, actions) {
  $("#overlayTitle").textContent = title;
  $("#overlayText").textContent = text;
  $("#stampResult").textContent = stamps || "";
  $("#overlayActions").innerHTML = "";
  actions.forEach(([label, fn, klass]) => {
    const button = document.createElement("button");
    button.className = `btn ${klass || ""}`;
    button.textContent = label;
    button.addEventListener("click", fn);
    $("#overlayActions").append(button);
  });
  $("#overlay").classList.remove("hidden");
}

function pauseGame() {
  if (!game || game.mode !== "playing") return;
  game.mode = "paused";
  showOverlay("Paused", "Factory time is stopped. Your package is exactly as anxious as you left it.", "", [
    ["Resume", () => { $("#overlay").classList.add("hidden"); game.mode = "playing"; lastFrame = 0; }, "primary"],
    ["Restart", () => startLevel(game.expansion.id, game.levelIndex)],
    ["Levels", () => showScreen("menuScreen")]
  ]);
}

function flipPolarity() {
  if (!game || game.mode !== "playing") return;
  if (game.flipCooldown > 0) return;
  game.polarity *= -1;
  game.didFlip = true;
  game.flipFlash = 1;
  game.flipCooldown = .35;
  game.shake = 9;
  game.messageTimer = 0;
  polarityImpulse();
  burst(W / 2, H / 2, game.polarity === 1 ? colors.red : colors.blue, 78);
  ping(game.polarity === 1 ? 330 : 205, .085, "sawtooth");
  window.setTimeout(() => ping(game.polarity === 1 ? 430 : 280, .04, "square"), 50);
}

function startPickupAction() {
  if (!game || game.mode !== "playing") return;
  const p = game.player;
  const pack = game.package;
  if (p.holdPickup) return;
  p.holdPickup = true;
  p.throwCharge = 0;
  p.pickupStartedCarrying = p.carry;
  if (p.carry) {
    return;
  }
  if (p.pickupCooldown > 0 || pack.pickupCooldown > 0) return;
  const close = Math.hypot((p.x + p.w / 2) - (pack.x + pack.w / 2), (p.y + p.h / 2) - (pack.y + pack.h / 2)) < 72;
  if (close) {
    const midair = !pack.grounded;
    p.carry = true;
    pack.carried = true;
    pack.pickupCooldown = 0;
    game.messageTimer = 0;
    burst(pack.x + pack.w / 2, pack.y + pack.h / 2, midair ? colors.green : colors.yellow, midair ? 16 : 6);
    ping(midair ? 740 : 520, midair ? .055 : .03, "sine");
  }
}

function releasePickupAction() {
  if (!game) return;
  const p = game.player;
  if (!p.holdPickup) return;
  p.holdPickup = false;
  if (!game || game.mode !== "playing") return;
  if (!p.carry || !p.pickupStartedCarrying) {
    p.throwCharge = 0;
    p.pickupStartedCarrying = false;
    return;
  }
  const pack = game.package;
  const throwVelocity = calculateThrowVelocity(p, p.throwCharge);
  p.carry = false;
  pack.carried = false;
  pack.pickupCooldown = PICKUP_COOLDOWN;
  p.pickupCooldown = PICKUP_COOLDOWN;
  pack.vx = throwVelocity.vx;
  pack.vy = throwVelocity.vy;
  p.throwCharge = 0;
  p.pickupStartedCarrying = false;
  game.messageTimer = 0;
  burst(pack.x + pack.w / 2, pack.y + pack.h / 2, throwVelocity.charged ? colors.blue : colors.yellow, throwVelocity.charged ? 14 : 6);
  ping(throwVelocity.charged ? 380 + throwVelocity.power * 180 : 300, throwVelocity.charged ? .06 : .03, throwVelocity.charged ? "sawtooth" : "triangle");
}

function burst(x, y, color, count) {
  for (let i = 0; i < count; i++) effects.push({
    x, y,
    vx: (Math.random() - .5) * 240,
    vy: (Math.random() - .65) * 220,
    color,
    life: .25 + Math.random() * .5,
    r: 2 + Math.random() * 3
  });
}

function ping(freq, duration, type = "sine") {
  if (!save.settings.sound) return;
  audioCtx ||= new AudioContext();
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.value = .045;
  gain.gain.exponentialRampToValueAtTime(.001, audioCtx.currentTime + duration);
  osc.connect(gain).connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + duration);
}

function startMusic() {
  stopMusic();
  if (!save.settings.music) return;
  let step = 0;
  musicTimer = window.setInterval(() => {
    if (!game || game.mode !== "playing") return;
    const notes = [110, 146.8, 164.8, 220];
    ping(notes[step++ % notes.length], .035, "sine");
  }, 640);
}

function stopMusic() {
  if (musicTimer) window.clearInterval(musicTimer);
  musicTimer = null;
}

function rects(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function calculateThrowVelocity(player, charge) {
  const power = clamp(charge, 0, 1);
  const charged = power > THROW_CHARGE_THRESHOLD;
  return {
    charged,
    power,
    vx: player.vx + player.facing * (charged ? 265 + power * 430 : 92),
    vy: charged ? -160 - power * 230 : -54
  };
}

function handleAction(action) {
  if (action === "jump" && game) game.player.jumpBuffer = .12;
  if (action === "pickup") startPickupAction();
  if (action === "flip") flipPolarity();
  if (action === "restart" && game) startLevel(game.expansion.id, game.levelIndex);
}

document.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();
  if (["arrowleft", "arrowright", "arrowup", " ", "a", "d", "w", "e", "f", "shift", "r", "escape"].includes(key)) event.preventDefault();
  keys.add(key);
  if (key === "w" || key === "arrowup" || key === " ") handleAction("jump");
  if (key === "e" && !event.repeat) handleAction("pickup");
  if (key === "f" || key === "shift") handleAction("flip");
  if (key === "r" && game) startLevel(game.expansion.id, game.levelIndex);
  if (key === "escape") pauseGame();
}, { passive: false });
document.addEventListener("keyup", (event) => {
  const key = event.key.toLowerCase();
  keys.delete(key);
  if (key === "e") releasePickupAction();
});
document.addEventListener("touchmove", (event) => event.preventDefault(), { passive: false });
window.addEventListener("blur", pauseGame);

$("#playBtn").addEventListener("click", () => {
  const firstOpen = expansionRegistry[0].levels.findIndex((level, i) => i === 0 || save.completedLevels[`base_game:${expansionRegistry[0].levels[i - 1].id}`]);
  startLevel("base_game", Math.max(0, firstOpen));
  startMusic();
});
$("#levelSelectBtn").addEventListener("click", () => showScreen("menuScreen"));
$("#packsBtn").addEventListener("click", () => showScreen("packsScreen"));
$("#restartBtn").addEventListener("click", () => game && startLevel(game.expansion.id, game.levelIndex));
$("#pauseBtn").addEventListener("click", pauseGame);
$("#skipTutorialBtn").addEventListener("click", skipTutorial);
$("#settingsOpenBtn").addEventListener("click", () => {
  $("#soundToggle").checked = save.settings.sound;
  $("#musicToggle").checked = save.settings.music;
  $("#shakeToggle").checked = save.settings.shake;
  $("#restoreBackupBtn").disabled = !hasBackupSave();
  $("#settingsPanel").classList.remove("hidden");
});
$("#settingsSaveBtn").addEventListener("click", () => {
  save.settings.sound = $("#soundToggle").checked;
  save.settings.music = $("#musicToggle").checked;
  save.settings.shake = $("#shakeToggle").checked;
  saveProgress(save);
  startMusic();
  $("#settingsPanel").classList.add("hidden");
});
$("#resetBtn").addEventListener("click", () => {
  if (confirm("Reset all Magnet Mayhem Delivery progress on this browser? A backup will be kept before deleting.")) {
    save = resetSave();
    renderMenus();
    $("#settingsPanel").classList.add("hidden");
  }
});
$("#restoreBackupBtn").addEventListener("click", () => {
  if (!hasBackupSave()) return;
  if (confirm("Restore the backup save for Magnet Mayhem Delivery? Current progress will be replaced after the backup is validated.")) {
    try {
      save = restoreBackupSave();
      renderMenus();
      $("#settingsPanel").classList.add("hidden");
      alert("Backup save restored.");
    } catch {
      alert("The backup save could not be restored.");
    }
  }
});
$("#exportBtn").addEventListener("click", () => exportSave(save));
$("#importInput").addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    save = await importSaveFile(file);
    renderMenus();
    alert("Save imported.");
  } catch {
    alert("That save file was not valid JSON progress.");
  }
  event.target.value = "";
});
$("#fullscreenBtn").addEventListener("click", () => {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen?.();
});
$$("[data-screen]").forEach((button) => button.addEventListener("click", () => showScreen(button.dataset.screen)));
$("#levelGrid").addEventListener("click", (event) => {
  const button = event.target.closest("[data-level]");
  if (button) {
    startLevel("base_game", Number(button.dataset.level));
    startMusic();
  }
});
$("#packGrid").addEventListener("click", (event) => {
  const button = event.target.closest("[data-pack]");
  if (!button) return;
  const pack = expansionRegistry.find((item) => item.id === button.dataset.pack);
  if (pack?.availability === "installed" && pack.levels.length) {
    startLevel(pack.id, 0);
    startMusic();
  }
});
$$("[data-touch]").forEach((button) => {
  const name = button.dataset.touch;
  const down = (event) => {
    event.preventDefault();
    if (event.type === "mousedown" && button.dataset.pointerHandled) return;
    button.dataset.pointerHandled = "1";
    window.setTimeout(() => delete button.dataset.pointerHandled, 80);
    heldTouch.add(name);
    handleAction(name);
  };
  const up = (event) => {
    event.preventDefault();
    heldTouch.delete(name);
    if (name === "pickup") releasePickupAction();
  };
  button.addEventListener("pointerdown", down);
  button.addEventListener("pointerup", up);
  button.addEventListener("pointercancel", up);
  button.addEventListener("pointerleave", up);
  button.addEventListener("mousedown", down);
  button.addEventListener("mouseup", up);
  button.addEventListener("mouseleave", up);
  button.addEventListener("click", (event) => {
    event.preventDefault();
    if (button.dataset.pointerHandled) return;
    if (name !== "left" && name !== "right" && name !== "pickup") handleAction(name);
  });
});

renderMenus();
showScreen("titleScreen");

