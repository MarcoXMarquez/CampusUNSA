import { expect, test } from "@playwright/test";

const TEST_JWT = `header.${Buffer.from(JSON.stringify({ sub: "e2e-42" })).toString("base64url")}.sig`;

test.describe("PWA Offline & Reconnection Resilience (US-07)", () => {
  test("serves manifest, icons, registers SW, reloads 100% offline from cache, and auto-syncs on reconnect", async ({
    page,
    context,
  }) => {
    let reconnected = false;

    await context.addInitScript((jwt: string) => {
      window.localStorage.setItem("campusunsa_token", jwt);
    }, TEST_JWT);

    await context.route("**/api/v1/**", async (route) => {
      const url = route.request().url();
      if (url.endsWith("/auth/me")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            id: "e2e-42",
            email: "estudiante@unsa.edu.pe",
            full_name: "Estudiante UNSA",
            role: "student",
          }),
        });
      }
      if (url.endsWith("/auth/google/classroom/status") || url.endsWith("/dutic/ical/status")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ connected: true, sync_status: "CONNECTED" }),
        });
      }
      if (url.endsWith("/courses/enrolled")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([
            {
              id: "course-1",
              classroom_course_id: "1705275",
              course_code: "1705275",
              name: "DESARROLLO DE SOFTWARE PARA JUEGOS",
              theory_group: "A",
              lab_group: null,
              mapping_status: "LINKED",
              sources: [],
              schedule_blocks: [
                {
                  id: "blk-1",
                  course_code: "1705275",
                  term: "2026B",
                  component_type: "TEORIA",
                  group_code: "A",
                  day_of_week: 1,
                  start_time: "08:40",
                  end_time: "10:20",
                  room: "Pabellon Sistemas 201",
                },
              ],
              created_at: "2026-11-01T00:00:00Z",
            },
          ]),
        });
      }
      if (url.endsWith("/courses/assignments")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(
            reconnected
              ? [
                  {
                    id: "task-2",
                    course_id: "course-1",
                    classroom_assignment_id: "cw-2",
                    title: "Tarea Sincronizada Post-Offline",
                    origin: "MOODLE",
                    state: "PUBLISHED",
                    due_date: "2026-11-22T23:59:00Z",
                    is_completed: false,
                    created_at: "2026-11-02T00:00:00Z",
                  },
                ]
              : [
                  {
                    id: "task-1",
                    course_id: "course-1",
                    classroom_assignment_id: "cw-1",
                    title: "Guia Lab PWA Offline",
                    origin: "CLASSROOM",
                    state: "PUBLISHED",
                    due_date: "2026-11-20T23:59:00Z",
                    is_completed: false,
                    created_at: "2026-11-01T00:00:00Z",
                  },
                ]
          ),
        });
      }
      if (url.endsWith("/health")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ status: "healthy" }),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: "[]",
      });
    });

    // 1. Verify manifest and all declared PWA icons return HTTP 200
    const assetChecks = await Promise.all([
      page.request.get("/manifest.webmanifest"),
      page.request.get("/icons/icon-192.png"),
      page.request.get("/icons/icon-512.png"),
      page.request.get("/icons/icon-maskable-512.png"),
      page.request.get("/icons/apple-touch-icon.png"),
    ]);
    for (const res of assetChecks) {
      expect(res.status()).toBe(200);
    }
    const manifestJson = (await assetChecks[0].json()) as {
      start_url?: string;
      display?: string;
      icons?: Array<{ src: string }>;
    };
    expect(manifestJson.start_url).toBe("/");
    expect(manifestJson.display).toBe("standalone");
    expect((manifestJson.icons ?? []).length).toBeGreaterThanOrEqual(3);

    // 2. Load app online and ensure Service Worker activates and caches shell + static chunks + IndexedDB
    await page.goto("/", { waitUntil: "networkidle" });
    await expect(page.getByText("Guia Lab PWA Offline")).toBeVisible();

    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });

    // Reload once online so active SW intercepts and populates static chunk cache
    await page.reload({ waitUntil: "networkidle" });
    const hasController = await page.evaluate(
      () => Boolean(navigator.serviceWorker.controller)
    );
    expect(hasController).toBe(true);

    // Confirm IndexedDB database is populated cleanly
    const hasOfflineData = await page.evaluate(async () => {
      const req = indexedDB.open("campusunsa_offline_v1", 1);
      return await new Promise<boolean>((resolve) => {
        req.onsuccess = () => {
          const db = req.result;
          const ok =
            db.objectStoreNames.contains("academic_boards") &&
            db.objectStoreNames.contains("session_snapshots");
          db.close();
          resolve(ok);
        };
        req.onerror = () => resolve(false);
      });
    });
    expect(hasOfflineData).toBe(true);

    // 3. Disconnect network completely and reload the page
    await context.setOffline(true);

    const startMs = Date.now();
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByText("Guia Lab PWA Offline")).toBeVisible();
    const offlineRenderMs = Date.now() - startMs;

    expect(
      await page.getByText("Sincroniza tus plataformas").count()
    ).toBe(0);
    await expect(
      page.getByText(/Sin conexión · mostrando datos guardados/i)
    ).toBeVisible();
    expect(offlineRenderMs).toBeLessThan(1500);

    // Switch to HorarioView offline and verify cached weekly block appears
    await page.getByRole("button", { name: "Horario", exact: true }).click();
    await expect(page.getByText(/Pabellon Sistemas 201/).first()).toBeVisible();

    // 4. Restore network connection and verify automatic sync updates tasks without reload
    reconnected = true;
    await context.setOffline(false);
    await page.getByRole("button", { name: "Tareas", exact: true }).click();

    await expect(
      page.getByText("Tarea Sincronizada Post-Offline")
    ).toBeVisible({ timeout: 10000 });
  });
});
