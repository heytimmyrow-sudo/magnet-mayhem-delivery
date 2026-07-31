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
const BOX_SPEED_CAP = 760;
const BOX_IMPULSE_MULT = .58;
const PICKUP_COOLDOWN = .22;
const THROW_HOLD_TIME = .72;
const THROW_CHARGE_THRESHOLD = .16;
const PLATFORM_CARRY_SLOP = 8;
const MAX_COLLISION_STEP = 6;
const RELEASE_GAP = 6;
const PLATE_RELEASE_GRACE = .14;
const DOOR_CLEARANCE = 6;
const PACKAGE_BOUNCE_THRESHOLD = 340;
const keys = new Set();
const heldTouch = new Set();
const effects = [];
let save = loadSave();
let game = null;
let lastFrame = 0;
let audioCtx = null;
let musicTimer = null;
let frameRequest = 0;
let testPaused = false;

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
    player: { ...body(level.spawn.x, level.spawn.y, 32, 42, false), speed: 0, grounded: false, coyote: 0, jumpBuffer: 0, facing: 1, carry: false, squash: 0, pickupCooldown: 0, holdPickup: false, pickupStartedCarrying: false, throwCharge: 0, walk: 0, landTimer: 0, throwAnim: 0 },
    package: { ...packageBody, health: 3, carried: false, hitCooldown: 0, wobble: 0, impact: 0, pickupCooldown: 0, lastCarried: false },
    platforms: (level.platforms || []).map((p) => ({ ...p, baseX: p.x, baseY: p.y, prevX: p.x, prevY: p.y, targetX: p.x, targetY: p.y, deltaX: 0, deltaY: 0 })),
    doors: (level.doors || []).map((d) => ({ ...d, open: false, requestedOpen: false, openAmount: 0 })),
    boxes: (level.boxes || []).map((b) => ({ ...body(b.x, b.y, b.w, b.h, true), startX: b.x, startY: b.y })),
    hazards: [...(level.hazards || []), ...(level.movingHazards || [])].map((h) => ({ ...h, baseX: h.x, baseY: h.y, t: Math.random() * 3 })),
    plates: (level.plates || []).map((p) => ({ ...p, pressed: false, releaseTimer: 0 })),
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
  if (game.mode === "playing" && !testPaused) update(dt);
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
  game.package.impact = Math.max(0, game.package.impact - dt * 5);
  game.player.pickupCooldown = Math.max(0, game.player.pickupCooldown - dt);
  game.player.landTimer = Math.max(0, game.player.landTimer - dt * 6);
  game.player.throwAnim = Math.max(0, game.player.throwAnim - dt * 7);
  updatePlates(dt);
  updateDoorsAndPlatforms(dt);
  carryPlatformRiders(dt);
  updateHazards(dt);
  updatePlayer(dt);
  updatePackage(dt);
  game.boxes.forEach((box) => {
    box.magnetFxCooldown = Math.max(0, box.magnetFxCooldown - dt);
    applyMagnetism(box, dt, .8);
    moveBody(box, dt, solids());
    box.vx *= box.grounded ? .88 : MAGNET_DRAG;
    if (box.grounded && Math.abs(box.vx) < 2) box.vx = 0;
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
  p.walk += Math.abs(p.vx) * dt * .045;
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
  const landed = pack.grounded;
  if (pack.grounded) pack.vx *= .9;
  else pack.vx *= MAGNET_DRAG;
  if (pack.grounded && Math.abs(pack.vx) < 1.5) pack.vx = 0;
  if (fallSpeed > 1240 && landed) {
    damagePackage("hard impact");
  } else if (fallSpeed > PACKAGE_BOUNCE_THRESHOLD && landed) {
    pack.impact = Math.min(1, fallSpeed / 1100);
    pack.vy = -Math.min(175, fallSpeed * .16);
    pack.grounded = false;
    burst(pack.x + pack.w / 2, pack.y + pack.h, pack.health < 3 ? "#ff8a6f" : colors.yellow, 6);
  }
  pack.wobble += Math.abs(pack.vx) * dt * .03;
}

function moveBody(entity, dt, solidList, preview = false) {
  const wasGrounded = entity.grounded;
  const enteringVy = entity.vy;
  const activeSolids = solidList.filter((solid) => solid && !solid.open);
  entity.grounded = false;
  separateBodyFromSolids(entity, activeSolids);

  const totalX = entity.vx * dt;
  const totalY = entity.vy * dt;
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(totalX), Math.abs(totalY)) / MAX_COLLISION_STEP));
  const stepX = totalX / steps;
  const stepY = totalY / steps;
  let blockedX = false;
  let blockedY = false;

  for (let step = 0; step < steps; step++) {
    if (!blockedX && stepX) {
      entity.x += stepX;
      for (const solid of activeSolids) {
        if (!rects(entity, solid)) continue;
        entity.x = stepX > 0 ? solid.x - entity.w : solid.x + solid.w;
        entity.vx = 0;
        blockedX = true;
        break;
      }
    }

    if (!blockedY && stepY) {
      entity.y += stepY;
      for (const solid of activeSolids) {
        if (!rects(entity, solid)) continue;
        if (stepY > 0) landOnSolid(entity, solid, wasGrounded, enteringVy);
        else entity.y = solid.y + solid.h;
        entity.vy = 0;
        blockedY = true;
        break;
      }
    }
  }

  entity.x = clamp(entity.x, 20, W - entity.w - 20);
  if (!preview && entity.y > H + 80) handleFallout(entity);
}

