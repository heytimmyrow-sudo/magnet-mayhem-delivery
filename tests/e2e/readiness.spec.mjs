import { expect, test } from "@playwright/test";

const LEVEL_IDS = [
  "training_pickup", "first_flip", "magnet_lift", "soft_spikes", "polarity_door",
  "moving_bridge", "plate_gate", "moving_charge", "throw_lane", "crusher_intro",
  "electric_choice", "box_button", "combo_bridge", "combo_gate", "final_sort"
];
const errorsFor = new WeakMap();

test.beforeEach(async ({ page }) => {
  const errors = [];
  errorsFor.set(page, errors);
  page.on("console", (message) => { if (message.type() === "error") errors.push(`console: ${message.text()}`); });
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
});

test.afterEach(async ({ page }) => {
  expect(errorsFor.get(page), "browser console and page errors").toEqual([]);
});

async function openFreshGame(page) {
  await page.goto("/?test=1");
  await page.waitForFunction(() => Boolean(window.__MAGNET_MAYHEM_TEST__));
  await expect(page.locator("#loadingScreen")).toHaveClass(/hidden/);
}

async function dispatchPointer(locator, type, point, pointerId = 7) {
  await locator.dispatchEvent(type, { pointerId, pointerType: "touch", isPrimary: true, bubbles: true, ...point });
}

test("@desktop first-time players enter Level 1 and local Poki remains ad-free", async ({ page }) => {
  await openFreshGame(page);
  await expect(page.locator("#gameScreen")).not.toHaveClass(/hidden/);
  const state = await page.evaluate(async () => ({
    id: window.__MAGNET_MAYHEM_TEST__.game.level.id,
    platform: window.__MAGNET_MAYHEM_TEST__.platform,
    adShown: await window.__MAGNET_MAYHEM_TEST__.commercialBreak()
  }));
  expect(state.id).toBe("training_pickup");
  expect(state.platform.local).toBe(true);
  expect(state.platform.enabled).toBe(false);
  expect(state.adShown).toBe(false);
});

test("@desktop every level loads, renders, and preserves the save payload", async ({ page }) => {
  await openFreshGame(page);
  const results = await page.evaluate((ids) => {
    const api = window.__MAGNET_MAYHEM_TEST__;
    const rawBefore = localStorage.getItem("magnetMayhemDelivery.save");
    const levels = ids.map((id, index) => {
      const game = api.start(index);
      const pixels = document.querySelector("#gameCanvas").getContext("2d").getImageData(0, 0, 960, 540).data;
      let colored = 0;
      for (let offset = 3; offset < pixels.length; offset += 4096) colored += pixels[offset] > 0 ? 1 : 0;
      return { id: game.level.id, player: game.player, package: game.package, delivery: game.level.delivery, colored };
    });
    return { levels, rawBefore, rawAfter: localStorage.getItem("magnetMayhemDelivery.save") };
  }, LEVEL_IDS);
  expect(results.levels.map(({ id }) => id)).toEqual(LEVEL_IDS);
  for (const level of results.levels) {
    for (const body of [level.player, level.package, level.delivery]) {
      expect(body.x).toBeGreaterThanOrEqual(0);
      expect(body.y).toBeGreaterThanOrEqual(0);
      expect(body.x + body.w).toBeLessThanOrEqual(960);
      expect(body.y + body.h).toBeLessThanOrEqual(540);
    }
    expect(level.colored).toBeGreaterThan(10);
  }
  expect(results.rawAfter).toBe(results.rawBefore);
});

