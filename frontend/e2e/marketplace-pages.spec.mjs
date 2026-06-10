import { test, expect } from "@playwright/test";
import { uniqueEmail, registerUser, seedBrowserSession } from "./helpers/api.mjs";

test.describe("Marketplace UI pages", () => {
  test("notifications and AI assistant pages load for signed-in user", async ({
    page,
    request,
  }) => {
    const user = await registerUser(request, { email: uniqueEmail("pages") });
    await seedBrowserSession(page, user.token);

    await page.goto("/notifications");
    await expect(page.getByRole("heading", { name: /notifications/i })).toBeVisible({
      timeout: 20_000,
    });

    await page.goto("/chat");
    await expect(page.getByRole("heading", { name: /TOMATO Assistant/i })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByPlaceholder(/Ask anything/i)).toBeVisible();
  });

  test("home shows food menu section", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#food-display, #explore-menu, .food-display").first()).toBeVisible({
      timeout: 20_000,
    });
  });
});