function separateBodyFromSolids(entity, solidList) {
  for (let pass = 0; pass < 4; pass++) {
    let corrected = false;
    for (const solid of solidList) {
      if (!rects(entity, solid)) continue;
      const shifts = [
        { x: solid.x - (entity.x + entity.w), y: 0 },
        { x: solid.x + solid.w - entity.x, y: 0 },
        { x: 0, y: solid.y - (entity.y + entity.h) },
        { x: 0, y: solid.y + solid.h - entity.y }
      ];
      shifts.sort((a, b) => (Math.abs(a.x) + Math.abs(a.y)) - (Math.abs(b.x) + Math.abs(b.y)));
      entity.x += shifts[0].x;
      entity.y += shifts[0].y;
      if (shifts[0].y < 0) entity.grounded = true;
      corrected = true;
    }
    if (!corrected) break;
  }
}

function landOnSolid(entity, solid, wasGrounded, enteringVy) {
  entity.y = solid.y - entity.h;
  entity.grounded = true;
  if (entity === game.player) {
    entity.coyote = .1;
    if (!wasGrounded && enteringVy > 80) {
      entity.landTimer = .18;
      burst(entity.x + entity.w / 2, entity.y + entity.h, "#b9c7d8", 7);
    }
  }
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
    door.requestedOpen = typeof door.openPolarity === "string"
      ? game.plates.some((plate) => plate.id === door.openPolarity && plate.pressed)
      : game.polarity === door.openPolarity;
    if (door.requestedOpen) door.open = true;
    else if (!doorOccupied(door)) door.open = false;
    door.openAmount += ((door.open ? 1 : 0) - door.openAmount) * Math.min(1, dt * 12);
  });
  game.platforms.forEach((p) => {
    p.prevX = p.x;
    p.prevY = p.y;
    const active = game.polarity === p.polarity ? 1 : 0;
    p.targetX = p.baseX + p.dx * active;
    p.targetY = p.baseY + p.dy * active;
    p.x += (p.targetX - p.x) * Math.min(1, dt * 4.5);
    p.y += (p.targetY - p.y) * Math.min(1, dt * 4.5);
    p.deltaX = p.x - p.prevX;
    p.deltaY = p.y - p.prevY;
  });
}

function doorOccupied(door) {
  const doorway = {
    x: door.x - DOOR_CLEARANCE,
    y: door.y - DOOR_CLEARANCE,
    w: door.w + DOOR_CLEARANCE * 2,
    h: door.h + DOOR_CLEARANCE * 2
  };
  return [game.player, game.package, ...game.boxes].some((body) => rects(body, doorway));
}

