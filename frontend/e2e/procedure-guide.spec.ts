import { expect, test } from "@playwright/test";

test("walks through the withdrawal guide on a mobile viewport", async ({ page }, testInfo) => {
  await page.route("https://accounts.google.com/**", (route) => route.abort());
  await page.addInitScript(() => {
    const token = `header.${btoa(JSON.stringify({ sub: "procedure-student" }))}.signature`;
    localStorage.setItem("campusunsa_token", token);
  });
  await page.route("**/api/v1/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/auth/me")) {
      return route.fulfill({
        json: { id: "procedure-student", email: "student@unsa.edu.pe", role: "student", is_active: true },
      });
    }
    return route.fulfill({ json: path.endsWith("/status") ? {} : [] });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Hugo", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Hugo", exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("hugo.png") });
  await page.getByRole("button", { name: "Guía de trámites" }).click();
  await expect(page.getByRole("heading", { name: "Guía de trámites" })).toBeFocused();
  await page.getByRole("button", { name: /^Retiro de curso/ }).click();
  await expect(page.getByRole("heading", { name: "Retiro de curso" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Requisitos" })).toBeFocused();
  await page.getByRole("button", { name: "Siguiente" }).click();
  await expect(page.getByRole("heading", { name: "Plazo de presentación" })).toBeFocused();
  await expect(page.getByRole("link", { name: /cronograma oficial/i })).toBeVisible();
  await page.getByRole("button", { name: "Siguiente" }).click();
  await expect(page.getByRole("heading", { name: "Pago y código" })).toBeFocused();
  await expect(page.getByRole("link", { name: /UNSAPay/i })).toBeVisible();
  await page.getByRole("button", { name: "Siguiente" }).click();
  await expect(page.getByRole("heading", { name: "Formulario y entrega" })).toBeFocused();
  await expect(page.getByRole("link", { name: /ficha oficial/i })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("withdrawal.png") });
  await page.getByRole("button", { name: "Volver a trámites" }).click();
  await expect(page.getByRole("heading", { name: "Guía de trámites" })).toBeFocused();
  await page.screenshot({ path: testInfo.outputPath("catalog.png") });
});
