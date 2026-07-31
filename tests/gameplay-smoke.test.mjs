import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

import { expansionRegistry } from "../expansions/expansion-registry.js";
import { STRINGS, text as t } from "../localization/en.js";

const gameSource = (await readFile(new URL("../game.js", import.meta.url), "utf8"))
  .replace(/^\uFEFF/, "")
  .replace(/^import .*;\r?\n/gm, "")
  .replace(/\r?\ninstallTestApi\(\);\r?\nbootstrap\(\);\s*$/, "\n")
  .concat(`
globalThis.gameplayTestApi = {
  makeGame,
  setGame(value) { game = value; },
  getGame() { return game; },
  update,
  updatePackage,
  updateDoorsAndPlatforms,
  carryPlatformRiders,
  updatePlates,
  applyMagnetism,
  moveBody,
  polarityImpulse,
  releasePickupAction,
  releaseVelocity,
  solids,
  failLevel,
  constants: { G, JUMP_SPEED }
};`);

const noop = () => {};
const classList = { add: noop, remove: noop, toggle: noop };
const canvasContext = new Proxy({}, {
  get(target, key) {
    if (!(key in target)) target[key] = key === "measureText" ? () => ({ width: 0 }) : noop;
    return target[key];
  },
  set(target, key, value) {
    target[key] = value;
    return true;
  }
});
const elements = new Map();
function element(id) {
  if (!elements.has(id)) {
    elements.set(id, {
      id,
      width: id === "gameCanvas" ? 960 : 0,
      height: id === "gameCanvas" ? 540 : 0,
      classList,
      style: {},
      dataset: {},
      addEventListener: noop,
      append: noop,
      getContext: () => canvasContext
    });
  }
  return elements.get(id);
}

