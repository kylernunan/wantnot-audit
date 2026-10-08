const { test, expect } = require("@playwright/test");

test("audit brand and product links use the current WantNot origin", async ({ page }) => {
  await page.route("**/config.js", route => route.fulfill({
    contentType: "application/javascript",
    body: "window.WANTNOT_AUDIT_CLIENT_ID = '';",
  }));
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const brand = page.locator("a.brand");
  await expect(brand).toBeVisible();
  await expect(brand).toHaveAttribute("href", "https://wantnot.ebbwater.net/");
  const links = await page.locator("header a[href^='https://']").evaluateAll(
    nodes => nodes.map(node => new URL(node.href).origin));
  expect(links.length).toBeGreaterThan(0);
  expect(new Set(links)).toEqual(new Set(["https://wantnot.ebbwater.net"]));
  await expect(page.locator("a[href^='https://wantnot.nunan.com']")).toHaveCount(0);
  await page.route("https://wantnot.ebbwater.net/", route => route.fulfill({
    contentType: "text/html", body: "<title>WantNot product destination</title>",
  }));
  await brand.click();
  await expect(page).toHaveURL("https://wantnot.ebbwater.net/");
});