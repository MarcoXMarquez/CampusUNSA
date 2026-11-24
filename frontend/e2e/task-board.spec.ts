import { expect, test, type Page } from "@playwright/test";

// Routing tests run without service worker network interception.
test.use({ serviceWorkers: "block" });

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-11-16T00:00:00Z"));
  await page.route("https://accounts.google.com/**", (route) => route.abort());
  await page.addInitScript(() => {
    const token = `header.${btoa(JSON.stringify({ sub: "visual-student" }))}.signature`;
    localStorage.setItem("campusunsa_token", token);
  });
});

async function mockAcademicBoard(page: Page): Promise<{ failNextSave: () => void }> {
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
      alternate_link: "https://classroom.google.com/c/example",
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
      description: [
        "Lee las indicaciones de la entrega [1].",
        ...Array.from({ length: 16 }, () => "Revisa los requisitos del trabajo final."),
        "",
        "Links:",
        "------",
        "[1]",
        "https://aulavirtual.unsa.edu.pe/2026B/mod/assign/view.php?id=354694",
        "[2]",
        "https://example.com/material/" + "a".repeat(160),
      ].join("\n"),
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

  return { failNextSave: () => { failNextSave = true; } };
}

test("renders Stitch Tareas board, filters, saves inline completion with undo, and handles errors", async ({
  page,
}, testInfo) => {
  const board = await mockAcademicBoard(page);
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Tareas" })).toBeVisible();
  for (const group of ["Vencidas", "Hoy", "Esta semana"]) {
    await expect(page.getByRole("region", { name: group, exact: true })).toBeVisible();
  }
  await expect(page.getByText("Alta", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
    true
  );

  await page.screenshot({ path: testInfo.outputPath("board.png"), fullPage: true });
  const lastTask = page.getByRole("button", { name: /^Proyecto de investigaci/ });
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  const lastTaskBounds = await lastTask.boundingBox();
  const dockBounds = await page.locator("footer .liquid-glass-dock").boundingBox();
  expect(lastTaskBounds).not.toBeNull();
  expect(dockBounds).not.toBeNull();
  expect(lastTaskBounds!.y + lastTaskBounds!.height).toBeLessThanOrEqual(dockBounds!.y);
  expect(await lastTask.locator("..").evaluate((row) => getComputedStyle(row).boxShadow)).toBe("none");

  await page.getByRole("button", { name: "Horario", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Horario", exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("schedule.png") });

  await page.getByRole("button", { name: "Hugo", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Hugo", exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("hugo.png") });

  await page.getByRole("button", { name: "Crear nueva tarea" }).click();
  await expect(page.getByRole("dialog", { name: "Nueva tarea" })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("new-task.png") });
  await page.getByRole("dialog", { name: "Nueva tarea" })
    .getByRole("button", { name: "Cancelar", exact: true }).click();

  await page.getByRole("button", { name: "Tareas", exact: true }).click();

  // Filter by Lab and back to Todas
  await page.getByRole("button", { name: "Lab", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Laboratorio 4" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Tarea 3" })).toBeHidden();
  await page.getByRole("button", { name: "Todas", exact: true }).click();

  // Open assignment details and verify its provider link.
  const taskDetails = page.getByRole("button", { name: /^Laboratorio 4/ });
  await taskDetails.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Laboratorio 4" })
    .getByRole("link", { name: "Abrir en Classroom" }))
    .toHaveAttribute("href", "https://classroom.google.com/c/example");
  await page.screenshot({ path: testInfo.outputPath("detail.png") });
  await expect(page.getByRole("button", { name: "Cerrar", exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Laboratorio 4" })).toBeHidden();
  await expect(taskDetails).toBeFocused();

  // Complete inline + Undo toast + reload persistence
  const patchCompletionPromise = page.waitForResponse(
    (res) => res.request().method() === "PATCH" && res.url().includes("/completion")
  );
  await page.getByRole("button", { name: "Marcar como completada: Laboratorio 4" }).click();
  await expect(page.getByText("Tarea completada")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Laboratorio 4" })).toBeHidden();
  await patchCompletionPromise;

  await page.reload();
  await expect(page.getByRole("heading", { name: "Laboratorio 4" })).toBeHidden();

  // Error rollback preserves task visibility
  board.failNextSave();
  await page.getByRole("button", { name: "Marcar como completada: Tarea 3" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "No se pudo guardar el cambio" })
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Tarea 3" })).toBeVisible();
});

test("fits the Moodle task detail and its long links in a narrow mobile viewport", async ({ page }, testInfo) => {
  await mockAcademicBoard(page);
  await page.setViewportSize({ width: 320, height: 520 });
  await page.goto("/");
  await page.getByRole("button", { name: /^Proyecto de investigaci/ }).click();
  const moodleDetail = page.getByRole("dialog");
  const bounds = await moodleDetail.boundingBox();
  expect(bounds?.x).toBeGreaterThanOrEqual(0);
  expect((bounds?.x ?? 0) + (bounds?.width ?? 0)).toBeLessThanOrEqual(320);
  expect(await moodleDetail.evaluate((dialog) => dialog.scrollWidth)).toBeLessThanOrEqual(320);

  const moodleLink = moodleDetail.getByRole("link", { name: "Abrir en Moodle" });
  await expect(moodleLink).toHaveAttribute(
    "href", "https://aulavirtual.unsa.edu.pe/2026B/mod/assign/view.php?id=354694"
  );
  await moodleLink.scrollIntoViewIfNeeded();
  await expect(moodleLink).toBeInViewport();
  await expect(moodleDetail.getByRole("button", { name: "Cerrar" })).toBeInViewport();
  await expect(moodleDetail.getByText("Links:", { exact: true })).toHaveCount(0);
  const resource = moodleDetail.getByRole("link", { name: /example.com/ });
  await resource.scrollIntoViewIfNeeded();
  await expect(resource).toBeInViewport();
  await expect(moodleLink).toBeInViewport();
  await expect(moodleDetail.getByRole("button", { name: "Cerrar" })).toBeInViewport();
  await page.screenshot({ path: testInfo.outputPath("moodle-detail-320.png") });
});
