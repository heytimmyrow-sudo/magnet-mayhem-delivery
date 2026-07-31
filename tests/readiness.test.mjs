import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { expansionRegistry } from "../expansions/expansion-registry.js";
import { STRINGS } from "../localization/en.js";

const rootFile = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const levels = expansionRegistry[0].levels;
const levelIds = [
  "training_pickup", "first_flip", "magnet_lift", "soft_spikes", "polarity_door",
  "moving_bridge", "plate_gate", "moving_charge", "throw_lane", "crusher_intro",
  "electric_choice", "box_button", "combo_bridge", "combo_gate", "final_sort"
];
const expansionIds = [
  "base_game", "factory_after_dark", "frozen_warehouse", "zero_gravity_shipping",
  "robot_recycling_center", "future_pack_slot_01"
];
const overlaps = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

test("all 15 permanent level IDs stay unchanged", () => {
  assert.deepEqual(levels.map(({ id }) => id), levelIds);
});

test("all permanent expansion IDs stay unchanged", () => {
  assert.deepEqual(expansionRegistry.map(({ id }) => id), expansionIds);
});

test("save keys and schema version stay unchanged", async () => {
  const source = await rootFile("save-system.js");
  assert.match(source, /SAVE_KEY = "magnetMayhemDelivery\.save"/);
  assert.match(source, /BACKUP_KEY = "magnetMayhemDelivery\.save\.backup"/);
  assert.match(source, /SAVE_VERSION = 2/);
});

test("all visible level and expansion names live in the localization catalog", () => {
  for (const id of levelIds) assert.ok(STRINGS.levels[id]?.name && STRINGS.levels[id]?.hint, id);
  for (const id of expansionIds) assert.ok(STRINGS.expansions[id]?.name && STRINGS.expansions[id]?.description, id);
});

test("all spawns and delivery zones are inside the 960 by 540 playfield", () => {
  for (const level of levels) {
    for (const [label, body] of [["player", { ...level.spawn, w: 32, h: 42 }], ["package", { ...level.package, w: 34, h: 34 }], ["delivery", level.delivery]]) {
      assert.ok(body.x >= 0 && body.y >= 0 && body.x + body.w <= 960 && body.y + body.h <= 540, `${level.id} ${label}`);
    }
  }
});

test("delivery zones have usable space outside solid geometry", () => {
  for (const level of levels) {
    const solids = [...(level.walls || []), ...(level.platforms || [])];
    const usable = [];
    for (let y = level.delivery.y + 4; y < level.delivery.y + level.delivery.h; y += 8) {
      for (let x = level.delivery.x + 4; x < level.delivery.x + level.delivery.w; x += 8) {
        if (!solids.some((solid) => overlaps({ x, y, w: 1, h: 1 }, solid))) usable.push({ x, y });
      }
    }
    assert.ok(usable.length >= 8, `${level.id} delivery is trapped`);
  }
});

test("the mobile footer is removed and in-stage gesture controls are present", async () => {
  const html = await rootFile("index.html");
  assert.doesNotMatch(html, /class="touch-controls"/);
  for (const id of ["moveZone", "actionZone", "touchPolarityBtn", "mobileTutorial"]) assert.match(html, new RegExp(`id="${id}"`));
});

test("the Poki wrapper is local-safe and the build stays within its size budget", async () => {
  const wrapper = await rootFile("poki-wrapper.js");
  const report = JSON.parse(await rootFile("dist/build-size-report.json"));
  assert.match(wrapper, /gameLoadingFinished/);
  assert.match(wrapper, /gameplayStart/);
  assert.match(wrapper, /gameplayStop/);
  assert.match(wrapper, /commercialBreak/);
  assert.match(wrapper, /this\.local/);
  assert.equal(report.withinBudget, true);
  assert.ok(report.totals.bytes <= report.limits.initialBytes);
});
