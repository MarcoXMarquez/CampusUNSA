import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-11-03T12:00:00Z"));
  await page.route("https://accounts.google.com/**", route => route.abort());
  await page.addInitScript(() => {
    const token = `header.${btoa(JSON.stringify({ sub: "visual-student" }))}.signature`;
    localStorage.setItem("campusunsa_token", token);
  });
});

test("groups deadlines, saves completion optimistically, and restores persisted state", async ({ page }, testInfo) => {
  const course = { id: "course-1", classroom_course_id: "external-course", name: "Ingeniería de Software", created_at: "2026-11-01T00:00:00Z" };
  const base = { course_id: course.id, origin: "classroom", state: "PUBLISHED", created_at: "2026-11-01T00:00:00Z", is_completed: false };
  let assignments = [
    { ...base, id: "task-1", classroom_assignment_id: "a1", title: "Entregar informe del sprint", due_date: "2026-11-03T18:00:00Z" },
    { ...base, id: "task-2", classroom_assignment_id: "a2", title: "Preparar exposición de arquitectura", due_date: "2026-11-05T12:00:00Z" },
    { ...base, id: "task-3", classroom_assignment_id: "a3", title: "Proyecto de investigación con un título extenso para comprobar la lectura en pantallas pequeñas", due_date: "2026-11-08T12:00:00Z", origin: "moodle" },
  ];
  let failNextSave = false;
  await page.route("**/api/v1/**", async route => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() === "PATCH") {
      await new Promise(resolve => setTimeout(resolve, 600));
      if (failNextSave) {
        failNextSave = false;
        await route.fulfill({ status: 500, json: { detail: "Save failed" } });
        return;
      }
      const id = path.split("/").at(-2);
      const payload = route.request().postDataJSON() as { is_completed: boolean };
      assignments = assignments.map(task => task.id === id ? { ...task, is_completed: payload.is_completed } : task);
      await route.fulfill({ json: assignments.find(task => task.id === id) });
    } else if (path.endsWith("/auth/me")) {
      await route.fulfill({ json: { id: "visual-student", email: "student@unsa.edu.pe", role: "student", is_active: true } });
    } else if (path.endsWith("/assignments")) await route.fulfill({ json: assignments });
    else if (path.endsWith("/courses")) await route.fulfill({ json: [course] });
    else await route.fulfill({ json: { connected: true, sync_status: "SYNCED" } });
  });
  await page.goto("/");
  for (const group of ["Menos de 24 h", "De 24 a 72 h", "Más de 72 h"]) {
    await expect(page.getByRole("region", { name: group, exact: true })).toBeVisible();
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  for (const [urgency, light, dark] of [
    ["urgent", "rgb(255, 59, 48)", "rgb(255, 69, 58)"],
    ["soon", "rgb(255, 204, 0)", "rgb(255, 214, 10)"],
    ["later", "rgb(52, 199, 89)", "rgb(48, 209, 88)"],
  ]) {
    const dot = page.locator(`[data-urgency="${urgency}"] > span`);
    await expect(dot).toHaveCSS("background-color", testInfo.project.name.endsWith("dark") ? dark : light);
  }
  await page.screenshot({ path: testInfo.outputPath("board.png"), fullPage: true });
  await page.getByRole("button", { name: /Entregar informe del sprint/ }).click();
  await page.getByRole("button", { name: "Marcar como completada", exact: true }).click();
  await expect(page.getByText("Guardando cambio...")).toBeVisible();
  await expect(page.getByRole("button", { name: "Marcar como pendiente" })).toBeVisible();
  await expect(page.getByText("Guardando cambio...")).toBeHidden();
  await page.getByRole("button", { name: "Cerrar", exact: true }).first().click();
  await page.reload();
  await expect(page.getByRole("region", { name: "Completadas", exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Entregar informe del sprint/ }).click();
  failNextSave = true;
  await page.getByRole("button", { name: "Marcar como pendiente" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "No se pudo guardar el cambio" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Marcar como pendiente" })).toBeEnabled();
  await page.screenshot({ path: testInfo.outputPath("detail-save-error.png"), fullPage: true });
});
