import { defineConfig } from "@playwright/test";

const port = 4187;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  outputDir: "test-results",
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report", open: "never" }]
  ],
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
  }
});
