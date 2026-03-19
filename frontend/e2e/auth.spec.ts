import { test, expect } from "@playwright/test";

test.describe("Auth modal", () => {
  test("shows login form when no token is stored", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => localStorage.removeItem("lf_token"));
    await page.reload();

    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.locator("#auth-email")).toBeVisible();
    await expect(page.locator("#auth-password")).toBeVisible();
  });
});

test.describe("Rate limit message", () => {
  test("shows 'Limit reached' message on 429 response", async ({ page }) => {
    await page.route("**/api/v1/stories/generate-long-form", async (route) => {
      await route.fulfill({
        status: 429,
        contentType: "application/json",
        headers: { "Retry-After": "Thu, 19 Mar 2026 15:32:00 GMT" },
        body: JSON.stringify({
          detail: "Rate limit exceeded",
          retry_after: "2026-03-19T15:32:00Z",
        }),
      });
    });

    await page.goto("/");
    await page.evaluate(() => localStorage.setItem("lf_token", "fake.jwt.token"));
    await page.reload();

    // Adjust selector to the actual generate button text in VibeController
    const generateBtn = page.getByRole("button", { name: /generate/i }).first();
    await generateBtn.click();

    await expect(
      page.getByText(/Limit reached\. Try again at/i)
    ).toBeVisible({ timeout: 5000 });
  });

  test("clears token and shows login form on 401 response", async ({ page }) => {
    await page.route("**/api/v1/stories/generate-long-form", async (route) => {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Token expired" }),
      });
    });

    await page.goto("/");
    await page.evaluate(() => localStorage.setItem("lf_token", "expired.jwt.token"));
    await page.reload();

    const generateBtn = page.getByRole("button", { name: /generate/i }).first();
    await generateBtn.click();

    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 5000 });
  });
});