test("@desktop returning menus support keyboard focus and keyboard play remains intact", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("magnetMayhemDelivery.save", JSON.stringify({
    version: 2,
    unlockedExpansions: ["base_game"],
    completedLevels: { "base_game:training_pickup": true },
    bestTimes: { "base_game:training_pickup": 18.5 },
    stamps: { "base_game:training_pickup": 3 },
    settings: { sound: false, music: false, shake: true },
    tutorial: { skipped: true, completed: { training_pickup: true } }
  })));
  await openFreshGame(page);
  await expect(page.locator("#titleScreen")).not.toHaveClass(/hidden/);
  await expect(page.locator("#playBtn")).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("#levelSelectBtn")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#menuScreen")).not.toHaveClass(/hidden/);
  await page.evaluate(() => window.__MAGNET_MAYHEM_TEST__.start(0));
  await page.keyboard.down("d");
  await page.evaluate(() => window.__MAGNET_MAYHEM_TEST__.step(8));
  await page.keyboard.up("d");
  const moved = await page.evaluate(() => window.__MAGNET_MAYHEM_TEST__.game.player.vx);
  expect(moved).toBeGreaterThan(0);
  const before = await page.evaluate(() => window.__MAGNET_MAYHEM_TEST__.game.polarity);
  await page.keyboard.press("f");
  expect(await page.evaluate(() => window.__MAGNET_MAYHEM_TEST__.game.polarity)).toBe(-before);
});

test("@desktop losing focus pauses gameplay, timers, audio lifecycle, and input", async ({ page }) => {
  await openFreshGame(page);
  const before = await page.evaluate(() => {
    const api = window.__MAGNET_MAYHEM_TEST__;
    api.step(20);
    api.pauseForLifecycle();
    const elapsed = api.game.elapsed;
    api.step(20);
    return { elapsed, after: api.game.elapsed, mode: api.game.mode, input: api.input, platform: api.platform };
  });
  expect(before.mode).toBe("paused");
  expect(before.after).toBe(before.elapsed);
  expect(before.input.enabled).toBe(false);
  expect(before.platform.playing).toBe(false);
  await page.getByRole("button", { name: "Resume" }).click();
  expect(await page.evaluate(() => window.__MAGNET_MAYHEM_TEST__.game.mode)).toBe("playing");
});

test("@desktop fullscreen is safely handled and throw velocity stays forward and upward", async ({ page }) => {
  await openFreshGame(page);
  await page.evaluate(() => window.__MAGNET_MAYHEM_TEST__.start(8));
  const velocity = await page.evaluate(() => window.__MAGNET_MAYHEM_TEST__.throwVelocity({ vx: 20, facing: 1, touchThrowAim: null }, .65, true));
  expect(velocity.vx).toBeGreaterThan(0);
  expect(velocity.vy).toBeLessThan(0);
  await page.evaluate(() => document.querySelector("#fullscreenBtn").click());
});

test("@mobile in-stage controls fit the viewport with no footer controls", async ({ page }) => {
  await openFreshGame(page);
  await expect(page.locator(".touch-controls")).toHaveCount(0);
  await expect(page.locator("#touchLayer")).toBeVisible();
  await expect(page.locator("#mobileTutorial")).toBeVisible();
  const layout = await page.evaluate(() => {
    const viewport = { width: innerWidth, height: innerHeight };
    const ids = ["gameStage", "touchPolarityBtn", "restartBtn", "pauseBtn", "mobileTutorial"];
    return {
      viewport,
      scroll: { width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight },
      boxes: Object.fromEntries(ids.map((id) => [id, document.querySelector(`#${id}`).getBoundingClientRect().toJSON()]))
    };
  });
  expect(layout.scroll.width).toBeLessThanOrEqual(layout.viewport.width);
  expect(layout.scroll.height).toBeLessThanOrEqual(layout.viewport.height);
  for (const box of Object.values(layout.boxes)) {
    expect(box.left).toBeGreaterThanOrEqual(-1);
    expect(box.top).toBeGreaterThanOrEqual(-1);
    expect(box.right).toBeLessThanOrEqual(layout.viewport.width + 1);
    expect(box.bottom).toBeLessThanOrEqual(layout.viewport.height + 1);
  }
});

