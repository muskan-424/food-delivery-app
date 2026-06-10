import { test, expect } from "@playwright/test";
import { uniqueEmail, registerUser, seedBrowserSession } from "./helpers/api.mjs";

test.describe("Auth happy path", () => {
  test("register via API then browse logged-in UI", async ({ page, request }) => {
    const user = await registerUser(request, {
      email: uniqueEmail("user"),
      name: "Playwright User",
    });

    await seedBrowserSession(page, user.token);

    await expect(page.locator('a[href="/wishlist"]').first()).toBeVisible();
    await page.locator(".navbar-profile").hover();
    await expect(page.getByText("Orders")).toBeVisible();
    await expect(page.getByText("AI Assistant")).toBeVisible();
  });

  test("login via sign-in popup", async ({ page, request }) => {
    const email = uniqueEmail("login");
    const password = "SmokeTest1!";
    await registerUser(request, { email, password, name: "Login UI User" });

    await page.goto("/");
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.locator('input[name="email"]').fill(email);
    await page.locator('input[name="password"]').fill(password);
    await page.locator('form.login-popup-container input[type="checkbox"]').check();
    await page.getByRole("button", { name: /^Login$/i }).click();

    await expect(page.locator('a[href="/wishlist"]').first()).toBeVisible({
      timeout: 15_000,
    });
  });
});
