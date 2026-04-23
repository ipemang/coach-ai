import { defineConfig, devices } from "@playwright/test";
import * as dotenv from "dotenv";
import * as path from "path";

// Load .env from this directory
dotenv.config({ path: path.join(__dirname, ".env") });

const BASE_URL = process.env.FRONTEND_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./specs",
  // Run all tests in a file sequentially (athlete-auth is a serial flow)
  fullyParallel: false,
  // Fail the build on CI if you accidentally left test.only
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],

  use: {
    baseURL: BASE_URL,
    // Always headed so you can see the browser and interact during email steps
    headless: false,
    // Keep browser open long enough for manual email steps
    actionTimeout: 30_000,
    navigationTimeout: 30_000,
    // Record video of every run for debugging
    video: "retain-on-failure",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  // Global test timeout — generous because email delivery can take ~30s
  timeout: 120_000,
});
