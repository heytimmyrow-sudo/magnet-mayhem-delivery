import { defineConfig, devices } from "@playwright/test";

const port = 4193;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  outputDir: "test-results",
  reporter: [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    viewport: { width: 1280, height: 800 },
    screenshot: "only-on-failure",
    trace: "retain-on-failure"
  },
  webServer: {
    command: `node tests/serve.mjs --port=${port}`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
    timeout: 15_000
  },
  projects: [
    { name: "Gameplay Chromium", testMatch: /gameplay\.spec\.mjs/, use: { ...devices["Desktop Chrome"] } },
    { name: "Chrome", testMatch: /readiness\.spec\.mjs/, grep: /@desktop/, use: { ...devices["Desktop Chrome"], channel: "chrome" } },
    { name: "Edge", testMatch: /readiness\.spec\.mjs/, grep: /@desktop/, use: { ...devices["Desktop Edge"], channel: "msedge" } },
    { name: "Firefox", testMatch: /readiness\.spec\.mjs/, grep: /@desktop/, use: { ...devices["Desktop Firefox"] } },
    { name: "Safari WebKit", testMatch: /readiness\.spec\.mjs/, grep: /@desktop/, use: { ...devices["Desktop Safari"] } },
    {
      name: "Phone Landscape",
      testMatch: /readiness\.spec\.mjs/,
      grep: /@mobile/,
      use: {
        browserName: "chromium",
        viewport: { width: 844, height: 390 },
        screen: { width: 844, height: 390 },
        deviceScaleFactor: 2,
        hasTouch: true,
        isMobile: true
      }
    },
    {
      name: "Phone Portrait",
      testMatch: /readiness\.spec\.mjs/,
      grep: /@mobile/,
      use: {
        browserName: "chromium",
        viewport: { width: 390, height: 844 },
        screen: { width: 390, height: 844 },
        deviceScaleFactor: 2,
        hasTouch: true,
        isMobile: true
      }
    }
  ]
});