const freshSave = () => ({
  completedLevels: {}, bestTimes: {}, stamps: {}, unlockedExpansions: ["base_game"],
  settings: { sound: false, music: false, shake: false },
  tutorial: { skipped: true, completed: {} }
});
const documentMock = {
  querySelector: (selector) => element(selector.replace(/^#/, "")),
  querySelectorAll: () => [],
  addEventListener: noop,
  createElement: () => element(`created-${elements.size}`),
  documentElement: element("documentElement"),
  fullscreenElement: null
};
const windowMock = {
  addEventListener: noop,
  setTimeout: noop,
  clearTimeout: noop,
  setInterval: () => 1,
  clearInterval: noop
};
const context = vm.createContext({
  expansionRegistry,
  STRINGS,
  t,
  poki: {
    local: true,
    enabled: false,
    initialized: false,
    playing: false,
    adActive: false,
    gameplayStart: noop,
    gameplayStop: noop,
    commercialBreak: async () => false,
    initialize: async () => false,
    loadingComplete: noop,
    onAdStateChange: noop
  },
  loadSave: freshSave,
  saveProgress: () => true,
  recordLevelResult: () => ({}),
  exportSave: noop,
  hasBackupSave: () => false,
  importSaveFile: noop,
  resetSave: freshSave,
  restoreBackupSave: freshSave,
  document: documentMock,
  window: windowMock,
  requestAnimationFrame: () => 1,
  cancelAnimationFrame: noop,
  confirm: () => false,
  alert: noop,
  console,
  Math,
  URL,
  Blob
});
vm.runInContext(gameSource, context, { filename: "game.js" });
const api = context.gameplayTestApi;

test("permanent base and expansion IDs stay stable", () => {
  assert.deepEqual(
    [...expansionRegistry[0].levels.map((level) => level.id)],
    [
      "training_pickup", "first_flip", "magnet_lift", "soft_spikes", "polarity_door",
      "moving_bridge", "plate_gate", "moving_charge", "throw_lane", "crusher_intro",
      "electric_choice", "box_button", "combo_bridge", "combo_gate", "final_sort"
    ]
  );
  assert.deepEqual(
    [...expansionRegistry.map((pack) => pack.id)],
    [
      "base_game", "factory_after_dark", "frozen_warehouse", "zero_gravity_shipping",
      "robot_recycling_center", "future_pack_slot_01"
    ]
  );
});

test("Level 4 bridge covers the full spike detour and reaches SHIP", () => {
  const level = expansionRegistry[0].levels[3];
  const [left, right] = level.walls.slice(1);
  const [bridge] = level.platforms;
  const [spikes] = level.hazards;
  assert.equal(spikes.x, left.x + left.w);
  assert.equal(spikes.x + spikes.w, right.x);
  assert.ok(bridge.x <= left.x + left.w + 40);
  assert.ok(bridge.x + bridge.dx + bridge.w >= right.x - 40);
  assert.equal(level.delivery.y + level.delivery.h, right.y);
});

test("a Level 12 jump cannot clear the taller barrier", () => {
  const level = expansionRegistry[0].levels[11];
  const blocker = level.walls[2];
  const barrier = level.doors[0];
  const jumpRise = api.constants.JUMP_SPEED ** 2 / (2 * api.constants.G);
  const apexFeet = blocker.y - jumpRise;
  assert.ok(apexFeet > barrier.y, `apex feet ${apexFeet} must remain below barrier top ${barrier.y}`);
  assert.equal(barrier.y + barrier.h, 500);
});

test("twenty gentle package drops settle on flat ground", () => {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const game = api.makeGame("base_game", 0);
    api.setGame(game);
    Object.assign(game.player, {
      x: 90 + (attempt % 10) * 78,
      y: 458,
      vx: -300 + attempt * 30,
      vy: attempt % 3 === 0 ? -40 : 0,
      facing: attempt % 2 ? -1 : 1,
      grounded: true,
      carry: true,
      holdPickup: true,
      pickupStartedCarrying: true,
      throwCharge: 0
    });
    game.package.carried = true;
    api.releasePickupAction();
    assert.equal(game.player.carry, false);
    assert.equal(game.package.carried, false);
    for (let frame = 0; frame < 120; frame += 1) api.updatePackage(1 / 60);
    assert.equal(game.mode, "playing", `drop ${attempt + 1} failed the level`);
    assert.ok(game.package.y <= 466.001, `drop ${attempt + 1} tunneled to y=${game.package.y}`);
    assert.equal(game.package.grounded, true);
  }
});

test("tap drops gently while hold and release throws", () => {
  const player = { vx: 120, vy: 0, facing: -1 };
  assert.deepEqual({ ...api.releaseVelocity(player, 0, false) }, { vx: 42, vy: 0 });
  assert.deepEqual({ ...api.releaseVelocity(player, 0.5, true) }, { vx: -325, vy: -255 });

  for (const charge of [0, 0.5]) {
    const game = api.makeGame("base_game", 8);
    api.setGame(game);
    Object.assign(game.player, {
      x: 160, y: 388, vx: 120, vy: 0, facing: -1,
      carry: true, holdPickup: true, pickupStartedCarrying: true, throwCharge: charge
    });
    game.package.carried = true;
    api.releasePickupAction();
    assert.equal(game.package.carried, false);
    assert.equal(game.player.carry, false);
    if (charge === 0) {
      assert.equal(game.package.vx, 42);
      assert.equal(game.package.vy, 0);
    } else {
      assert.equal(game.package.vx, -325);
      assert.equal(game.package.vy, -255);
    }
  }
});

test("moving platforms carry robot, package, and box without drift", () => {
  const game = api.makeGame("base_game", 5);
  api.setGame(game);
  const platform = game.platforms[0];
  const box = { x: platform.x + 82, y: platform.y - 40, w: 40, h: 40, vx: 0, vy: 0, grounded: true };
  game.boxes.push(box);
  const riders = [game.player, game.package, box];
  riders.forEach((body, index) => {
    body.x = platform.x + 10 + index * 34;
    body.y = platform.y - body.h;
    body.vx = 0;
    body.vy = 0;
    body.grounded = true;
  });
  const offsets = riders.map((body) => ({ x: body.x - platform.x, y: body.y - platform.y }));
  for (let frame = 0; frame < 180; frame += 1) {
    api.updateDoorsAndPlatforms(1 / 60);
    api.carryPlatformRiders(1 / 60);
  }
  riders.forEach((body, index) => {
    assert.ok(Math.abs((body.x - platform.x) - offsets[index].x) < 0.001);
    assert.ok(Math.abs((body.y - platform.y) - offsets[index].y) < 0.001);
  });
});

test("Level 12 box repeatedly opens the plate gate and stays in its lane", () => {
  const game = api.makeGame("base_game", 11);
  api.setGame(game);
  for (let cycle = 0; cycle < 5; cycle += 1) {
    game.polarity = -1;
    api.polarityImpulse();
    for (let frame = 0; frame < 180; frame += 1) api.update(1 / 60);
    assert.ok(game.boxes[0].x >= 527 && game.boxes[0].x <= 560.001);
    assert.equal(game.boxes[0].y, 460);
    assert.equal(game.plates[0].pressed, true);
    assert.equal(game.doors[0].open, true);

    game.polarity = 1;
    api.polarityImpulse();
    for (let frame = 0; frame < 180; frame += 1) api.update(1 / 60);
    assert.ok(game.boxes[0].x >= 318 && game.boxes[0].x <= 360);
    assert.equal(game.boxes[0].y, 460);
    assert.equal(game.plates[0].pressed, false);
    assert.equal(game.doors[0].open, false);
  }
});

test("box fallout resets while real fallout fails once", () => {
  const game = api.makeGame("base_game", 11);
  api.setGame(game);
  const box = game.boxes[0];
  box.y = 700;
  box.vx = 400;
  box.vy = 800;
  api.moveBody(box, 0, []);
  assert.equal(box.x, box.startX);
  assert.equal(box.y, box.startY);
  assert.equal(game.mode, "playing");
  assert.equal(game.shake, 0);

  game.player.y = 700;
  api.moveBody(game.player, 0, []);
  const firstMessage = game.message;
  api.failLevel("second failure");
  assert.equal(game.mode, "failed");
  assert.equal(game.failQueued, true);
  assert.match(firstMessage, /robot/i);
  assert.equal(game.message, firstMessage);
  assert.equal(game.shake, 10);
});
