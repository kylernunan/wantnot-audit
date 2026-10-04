// The same tests run before deployment and against its preview URL.
const baseURL = process.env.PREVIEW_URL || "http://127.0.0.1:8902";
const python = process.env.AUDIT_TEST_PYTHON || "python3";

/** @type {import('@playwright/test').PlaywrightTestConfig} */
module.exports = {
  testDir: "./e2e",
  timeout: 60000,
  retries: 0,
  workers: 1,
  reporter: "line",
  use: {
    baseURL,
    reducedMotion: "reduce",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
  webServer: process.env.PREVIEW_URL
    ? undefined
    : {
        command: `"${python}" -m http.server 8902 --bind 127.0.0.1`,
        url: baseURL,
        reuseExistingServer: false,
        timeout: 15000,
      },
};