function carryPlatformRiders(dt) {
  const riders = [game.player, ...(game.package.carried ? [] : [game.package]), ...game.boxes];
  for (const platform of game.platforms) {
    if (!platform.deltaX && !platform.deltaY) continue;
    const oldPlatform = { x: platform.prevX, y: platform.prevY, w: platform.w, h: platform.h };
    for (const rider of riders) {
      if (isRidingPlatform(rider, oldPlatform)) {
        rider.x += platform.deltaX;
        rider.y += platform.deltaY;
        rider.grounded = true;
        if (platform.deltaY < 0) rider.vy = Math.min(rider.vy, 0);
        continue;
      }
      if (!rects(rider, platform)) continue;
      if (Math.abs(platform.deltaY) >= Math.abs(platform.deltaX)) {
        if (platform.deltaY < 0) {
          rider.y = platform.y - rider.h;
          rider.grounded = true;
          rider.vy = Math.min(rider.vy, platform.deltaY / Math.max(dt, .001));
        } else {
          rider.y = platform.y + platform.h;
          rider.vy = Math.max(rider.vy, platform.deltaY / Math.max(dt, .001));
        }
      } else if (platform.deltaX > 0) {
        rider.x = platform.x + platform.w;
        rider.vx = Math.max(rider.vx, platform.deltaX / Math.max(dt, .001));
      } else {
        rider.x = platform.x - rider.w;
        rider.vx = Math.min(rider.vx, platform.deltaX / Math.max(dt, .001));
      }
    }
  }
}

function isRidingPlatform(entity, platform) {
  const bottom = entity.y + entity.h;
  const horizontallyAligned = entity.x + entity.w > platform.x + 4 && entity.x < platform.x + platform.w - 4;
  return horizontallyAligned && bottom >= platform.y - PLATFORM_CARRY_SLOP && bottom <= platform.y + PLATFORM_CARRY_SLOP;
}

function updatePlates(dt) {
  game.plates.forEach((plate) => {
    const candidates = plate.required === "box" ? game.boxes : [game.player, game.package, ...game.boxes];
    const occupied = candidates.some((body) => isPressingPlate(body, plate));
    if (occupied) {
      plate.pressed = true;
      plate.releaseTimer = 0;
    } else if (plate.pressed) {
      plate.releaseTimer += dt;
      if (plate.releaseTimer >= PLATE_RELEASE_GRACE) plate.pressed = false;
    }
  });
}

function isPressingPlate(body, plate) {
  const horizontalOverlap = Math.max(0, Math.min(body.x + body.w, plate.x + plate.w) - Math.max(body.x, plate.x));
  const bodyBottom = body.y + body.h;
  const stableContact = body.grounded || Math.abs(body.vy || 0) < 90;
  return horizontalOverlap >= Math.min(18, body.w * .4)
    && stableContact
    && body.y < plate.y
    && bodyBottom >= plate.y - 10
    && bodyBottom <= plate.y + plate.h + 12;
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
  const speedCap = game.boxes.includes(entity) ? BOX_SPEED_CAP : MAGNET_OBJECT_SPEED_CAP;
  const combinedForce = magneticForceVector(entity, weight);
  entity.vx += combinedForce.x * dt;
  entity.vy += combinedForce.y * dt;
  entity.vx = clamp(entity.vx, -speedCap, speedCap);
  entity.vy = clamp(entity.vy, -speedCap, speedCap);
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
    const isBox = game.boxes.includes(entity);
    const impulseScale = isBox ? BOX_IMPULSE_MULT : 1;
    const impulseCap = isBox ? BOX_SPEED_CAP : MAGNET_IMPULSE_SPEED_CAP;
    for (const m of game.level.magnets || []) {
      const ex = entity.x + entity.w / 2;
      const ey = entity.y + entity.h / 2;
      const dx = m.x - ex;
      const dy = m.y - ey;
      const dist = Math.max(30, Math.hypot(dx, dy));
      if (dist > m.r + 80) continue;
      const same = game.polarity === m.polarity;
      const proximity = clamp(1 - Math.min(dist, m.r) / (m.r + 1), 0, 1);
      const amount = (same ? -1 : 1) * Math.max(320, m.strength * MAGNET_IMPULSE_MULT * (.5 + Math.pow(proximity, 1.45))) * impulseScale;
      entity.vx += (dx / dist) * amount;
      entity.vy += (dy / dist) * amount * .72;
      entity.vx = clamp(entity.vx, -impulseCap, impulseCap);
      entity.vy = clamp(entity.vy, -impulseCap, impulseCap);
      burst(entity.x + entity.w / 2, entity.y + entity.h / 2, same ? colors.red : colors.blue, 18);
    }
  });
}

