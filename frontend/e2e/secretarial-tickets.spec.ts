import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "block" });

for (const role of ["student", "secretary"] as const) {
  test(`${role} opens secretarial support and performs the permitted action`, async ({ page }, info) => {
    await page.route("https://accounts.google.com/**", (route) => route.abort());
    await page.addInitScript(() => {
      localStorage.setItem("campusunsa_token", `header.${btoa(JSON.stringify({ sub: "ticket-test" }))}.signature`);
    });
    let status = "OPEN";
    let resolution: string | null = null;
    let created = role === "secretary";
    let newNotice = false;
    let noticeRead = false;
    const ticket = () => ({
      id: "ticket-1", tracking_code: "TICK-2026-ABCD", student_id: "student-1",
      assigned_secretary_id: null, subject: "Rectificación de matrícula",
      description: "La matrícula muestra una asignatura incorrecta.",
      category: "Administration", status, faculty: "Ingeniería",
      created_at: "2026-11-24T12:00:00Z", resolved_at: null, resolution, audit: [],
    });
    await page.route("**/api/v1/**", async (route) => {
      const path = new URL(route.request().url()).pathname.replace("/api/v1", "");
      const method = route.request().method();
      if (path === "/auth/me") {
        return route.fulfill({ json: { id: "ticket-test", email: "viewer@unsa.edu.pe", is_active: true, role } });
      }
      if (path === "/tickets/routing") {
        return route.fulfill({ json: { faculty: "Ingeniería", alternatives: [] } });
      }
      if (path === "/tickets/notifications") {
        return route.fulfill({ json: newNotice && !noticeRead ? [{
          id: "notice-1", ticket_id: "ticket-1", tracking_code: "TICK-2026-ABCD",
          created_at: "2026-11-24T13:00:00Z", read_at: null,
        }] : [] });
      }
      if (path === "/tickets/notifications/notice-1/read" && method === "PATCH") {
        noticeRead = true;
        return route.fulfill({ status: 204 });
      }
      if (path === "/tickets/mine" || path === "/tickets/all") {
        return route.fulfill({ json: created ? [ticket()] : [] });
      }
      if (path === "/tickets" && method === "POST") {
        const input: { confirmed: boolean } = route.request().postDataJSON();
        expect(input.confirmed).toBe(true);
        created = true;
        return route.fulfill({ status: 201, json: ticket() });
      }
      if (path === "/tickets/ticket-1") {
        if (method === "PATCH") {
          const change: { status: string; resolution?: string } = route.request().postDataJSON();
          status = change.status;
          resolution = change.resolution ?? null;
        }
        return route.fulfill({ json: ticket() });
      }
      return route.fulfill({ json: path.endsWith("/status") ? {} : [] });
    });
    await Promise.all([
      page.waitForResponse((response) => new URL(response.url()).pathname.endsWith("/auth/me")),
      page.goto("/"),
    ]);
    await page.getByRole("button", { name: "Hugo", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Hugo", exact: true })).toBeVisible();
    await page.screenshot({ path: info.outputPath("hugo-ticket-entry.png") });
    await page.getByRole("button", { name: "Secretaría", exact: true }).click();
    if (role === "student") {
      await expect(page.getByText(/Aún no tienes solicitudes/)).toBeVisible();
      await page.getByRole("button", { name: "Nueva solicitud" }).click();
      await page.getByLabel("Asunto").fill("Rectificación de matrícula");
      await page.getByLabel("Describe tu consulta").fill("La matrícula muestra una asignatura incorrecta.");
      await expect(page.getByRole("button", { name: "Enviar a secretaría" })).toBeDisabled();
      await page.getByRole("checkbox", { name: /confirmo/i }).check();
      await page.getByRole("button", { name: "Enviar a secretaría" }).click();
    } else {
      await page.getByRole("button", { name: /TICK-2026-ABCD/ }).click();
      await page.getByRole("button", { name: "Iniciar revisión" }).click();
      await page.getByLabel("Resolución oficial").fill("Se corrigió el registro.");
      await page.getByRole("button", { name: "Resolver solicitud" }).click();
      await expect(page.getByText("Se corrigió el registro.", { exact: true })).toBeVisible();
    }
    await expect(page.getByRole("heading", { name: "Rectificación de matrícula" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`ticket-${role}.png`) });

    if (role === "student") {
      status = "RESOLVED";
      resolution = "Se corrigió el registro.";
      newNotice = true;
      await page.getByRole("button", { name: "Tareas", exact: true }).click();
      const notice = page.getByRole("button", { name: "Respuesta disponible para TICK-2026-ABCD" });
      await expect(notice).toBeVisible({ timeout: 10000 });
      await notice.click();
      await page.getByRole("region", { name: "Respuestas nuevas" }).getByRole("button").click();
      await expect(page.getByText("Se corrigió el registro.", { exact: true })).toBeVisible();
      await expect.poll(() => noticeRead).toBe(true);
    }
  });
}
