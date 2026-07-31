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
    { name: "Chrome", grep: /@desktop/, use: { ...devices["Desktop Chrome"], channel: "chrome" } },
    { name: "Edge", grep: /@desktop/, use: { ...devices["Desktop Edge"], channel: "msedge" } },
    { name: "Firefox", grep: /@desktop/, use: { ...devices["Desktop Firefox"] } },
    { name: "Safari WebKit", grep: /@desktop/, use: { ...devices["Desktop Safari"] } },
    {
      name: "Phone Landscape",
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
