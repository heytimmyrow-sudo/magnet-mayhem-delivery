import { expect, test } from "@playwright/test";

const LEVEL_IDS = [
  "training_pickup", "first_flip", "magnet_lift", "soft_spikes", "polarity_door",
  "moving_bridge", "plate_gate", "moving_charge", "throw_lane", "crusher_intro",
  "electric_choice", "box_button", "combo_bridge", "combo_gate", "final_sort"
];
const EXPANSION_IDS = [
  "base_game", "factory_after_dark", "frozen_warehouse", "zero_gravity_shipping",
  "robot_recycling_center", "future_pack_slot_01"
];
const browserErrors = new WeakMap();

test.beforeEach(async ({ page }) => {
  const errors = [];
  browserErrors.set(page, errors);
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
});

test.afterEach(async ({ page }) => {
  expect(browserErrors.get(page), "browser console and page errors").toEqual([]);
});

async function openTestGame(page) {
  await page.goto("/?test=1");
  await page.waitForFunction(() => Boolean(window.__MAGNET_MAYHEM_TEST__));
}

function overlaps(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function inBounds(body, width = 960, height = 540) {
  return body.x >= 0 && body.y >= 0 && body.x + body.w <= width && body.y + body.h <= height;
}

function hasNavigablePath(level, start, size) {
  const step = 8;
  const obstacles = [...(level.walls || []), ...(level.platforms || [])];
  const maxX = 960 - size.w;
  const maxY = 540 - size.h;
  const key = (x, y) => `${x},${y}`;
  const snap = (value, max) => Math.max(0, Math.min(max, Math.round(value / step) * step));
  const valid = (x, y) => x >= 0 && y >= 0 && x <= maxX && y <= maxY
    && !obstacles.some((solid) => overlaps({ x, y, ...size }, solid));
  const startX = snap(start.x, maxX);
  const startY = snap(start.y, maxY);
  const queue = [[startX, startY]];
  const visited = new Set([key(startX, startY)]);

  while (queue.length) {
    const [x, y] = queue.shift();
    const centerX = x + size.w / 2;
    const centerY = y + size.h / 2;
    if (centerX >= level.delivery.x && centerX <= level.delivery.x + level.delivery.w
      && centerY >= level.delivery.y && centerY <= level.delivery.y + level.delivery.h) return true;
    for (const [nextX, nextY] of [[x + step, y], [x - step, y], [x, y + step], [x, y - step]]) {
      const cell = key(nextX, nextY);
      if (visited.has(cell) || !valid(nextX, nextY)) continue;
      visited.add(cell);
      queue.push([nextX, nextY]);
    }
  }
  return false;
}

for (const [index, levelId] of LEVEL_IDS.entries()) {
  test(`Level ${String(index + 1).padStart(2, "0")} ${levelId} loads, spawns safely, and has a reachable delivery zone`, async ({ page }) => {
    await openTestGame(page);
    const result = await page.evaluate(({ index }) => {
      const api = window.__MAGNET_MAYHEM_TEST__;
      const game = api.start(index);
      api.draw();
      const initial = api.snapshot();
      game.player.x += 123;
      game.player.vx = 777;
      game.player.grounded = true;
      game.player.carry = true;
      game.package.y += 91;
      game.package.vy = -333;
      game.package.grounded = true;
      game.package.carried = true;
      game.package.health = 1;
      game.elapsed = 12;
      game.failQueued = true;
      game.polarity = -1;
      game.platforms.forEach((platform) => {
        platform.x += 47;
        platform.y -= 19;
        platform.prevX -= 11;
        platform.prevY += 9;
        platform.deltaX = 58;
        platform.deltaY = -28;
      });
      game.doors.forEach((door) => { door.open = true; door.requestedOpen = true; door.openAmount = 1; });
      game.boxes.forEach((box) => { box.x += 81; box.y -= 33; box.vx = 500; box.grounded = true; });
      game.hazards.forEach((hazard) => { hazard.x += 29; hazard.y += 17; });
      game.plates.forEach((plate) => { plate.pressed = true; plate.releaseTimer = 1; });
      api.restart();
      const restarted = api.snapshot();
      return { level: api.levels[index], initial, restarted, mode: api.game.mode };
    }, { index });

    expect(result.level.id).toBe(levelId);
    expect(result.mode).toBe("playing");
    expect(inBounds({ ...result.level.spawn, w: 32, h: 42 })).toBe(true);
    expect(inBounds({ ...result.level.package, w: 34, h: 34 })).toBe(true);
    expect((result.level.walls || []).some((solid) => overlaps({ ...result.level.spawn, w: 32, h: 42 }, solid))).toBe(false);
    expect((result.level.walls || []).some((solid) => overlaps({ ...result.level.package, w: 34, h: 34 }, solid))).toBe(false);
    expect(inBounds(result.level.delivery)).toBe(true);
    expect(hasNavigablePath(result.level, result.level.spawn, { w: 32, h: 42 })).toBe(true);
    expect(hasNavigablePath(result.level, result.level.package, { w: 34, h: 34 })).toBe(true);
    expect(result.restarted).toEqual(result.initial);
  });
}

test("dropping the package on flat ground 20 times never tunnels through the floor", async ({ page }) => {
  await openTestGame(page);
  const drops = await page.evaluate(() => {
    const api = window.__MAGNET_MAYHEM_TEST__;
    const results = [];
    for (let attempt = 0; attempt < 20; attempt++) {
      const game = api.start(0);
      Object.assign(game.player, {
        x: 80 + (attempt % 8) * 65,
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
      api.step(120);
      results.push({ mode: game.mode, y: game.package.y, grounded: game.package.grounded, carried: game.package.carried });
    }
    return results;
  });

  for (const [index, drop] of drops.entries()) {
    expect(drop.mode, `drop ${index + 1} mode`).toBe("playing");
    expect(drop.carried, `drop ${index + 1} released`).toBe(false);
    expect(drop.y, `drop ${index + 1} package y`).toBeLessThanOrEqual(466.001);
    expect(drop.grounded, `drop ${index + 1} grounded`).toBe(true);
  }
});

test("charged throws give the package forward and upward velocity", async ({ page }) => {
  await openTestGame(page);
  const throws = await page.evaluate(() => {
    const api = window.__MAGNET_MAYHEM_TEST__;
    return [-1, 1].map((facing) => {
      const game = api.start(8);
      Object.assign(game.player, {
        x: 160,
        y: 458,
        vx: facing * 90,
        vy: 0,
        facing,
        grounded: true,
        carry: true,
        holdPickup: true,
        pickupStartedCarrying: true,
        throwCharge: .6
      });
      game.package.carried = true;
      api.releasePickupAction();
      return { facing, vx: game.package.vx, vy: game.package.vy, carried: game.package.carried };
    });
  });

  for (const thrown of throws) {
    expect(thrown.carried).toBe(false);
    expect(thrown.vx * thrown.facing).toBeGreaterThan(0);
    expect(thrown.vy).toBeLessThan(0);
  }
});

test("moving platforms carry the player, package, and metal boxes without drift", async ({ page }) => {
  await openTestGame(page);
  const drift = await page.evaluate(() => {
    const api = window.__MAGNET_MAYHEM_TEST__;
    const game = api.start(5);
    const platform = game.platforms[0];
    const box = { x: 0, y: 0, w: 40, h: 40, vx: 0, vy: 0, grounded: true, magnetic: true, startX: 0, startY: 0 };
    game.boxes.push(box);
    const riders = [game.player, game.package, box];
    let cursor = platform.x + 6;
    for (const rider of riders) {
      rider.x = cursor;
      rider.y = platform.y - rider.h;
      rider.vx = 0;
      rider.vy = 0;
      rider.grounded = true;
      cursor += rider.w + 5;
    }
    const offsets = riders.map((rider) => ({ x: rider.x - platform.x, y: rider.y - platform.y }));
    for (let frame = 0; frame < 180; frame++) {
      api.updateDoorsAndPlatforms(1 / 60);
      api.carryPlatformRiders(1 / 60);
    }
    return riders.map((rider, index) => ({
      x: (rider.x - platform.x) - offsets[index].x,
      y: (rider.y - platform.y) - offsets[index].y
    }));
  });

  for (const riderDrift of drift) {
    expect(Math.abs(riderDrift.x)).toBeLessThan(.001);
    expect(Math.abs(riderDrift.y)).toBeLessThan(.001);
  }
});

test("metal boxes repeatedly press buttons and open linked barriers", async ({ page }) => {
  await openTestGame(page);
  const mechanisms = await page.evaluate(() => {
    const api = window.__MAGNET_MAYHEM_TEST__;
    const results = [];
    for (const levelIndex of [11, 13, 14]) {
      const game = api.start(levelIndex);
      const box = game.boxes[0];
      const plate = game.plates[0];
      const door = game.doors.find((candidate) => candidate.openPolarity === plate.id);
      const cycles = [];
      for (let cycle = 0; cycle < 5; cycle++) {
        Object.assign(box, {
          x: plate.x + (plate.w - box.w) / 2,
          y: plate.y - box.h,
          vx: 0,
          vy: 0,
          grounded: true
        });
        for (let frame = 0; frame < 10; frame++) {
          api.updatePlates(1 / 60);
          api.updateDoorsAndPlatforms(1 / 60);
        }
        const pressed = plate.pressed && door?.open;
        Object.assign(box, { x: 24, y: 460, vx: 0, vy: 0, grounded: true });
        for (let frame = 0; frame < 20; frame++) {
          api.updatePlates(1 / 60);
          api.updateDoorsAndPlatforms(1 / 60);
        }
        cycles.push({ pressed, released: !plate.pressed && !door?.open });
      }
      results.push({ levelId: game.level.id, linked: Boolean(door), cycles });
    }
    return results;
  });

  for (const mechanism of mechanisms) {
    expect(mechanism.linked, `${mechanism.levelId} linked barrier`).toBe(true);
    for (const cycle of mechanism.cycles) {
      expect(cycle.pressed, `${mechanism.levelId} opens`).toBe(true);
      expect(cycle.released, `${mechanism.levelId} closes`).toBe(true);
    }
  }
});

test("polarity reverses magnetic force and velocity remains capped", async ({ page }) => {
  await openTestGame(page);
  const probes = await page.evaluate(() => {
    const api = window.__MAGNET_MAYHEM_TEST__;
    const results = [];
    api.levels.forEach((level, levelIndex) => {
      if (!level.magnets?.length) return;
      const game = api.start(levelIndex);
      const targets = [game.package, ...game.boxes];
      targets.forEach((target, targetIndex) => {
        const magnet = level.magnets[0];
        target.x = Math.max(24, Math.min(api.width - target.w - 24, magnet.x - 120 - target.w / 2));
        target.y = Math.max(24, Math.min(api.height - target.h - 60, magnet.y - target.h / 2));
        game.polarity = magnet.polarity;
        target.vx = 0;
        target.vy = 0;
        api.applyMagnetism(target, 1 / 60, game.boxes.includes(target) ? .8 : 1);
        const push = { vx: target.vx, vy: target.vy };
        game.polarity = -magnet.polarity;
        target.vx = 0;
        target.vy = 0;
        api.applyMagnetism(target, 1 / 60, game.boxes.includes(target) ? .8 : 1);
        const pull = { vx: target.vx, vy: target.vy };
        for (let frame = 0; frame < 300; frame++) api.applyMagnetism(target, 1 / 60, game.boxes.includes(target) ? .8 : 1);
        const sustainedSpeed = Math.hypot(target.vx, target.vy);
        target.vx = 0;
        target.vy = 0;
        api.polarityImpulse();
        const impulseSpeed = Math.hypot(target.vx, target.vy);
        results.push({
          levelId: level.id,
          target: targetIndex === 0 ? "package" : `box ${targetIndex}`,
          push,
          pull,
          sustainedSpeed,
          impulseSpeed,
          sustainedCap: game.boxes.includes(target) ? api.constants.boxSpeedCap * Math.SQRT2 : api.constants.packageSpeedCap * Math.SQRT2,
          impulseCap: (game.boxes.includes(target) ? api.constants.boxSpeedCap : api.constants.impulseSpeedCap) * Math.SQRT2
        });
      });
    });
    return results;
  });

  for (const probe of probes) {
    const pushMagnitude = Math.hypot(probe.push.vx, probe.push.vy);
    const pullMagnitude = Math.hypot(probe.pull.vx, probe.pull.vy);
    expect(pushMagnitude, `${probe.levelId} ${probe.target} push force`).toBeGreaterThan(.01);
    expect(pullMagnitude, `${probe.levelId} ${probe.target} pull force`).toBeGreaterThan(.01);
    expect(probe.push.vx * probe.pull.vx + probe.push.vy * probe.pull.vy, `${probe.levelId} ${probe.target} force direction`).toBeLessThan(0);
    expect(Number.isFinite(probe.sustainedSpeed)).toBe(true);
    expect(Number.isFinite(probe.impulseSpeed)).toBe(true);
    expect(probe.sustainedSpeed).toBeLessThanOrEqual(probe.sustainedCap + .001);
    expect(probe.impulseSpeed).toBeLessThanOrEqual(probe.impulseCap + .001);
  }
});

test("save data, permanent level IDs, and expansion IDs remain unchanged", async ({ page }) => {
  await page.goto("/");
  const sentinel = {
    version: 2,
    unlockedExpansions: ["base_game"],
    completedLevels: { "base_game:training_pickup": true },
    bestTimes: { "base_game:training_pickup": 12.5 },
    stamps: { "base_game:training_pickup": 3 },
    settings: { sound: false, music: false, shake: false },
    tutorial: { skipped: true, completed: { training_pickup: true } }
  };
  const expectedRaw = JSON.stringify(sentinel);
  await page.evaluate((raw) => localStorage.setItem("magnetMayhemDelivery.save", raw), expectedRaw);
  await page.goto("/?test=1");
  await page.waitForFunction(() => Boolean(window.__MAGNET_MAYHEM_TEST__));

  const result = await page.evaluate(() => {
    const api = window.__MAGNET_MAYHEM_TEST__;
    for (let index = 0; index < api.levels.length; index++) {
      api.start(index);
      api.restart();
    }
    return {
      raw: localStorage.getItem("magnetMayhemDelivery.save"),
      levelIds: api.levels.map((level) => level.id),
      expansionIds: api.expansionIds
    };
  });

  expect(result.raw).toBe(expectedRaw);
  expect(result.levelIds).toEqual(LEVEL_IDS);
  expect(result.expansionIds).toEqual(EXPANSION_IDS);
});