function updateTip() {
  const p = game.player;
  const pack = game.package;
  const nearPackage = Math.hypot((p.x + p.w / 2) - (pack.x + pack.w / 2), (p.y + p.h / 2) - (pack.y + pack.h / 2)) < 74;
  if (!p.carry && nearPackage) game.tip = "Press E to pick up";
  else if (p.carry) game.tip = "Tap E to drop, hold E to throw";
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
  pack.impact = 1;
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
  drawPlateLinks();
  drawPlatformPaths();
  drawHazardPaths();
  drawMagnets();
  drawMagneticArrows();
  drawRects(game.level.walls || [], colors.floor, "#344154");
  game.platforms.forEach((p) => drawRect(p, "#738091", "#3d4a5f"));
  game.doors.forEach(drawDoor);
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

function drawPlatformPaths() {
  for (const platform of game.platforms) {
    const endX = platform.baseX + platform.dx;
    const endY = platform.baseY + platform.dy;
    const active = game.polarity === platform.polarity;
    ctx.save();
    ctx.strokeStyle = active ? "rgba(255,210,87,.68)" : "rgba(137,157,181,.34)";
    ctx.lineWidth = active ? 3 : 2;
    ctx.setLineDash([10, 8]);
    ctx.beginPath();
    ctx.moveTo(platform.baseX + platform.w / 2, platform.baseY + platform.h / 2);
    ctx.lineTo(endX + platform.w / 2, endY + platform.h / 2);
    ctx.stroke();
    ctx.setLineDash([]);
    for (const endpoint of [{ x: platform.baseX, y: platform.baseY }, { x: endX, y: endY }]) {
      ctx.globalAlpha = active ? .62 : .3;
      ctx.strokeRect(endpoint.x + 2, endpoint.y + 2, platform.w - 4, platform.h - 4);
    }
    ctx.restore();
  }
}

function drawHazardPaths() {
  for (const hazard of game.hazards) {
    if (hazard.type !== "crusher" || !hazard.distance) continue;
    const endX = hazard.baseX + (hazard.axis === "x" ? hazard.distance : 0);
    const endY = hazard.baseY + (hazard.axis === "y" ? hazard.distance : 0);
    ctx.save();
    ctx.strokeStyle = "rgba(255,140,72,.42)";
    ctx.lineWidth = 3;
    ctx.setLineDash([7, 7]);
    ctx.beginPath();
    ctx.moveTo(hazard.baseX + hazard.w / 2, hazard.baseY + hazard.h / 2);
    ctx.lineTo(endX + hazard.w / 2, endY + hazard.h / 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = "rgba(255,196,206,.42)";
    ctx.strokeRect(hazard.baseX, hazard.baseY, hazard.w, hazard.h);
    ctx.strokeRect(endX, endY, hazard.w, hazard.h);
    ctx.restore();
  }
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
    const force = magneticForceVector(entity, game.boxes.includes(entity) ? .8 : 1);
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

function magneticForceVector(entity, weight = 1) {
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
    const force = (same ? -1 : 1) * m.strength * MAGNET_FORCE_MULT * falloff * weight;
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
      let segment = 0;
      for (let y = h.y + 12; y < h.y + h.h; y += 14) {
        const side = Math.sin(game.elapsed * 14 + segment * 2.4) > 0 ? 4 : h.w - 4;
        ctx.lineTo(h.x + side, y);
        segment += 1;
      }
      ctx.stroke();
      ctx.fillStyle = active ? colors.yellow : "#65758a";
      ctx.beginPath(); ctx.arc(h.x + h.w / 2, h.y - 8, 5, 0, Math.PI * 2); ctx.fill();
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
  if (!p.carry || !p.holdPickup || !p.pickupStartedCarrying || p.throwCharge < THROW_CHARGE_THRESHOLD) return;
  const power = p.throwCharge;
  const start = findSafeReleasePosition(game.package, p, solids(), true);
  if (!start) return;
  const velocity = releaseVelocity(p, power, true);
  const preview = { ...game.package, x: start.x, y: start.y, vx: velocity.vx, vy: velocity.vy, carried: false, grounded: false };
  const previewSolids = solids().concat(game.boxes);
  ctx.save();
  ctx.fillStyle = "rgba(77,183,255,.75)";
  for (let i = 0; i < 24; i++) {
    const force = magneticForceVector(preview, 1);
    preview.vx = clamp(preview.vx + force.x * .035, -MAGNET_OBJECT_SPEED_CAP, MAGNET_OBJECT_SPEED_CAP);
    preview.vy = clamp(preview.vy + (force.y + G) * .035, -MAGNET_OBJECT_SPEED_CAP, MAGNET_OBJECT_SPEED_CAP);
    moveBody(preview, .035, previewSolids, true);
    preview.vx *= preview.grounded ? .9 : MAGNET_DRAG;
    if (preview.y > H) break;
    ctx.globalAlpha = 1 - i / 25;
    ctx.beginPath();
    ctx.arc(preview.x + preview.w / 2, preview.y + preview.h / 2, preview.grounded ? 4 : 3, 0, Math.PI * 2);
    ctx.fill();
    if (preview.grounded) break;
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
  const moving = p.grounded && Math.abs(p.vx) > 20;
  const stride = moving ? Math.sin(p.walk) : 0;
  const airborneTilt = p.grounded ? 0 : clamp(p.vy / 1600, -.14, .16);
  const landingSquash = p.landTimer > 0 ? Math.sin(Math.min(1, p.landTimer / .18) * Math.PI) * .14 : 0;
  const squish = 1 + p.squash + landingSquash;
  const armReach = p.carry ? 12 : p.throwAnim > 0 ? 15 : 5;
  ctx.save();
  ctx.translate(p.x + p.w / 2, p.y + p.h / 2);
  ctx.rotate(airborneTilt * p.facing);
  ctx.scale(1 / squish, squish);
  ctx.strokeStyle = "#8fa5bb";
  ctx.lineWidth = 5;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-8, 15);
  ctx.lineTo(-8 + stride * 5, 23);
  ctx.moveTo(8, 15);
  ctx.lineTo(8 - stride * 5, 23);
  ctx.stroke();
  ctx.fillStyle = "#dce9f7";
  roundRect(-p.w / 2, -p.h / 2, p.w, p.h, 9, true);
  ctx.strokeStyle = "#a8bad0";
  ctx.beginPath();
  ctx.moveTo(-13, 2);
  ctx.lineTo(-13 - p.facing * armReach, p.carry ? -2 : 9 + stride * 2);
  ctx.moveTo(13, 2);
  ctx.lineTo(13 + p.facing * armReach, p.carry ? -2 : 9 - stride * 2);
  ctx.stroke();
  ctx.fillStyle = "#223148";
  const eyeShift = p.facing * 1.5;
  ctx.fillRect(-9 + eyeShift, -6, 6, 6);
  ctx.fillRect(5 + eyeShift, -6, 6, 6);
  ctx.fillStyle = game.polarity === 1 ? colors.red : colors.blue;
  ctx.fillRect(-12, 12, 24, 5);
  ctx.strokeStyle = "#dce9f7";
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(0, -21); ctx.lineTo(0, -27); ctx.stroke();
  ctx.fillStyle = game.polarity === 1 ? colors.red : colors.blue;
  ctx.beginPath(); ctx.arc(0, -29, 3, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawPackage() {
  const p = game.package;
  ctx.save();
  ctx.translate(p.x + p.w / 2, p.y + p.h / 2);
  ctx.rotate(Math.sin(p.wobble) * .08);
  ctx.scale(1 + p.impact * .12, 1 - p.impact * .16);
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

function drawPlateLinks() {
  for (const plate of game.plates) {
    const door = game.doors.find((candidate) => candidate.openPolarity === plate.id);
    if (!door) continue;
    const startX = plate.x + plate.w / 2;
    const startY = plate.y - 4;
    const endX = door.x + door.w / 2;
    const endY = door.y + door.h / 2;
    ctx.save();
    ctx.strokeStyle = plate.pressed ? "rgba(94,224,152,.82)" : "rgba(126,146,170,.34)";
    ctx.lineWidth = plate.pressed ? 4 : 2;
    ctx.setLineDash([8, 7]);
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(startX, endY);
    ctx.lineTo(endX, endY);
    ctx.stroke();
    ctx.restore();
  }
}

function drawDoor(d) {
  const openness = clamp(d.openAmount, 0, 1);
  const panelHeight = Math.max(0, (d.h - 14) * (1 - openness) / 2);
  const linkedPlate = typeof d.openPolarity === "string";
  const closedColor = linkedPlate ? "#9e3549" : (d.openPolarity === 1 ? colors.red : colors.blue);
  ctx.save();
  ctx.fillStyle = "#172033";
  ctx.fillRect(d.x, d.y, 5, d.h);
  ctx.fillRect(d.x + d.w - 5, d.y, 5, d.h);
  ctx.fillStyle = d.open ? colors.green : closedColor;
  ctx.beginPath();
  ctx.arc(d.x + d.w / 2, d.y - 9, 6, 0, Math.PI * 2);
  ctx.fill();
  if (panelHeight > 1) {
    drawRect({ x: d.x + 5, y: d.y + 5, w: d.w - 10, h: panelHeight }, closedColor, "#172033");
    drawRect({ x: d.x + 5, y: d.y + d.h - 5 - panelHeight, w: d.w - 10, h: panelHeight }, closedColor, "#172033");
  }
  ctx.globalAlpha = .22 + openness * .55;
  ctx.fillStyle = colors.green;
  ctx.fillRect(d.x + 7, d.y + d.h / 2 - 3, d.w - 14, 6);
  ctx.restore();
}

function drawPlate(p) {
  ctx.save();
  if (p.pressed) {
    ctx.shadowColor = colors.green;
    ctx.shadowBlur = 14;
  }
  const pressOffset = p.pressed ? 4 : 0;
  ctx.fillStyle = p.pressed ? colors.green : "#506075";
  roundRect(p.x, p.y + pressOffset, p.w, p.h - pressOffset, 5, true);
  ctx.strokeStyle = p.pressed ? "#c8ffe0" : "#8798ab";
  ctx.lineWidth = 2;
  roundRect(p.x + 1, p.y + pressOffset + 1, p.w - 2, Math.max(3, p.h - pressOffset - 2), 4, false);
  if (p.required === "box") {
    ctx.shadowBlur = 0;
    ctx.strokeStyle = p.pressed ? "#eafff1" : "#b8c6d5";
    ctx.strokeRect(p.x + p.w / 2 - 6, p.y - 12, 12, 9);
  }
  ctx.restore();
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
  const charged = p.throwCharge >= THROW_CHARGE_THRESHOLD;
  const power = charged ? p.throwCharge : 0;
  const releasePosition = findSafeReleasePosition(pack, p, solids(), charged);
  if (!releasePosition) {
    p.throwCharge = 0;
    p.pickupStartedCarrying = false;
    game.message = "Move away from the wall before releasing the package.";
    game.messageTimer = 1.8;
    return;
  }
  p.carry = false;
  pack.carried = false;
  pack.pickupCooldown = PICKUP_COOLDOWN;
  p.pickupCooldown = PICKUP_COOLDOWN;
  pack.x = releasePosition.x;
  pack.y = releasePosition.y;
  pack.grounded = false;
  const velocity = releaseVelocity(p, power, charged);
  pack.vx = velocity.vx;
  pack.vy = velocity.vy;
  p.throwAnim = charged ? .22 : .1;
  p.throwCharge = 0;
  p.pickupStartedCarrying = false;
  game.messageTimer = 0;
  burst(pack.x + pack.w / 2, pack.y + pack.h / 2, charged ? colors.blue : colors.yellow, charged ? 14 : 6);
  ping(charged ? 380 + power * 180 : 300, charged ? .06 : .03, charged ? "sawtooth" : "triangle");
}

function releaseVelocity(player, power, charged) {
  return {
    vx: charged ? player.vx + player.facing * (250 + power * 390) : player.vx * .35,
    vy: charged ? -150 - power * 210 : Math.min(0, player.vy * .15)
  };
}

function findSafeReleasePosition(pack, player, solidList, charged) {
  const forwardX = player.facing > 0
    ? player.x + player.w + RELEASE_GAP
    : player.x - pack.w - RELEASE_GAP;
  const backwardX = player.facing > 0
    ? player.x - pack.w - RELEASE_GAP
    : player.x + player.w + RELEASE_GAP;
  const alignedY = player.y + player.h - pack.h;
  const handY = player.y + 5;
  const candidates = [
    { x: forwardX, y: charged ? handY : alignedY },
    { x: backwardX, y: alignedY },
    { x: player.x + (player.w - pack.w) / 2, y: player.y - pack.h - RELEASE_GAP }
  ];

  for (const candidate of candidates) {
    const positioned = {
      ...pack,
      x: clamp(candidate.x, 20, W - pack.w - 20),
      y: candidate.y
    };
    if (rects(positioned, player)) continue;
    if (solidList.some((solid) => solid && !solid.open && rects(positioned, solid))) continue;
    return { x: positioned.x, y: positioned.y };
  }
  return null;
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

function installGameplayTestApi() {
  if (typeof location === "undefined"
    || !["127.0.0.1", "localhost"].includes(location.hostname)
    || new URLSearchParams(location.search).get("test") !== "1") return;
  testPaused = true;
  Object.defineProperty(window, "__MAGNET_MAYHEM_TEST__", {
    configurable: false,
    value: {
      width: W,
      height: H,
      constants: {
        gravity: G,
        jumpSpeed: JUMP_SPEED,
        packageSpeedCap: MAGNET_OBJECT_SPEED_CAP,
        boxSpeedCap: BOX_SPEED_CAP,
        impulseSpeedCap: MAGNET_IMPULSE_SPEED_CAP
      },
      levels: expansionRegistry[0].levels,
      expansionIds: expansionRegistry.map((pack) => pack.id),
      get game() { return game; },
      snapshot() {
        const snapshotBody = ({ x, y, w, h, vx, vy, startX, startY, grounded, magnetic }) => ({
          x, y, w, h, vx, vy, startX, startY, grounded, magnetic
        });
        return {
          levelId: game.level.id,
          levelIndex: game.levelIndex,
          elapsed: game.elapsed,
          polarity: game.polarity,
          failQueued: game.failQueued,
          player: { ...snapshotBody(game.player), carry: game.player.carry, facing: game.player.facing },
          package: { ...snapshotBody(game.package), carried: game.package.carried, health: game.package.health },
          platforms: game.platforms.map(({ x, y, baseX, baseY, prevX, prevY, targetX, targetY, deltaX, deltaY }) => ({
            x, y, baseX, baseY, prevX, prevY, targetX, targetY, deltaX, deltaY
          })),
          doors: game.doors.map(({ x, y, w, h, open, requestedOpen, openAmount }) => ({ x, y, w, h, open, requestedOpen, openAmount })),
          boxes: game.boxes.map(snapshotBody),
          hazards: game.hazards.map(({ x, y, baseX, baseY, type }) => ({ x, y, baseX, baseY, type })),
          plates: game.plates.map(({ x, y, id, pressed, releaseTimer }) => ({ x, y, id, pressed, releaseTimer }))
        };
      },
      start(index) {
        startLevel("base_game", index);
        testPaused = true;
        return game;
      },
      restart() {
        if (!game) return null;
        startLevel(game.expansion.id, game.levelIndex);
        testPaused = true;
        return game;
      },
      step(frames = 1, dt = 1 / 60) {
        for (let frame = 0; frame < frames && game?.mode === "playing"; frame++) update(dt);
        draw();
        return game;
      },
      draw,
      update,
      updatePackage,
      updatePlates,
      updateDoorsAndPlatforms,
      carryPlatformRiders,
      applyMagnetism,
      magneticForceVector,
      polarityImpulse,
      releasePickupAction,
      releaseVelocity,
      solids,
      rects
    }
  });
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
installGameplayTestApi();

