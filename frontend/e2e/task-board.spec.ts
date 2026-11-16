import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-11-16T00:00:00Z"));
  await page.route("https://accounts.google.com/**", (route) => route.abort());
  await page.addInitScript(() => {
    const token = `header.${btoa(JSON.stringify({ sub: "visual-student" }))}.signature`;
    localStorage.setItem("campusunsa_token", token);
  });
});

test("renders Stitch Tareas board, filters, saves inline completion with undo, and handles errors", async ({
  page,
}, testInfo) => {
  const courses = [
    {
      id: "course-1",
      classroom_course_id: "1704257",
      name: "Calidad de Software",
      course_code: "1704257",
      theory_group: "A",
      lab_group: "B",
      mapping_status: "LINKED",
      sources: [],
      created_at: "2026-11-01T00:00:00Z",
    },
    {
      id: "course-2",
      classroom_course_id: "1704258",
      name: "Sistemas Distribuidos",
      course_code: "1704258",
      theory_group: "B",
      lab_group: "B",
      mapping_status: "LINKED",
      sources: [],
      created_at: "2026-11-01T00:00:00Z",
    },
  ];

  const base = {
    origin: "classroom",
    state: "PUBLISHED",
    created_at: "2026-11-01T00:00:00Z",
    is_completed: false,
  };

  let assignments = [
    {
      ...base,
      id: "task-1",
      course_id: "course-1",
      course_code: "1704257",
      classroom_assignment_id: "a1",
      title: "Tarea 3",
      priority: "ALTA",
      component_type: "TEORIA",
      group_code: "B",
      due_date: "2026-09-22T04:59:00Z",
    },
    {
      ...base,
      id: "task-2",
      course_id: "course-2",
      course_code: "1704258",
      classroom_assignment_id: "a2",
      title: "Laboratorio 4",
      component_type: "LABORATORIO",
      group_code: "B",
      due_date: "2026-11-16T04:59:00Z",
    },
    {
      ...base,
      id: "task-3",
      course_id: "course-1",
      course_code: "1704257",
      classroom_assignment_id: "a3",
      title: "Proyecto de investigación con un título extenso para comprobar la lectura en pantallas pequeñas",
      component_type: "UNICO",
      group_code: "A",
      due_date: "2026-11-19T04:59:00Z",
      origin: "moodle",
    },
  ];

  let failNextSave = false;

  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() === "PATCH") {
      await new Promise((resolve) => setTimeout(resolve, 350));
      if (failNextSave) {
        failNextSave = false;
        await route.fulfill({ status: 500, json: { detail: "Save failed" } });
        return;
      }
      const id = path.split("/").at(-2);
      const payload = route.request().postDataJSON() as { is_completed: boolean };
      assignments = assignments.map((task) =>
        task.id === id ? { ...task, is_completed: payload.is_completed } : task
      );
      await route.fulfill({ json: assignments.find((task) => task.id === id) });
    } else if (path.endsWith("/auth/me")) {
      await route.fulfill({
        json: {
          id: "visual-student",
          email: "student@unsa.edu.pe",
          role: "student",
          is_active: true,
        },
      });
    } else if (path.endsWith("/assignments")) {
      await route.fulfill({ json: assignments });
    } else if (path.endsWith("/courses/enrolled") || path.endsWith("/courses")) {
      await route.fulfill({ json: courses });
    } else {
      await route.fulfill({ json: { connected: true, sync_status: "SYNCED" } });
    }
  });

  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Tareas" })).toBeVisible();
  for (const group of ["Vencidas", "Hoy", "Esta semana"]) {
    await expect(page.getByRole("region", { name: group, exact: true })).toBeVisible();
  }
  await expect(page.getByText("Alta")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
    true
  );

  await page.screenshot({ path: testInfo.outputPath("board.png"), fullPage: true });

  // Filter by Lab and back to Todas
  await page.getByRole("button", { name: "Lab" }).click();
  await expect(page.getByRole("heading", { name: "Laboratorio 4" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Tarea 3" })).toBeHidden();
  await page.getByRole("button", { name: "Todas" }).click();

  // Open pending modal on card tap
  await page.getByRole("button", { name: /^Laboratorio 4/ }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByText("Pendiente de implementación.")).toBeVisible();
  await page.getByRole("button", { name: "Cerrar" }).click();

  // Complete inline + Undo toast + reload persistence
  await page.getByRole("button", { name: "Marcar como completada: Laboratorio 4" }).click();
  await expect(page.getByText("Tarea completada")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Laboratorio 4" })).toBeHidden();

  await page.reload();
  await expect(page.getByRole("heading", { name: "Laboratorio 4" })).toBeHidden();

  // Error rollback preserves task visibility
  failNextSave = true;
  await page.getByRole("button", { name: "Marcar como completada: Tarea 3" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "No se pudo guardar el cambio" })
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Tarea 3" })).toBeVisible();
});
