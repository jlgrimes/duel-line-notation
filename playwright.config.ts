import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.E2E_PORT ?? 4173);
const baseURL = `http://127.0.0.1:${port}`;

/**
 * Some environments ship a preinstalled Chromium whose build does not match the pinned
 * Playwright version. Point `CHROMIUM_PATH` at that binary to run against it instead of
 * downloading a second copy. CI installs the matching build and leaves this unset.
 */
const executablePath = process.env.CHROMIUM_PATH;
const launchOptions = executablePath ? { executablePath } : {};

export default defineConfig({
  testDir: "e2e",
  // The simulator compiles a real WebAssembly core per page, so keep the fleet small.
  workers: process.env.CI ? 2 : undefined,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: { baseURL, trace: "retain-on-failure" },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], launchOptions },
    },
    {
      // A phone viewport with touch. This is Chromium, not Safari, so it does not
      // discharge the manual mobile-Safari check in CHECKLIST.md.
      name: "mobile",
      use: { ...devices["Pixel 5"], launchOptions },
    },
  ],
  webServer: {
    // The build runs here, not in the npm script, so a bare `npx playwright test` cannot
    // silently serve a stale bundle and report a passing suite against old code.
    command: `npm run build:web && npx vite preview --port ${port} --strictPort --host 127.0.0.1`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