test("@mobile drag movement, jump tap, and polarity button respond", async ({ page }) => {
  await openFreshGame(page);
  await page.evaluate(() => window.__MAGNET_MAYHEM_TEST__.dismissMobileTutorial());
  const move = page.locator("#moveZone");
  const moveBox = await move.boundingBox();
  const y = moveBox.y + moveBox.height / 2;
  await dispatchPointer(move, "pointerdown", { clientX: moveBox.x + 40, clientY: y }, 1);
  await dispatchPointer(move, "pointermove", { clientX: moveBox.x + 130, clientY: y }, 1);
  expect(await page.evaluate(() => window.__MAGNET_MAYHEM_TEST__.input.touchMoveAxis)).toBeGreaterThan(.8);
  await dispatchPointer(move, "pointerup", { clientX: moveBox.x + 130, clientY: y }, 1);
  expect(await page.evaluate(() => window.__MAGNET_MAYHEM_TEST__.input.touchMoveAxis)).toBe(0);

  const action = page.locator("#actionZone");
  const actionBox = await action.boundingBox();
  await page.evaluate(() => { const player = window.__MAGNET_MAYHEM_TEST__.game.player; player.grounded = true; player.coyote = .1; });
  await dispatchPointer(action, "pointerdown", { clientX: actionBox.x + actionBox.width - 30, clientY: actionBox.y + 40 }, 2);
  await dispatchPointer(action, "pointerup", { clientX: actionBox.x + actionBox.width - 30, clientY: actionBox.y + 40 }, 2);
  await page.evaluate(() => window.__MAGNET_MAYHEM_TEST__.step(1));
  expect(await page.evaluate(() => window.__MAGNET_MAYHEM_TEST__.game.player.vy)).toBeLessThan(0);

  const polarity = await page.evaluate(() => window.__MAGNET_MAYHEM_TEST__.game.polarity);
  await page.locator("#touchPolarityBtn").tap();
  expect(await page.evaluate(() => window.__MAGNET_MAYHEM_TEST__.game.polarity)).toBe(-polarity);
});

test("@mobile package taps pick up and drop while a swipe throws", async ({ page }) => {
  await openFreshGame(page);
  await page.evaluate(() => {
    window.__MAGNET_MAYHEM_TEST__.dismissMobileTutorial();
    const game = window.__MAGNET_MAYHEM_TEST__.game;
    Object.assign(game.player, { x: 190, y: 430, vx: 0, vy: 0, grounded: true });
  });
  const action = page.locator("#actionZone");
  const stage = await page.locator("#gameStage").boundingBox();
  const packagePoint = await page.evaluate(({ x, y, width, height }) => {
    const pack = window.__MAGNET_MAYHEM_TEST__.game.package;
    return { clientX: x + (pack.x + pack.w / 2) / 960 * width, clientY: y + (pack.y + pack.h / 2) / 540 * height };
  }, stage);

  await dispatchPointer(action, "pointerdown", packagePoint, 3);
  await dispatchPointer(action, "pointerup", packagePoint, 3);
  expect(await page.evaluate(() => window.__MAGNET_MAYHEM_TEST__.game.player.carry)).toBe(true);

  await dispatchPointer(action, "pointerdown", packagePoint, 4);
  await dispatchPointer(action, "pointerup", packagePoint, 4);
  expect(await page.evaluate(() => window.__MAGNET_MAYHEM_TEST__.game.player.carry)).toBe(false);

  await page.evaluate(() => {
    const game = window.__MAGNET_MAYHEM_TEST__.game;
    game.player.carry = true;
    game.package.carried = true;
    game.player.pickupCooldown = 0;
    game.package.pickupCooldown = 0;
  });
  await dispatchPointer(action, "pointerdown", packagePoint, 5);
  await dispatchPointer(action, "pointermove", { clientX: packagePoint.clientX + 120, clientY: packagePoint.clientY - 90 }, 5);
  await dispatchPointer(action, "pointerup", { clientX: packagePoint.clientX + 120, clientY: packagePoint.clientY - 90 }, 5);
  const thrown = await page.evaluate(() => ({
    carried: window.__MAGNET_MAYHEM_TEST__.game.package.carried,
    vx: window.__MAGNET_MAYHEM_TEST__.game.package.vx,
    vy: window.__MAGNET_MAYHEM_TEST__.game.package.vy
  }));
  expect(thrown.carried).toBe(false);
  expect(thrown.vx).toBeGreaterThan(0);
  expect(thrown.vy).toBeLessThan(0);
});
