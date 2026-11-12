import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  workers: 2,
  use: {
    baseURL: "http://127.0.0.1:3000",
    timezoneId: "America/Lima",
    launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH },
    trace: "retain-on-failure",
  },
  projects: [
    { name: "360-light", use: { viewport: { width: 360, height: 800 }, colorScheme: "light" } },
    { name: "360-dark", use: { viewport: { width: 360, height: 800 }, colorScheme: "dark" } },
    { name: "768-light", use: { viewport: { width: 768, height: 1024 }, colorScheme: "light" } },
    { name: "768-dark", use: { viewport: { width: 768, height: 1024 }, colorScheme: "dark" } },
  ],
  webServer: { command: "npm run dev", url: "http://127.0.0.1:3000", reuseExistingServer: !process.env.CI },
});
