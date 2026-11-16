import { onlineManager } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import HomePage from "./page";

const testToken = `header.${btoa(JSON.stringify({ sub: "42" }))}.signature`;

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("HomePage Component", () => {
  beforeEach(() => {
    localStorage.clear();
    onlineManager.setOnline(true);
    Object.defineProperty(navigator, "onLine", {
      value: true,
      configurable: true,
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    localStorage.clear();
    onlineManager.setOnline(true);
    Object.defineProperty(navigator, "onLine", {
      value: true,
      configurable: true,
    });
  });

  it("renders 5-item bottom navigation and first-time TareasSyncView when platforms are disconnected", () => {
    render(<HomePage />);
    expect(screen.getByRole("button", { name: "Tareas" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Horario" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Crear nueva tarea" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Hugo" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Ajustes" })).toBeDefined();
    expect(screen.getByText("Conecta tus plataformas")).toBeDefined();
    expect(screen.getByText("0 de 2 conectadas")).toBeDefined();
  });

  it("transitions from TareasSyncView to HoyView once both Classroom and DUTIC are connected", async () => {
    localStorage.setItem("campusunsa_token", testToken);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.endsWith("/auth/me")) {
          return jsonResponse({
            id: "42",
            email: "marco@unsa.edu.pe",
            role: "student",
            full_name: "Marco Marquez",
          });
        }
        if (url.endsWith("/auth/google/classroom/status") || url.endsWith("/dutic/ical/status")) {
          return jsonResponse({ connected: true, sync_status: "CONNECTED" });
        }
        if (url.endsWith("/health")) {
          return jsonResponse({ status: "healthy" });
        }
        return jsonResponse([]);
      })
    );

    render(<HomePage />);

    await waitFor(() => {
      expect(screen.getAllByRole("heading", { name: "Tareas" }).length).toBeGreaterThanOrEqual(1);
      expect(screen.queryByText("Conecta tus plataformas")).toBeNull();
    });
  });

  it("keeps TareasSyncView visible when only 1 of 2 platforms is connected", async () => {
    localStorage.setItem("campusunsa_token", testToken);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.endsWith("/auth/me")) {
          return jsonResponse({
            id: "42",
            email: "marco@unsa.edu.pe",
            role: "student",
            full_name: "Marco Marquez",
          });
        }
        if (url.endsWith("/auth/google/classroom/status")) {
          return jsonResponse({ connected: true, sync_status: "CONNECTED" });
        }
        if (url.endsWith("/dutic/ical/status")) {
          return jsonResponse({ connected: false, sync_status: "NOT_CONNECTED" });
        }
        if (url.endsWith("/health")) {
          return jsonResponse({ status: "healthy" });
        }
        return jsonResponse([]);
      })
    );

    render(<HomePage />);

    await waitFor(() => {
      expect(screen.getByText("1 de 2 conectadas")).toBeDefined();
    });
    expect(screen.getByText("Conecta tus plataformas")).toBeDefined();
  });

  it("renders the 3 campus geographical locations in Ajustes", () => {
    render(<HomePage />);
    fireEvent.click(screen.getByText("Ajustes"));
    expect(screen.getByText("Campus Ingenierias")).toBeDefined();
    expect(screen.getByText("Campus Biomedicas")).toBeDefined();
    expect(screen.getByText("Campus Sociales")).toBeDefined();
  });

  it("renders core infrastructure component indicators in Ajustes", () => {
    render(<HomePage />);
    fireEvent.click(screen.getByText("Ajustes"));
    expect(screen.getByText("FastAPI Core")).toBeDefined();
    expect(screen.getByText("PostgreSQL 16")).toBeDefined();
    expect(screen.getByText("Redis 7 Store")).toBeDefined();
  });

  it("hydrates flat OpenAPI UserResponse full_name and integration statuses on session load", async () => {
    localStorage.setItem("campusunsa_token", testToken);
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/auth/me")) {
        return jsonResponse({
          id: "42",
          email: "marco@unsa.edu.pe",
          role: "student",
          full_name: "Marco Marquez",
        });
      }
      if (url.endsWith("/auth/google/classroom/status")) {
        return jsonResponse({ connected: true, sync_status: "CONNECTED" });
      }
      if (url.endsWith("/dutic/ical/status")) {
        return jsonResponse({ connected: true, sync_status: "CONNECTED" });
      }
      if (url.endsWith("/health")) {
        return jsonResponse({ status: "healthy" });
      }
      return jsonResponse([]);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<HomePage />);
    fireEvent.click(screen.getByText("Ajustes"));

    await waitFor(() => {
      expect(screen.getByText("Marco Marquez")).toBeDefined();
      expect(screen.getByText("Conectado")).toBeDefined();
      expect(screen.getByText("Suscrito")).toBeDefined();
    });

    expect(
      fetchMock.mock.calls.some(([url]) =>
        String(url).endsWith("/auth/google/classroom/status")
      )
    ).toBe(true);
    expect(
      fetchMock.mock.calls.some(([url]) =>
        String(url).endsWith("/dutic/ical/status")
      )
    ).toBe(true);
  });

  it("calls DELETE /classroom/assignments and DELETE /classroom/courses when clearing synced data", async () => {
    localStorage.setItem("campusunsa_token", testToken);
    localStorage.setItem(
      "campusunsa_board:42",
      JSON.stringify({
        courses: [
          {
            id: "course-1",
            classroom_course_id: "c-1",
            name: "Calculo",
            created_at: "2026-11-01T00:00:00Z",
          },
        ],
        assignments: [
          {
            id: "task-1",
            course_id: "course-1",
            classroom_assignment_id: "a-1",
            title: "Lab 1",
            origin: "classroom",
            state: "PUBLISHED",
            created_at: "2026-11-01T00:00:00Z",
          },
        ],
        moodleSessionExpired: false,
      })
    );

    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === "DELETE") {
        return jsonResponse({ deleted_count: 1, origin: "all", message: "Cleared" });
      }
      if (url.endsWith("/auth/me")) {
        return jsonResponse({
          id: "42",
          email: "marco@unsa.edu.pe",
          role: "student",
          full_name: "Marco Marquez",
        });
      }
      if (url.endsWith("/auth/google/classroom/status") || url.endsWith("/dutic/ical/status")) {
        return jsonResponse({ connected: false, sync_status: "NOT_CONNECTED" });
      }
      if (url.endsWith("/health")) {
        return jsonResponse({ status: "healthy" });
      }
      return jsonResponse([]);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<HomePage />);
    fireEvent.click(screen.getByText("Ajustes"));
    await waitFor(() => expect(screen.getByText("Marco Marquez")).toBeDefined());

    fireEvent.click(screen.getByText("Borrar Tareas"));
    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          ([url, init]) =>
            String(url).endsWith("/classroom/assignments") && init?.method === "DELETE"
        )
      ).toBe(true);
    });
    expect(
      fetchMock.mock.calls.some(([url]) => String(url).includes("/tasks/clear"))
    ).toBe(false);
    expect(
      JSON.parse(localStorage.getItem("campusunsa_board:42") ?? "{}").assignments
    ).toHaveLength(0);

    fireEvent.click(screen.getByText("Borrar Cursos"));
    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          ([url, init]) =>
            String(url).endsWith("/classroom/courses") && init?.method === "DELETE"
        )
      ).toBe(true);
    });
    expect(
      fetchMock.mock.calls.some(([url]) => String(url).includes("/courses/clear"))
    ).toBe(false);
    expect(
      JSON.parse(localStorage.getItem("campusunsa_board:42") ?? "{}").courses
    ).toHaveLength(0);
  });

  it("enforces iOS UI directives without row pills or colored icon boxes", async () => {
    localStorage.setItem("campusunsa_token", testToken);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.endsWith("/auth/me")) {
          return jsonResponse({
            id: "42",
            email: "marco@unsa.edu.pe",
            role: "student",
            full_name: "Marco Marquez",
          });
        }
        if (url.endsWith("/auth/google/classroom/status") || url.endsWith("/dutic/ical/status")) {
          return jsonResponse({ connected: true, sync_status: "CONNECTED" });
        }
        if (url.endsWith("/health")) {
          return jsonResponse({
            status: "healthy",
            services: { database: "healthy", redis: "healthy" },
          });
        }
        return jsonResponse([]);
      })
    );

    const { container } = render(<HomePage />);
    fireEvent.click(screen.getByText("Ajustes"));
    await waitFor(() => expect(screen.getByText("Conectado")).toBeDefined());

    expect(container.querySelector(".bg-emerald-100")).toBeNull();
    fireEvent.click(screen.getAllByText("Asistente de WhatsApp")[0]);
    await waitFor(() => {
      expect(screen.getByLabelText("Código OTP de 6 dígitos")).toBeDefined();
    });
    expect(container.querySelector(".bg-emerald-100")).toBeNull();
    expect(screen.getAllByText("Operativo").length).toBeGreaterThanOrEqual(3);
  });

  it("renders HorarioView inside Horario tab while preserving 5-tab bar and opening Nueva tarea sheet", async () => {
    localStorage.setItem("campusunsa_token", testToken);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.endsWith("/auth/me")) {
          return jsonResponse({
            id: "42",
            email: "marco@unsa.edu.pe",
            role: "student",
            full_name: "Marco Marquez",
          });
        }
        if (url.endsWith("/auth/google/classroom/status") || url.endsWith("/dutic/ical/status")) {
          return jsonResponse({ connected: true, sync_status: "CONNECTED" });
        }
        if (url.endsWith("/courses/enrolled")) {
          return jsonResponse([
            {
              id: "enr-1",
              classroom_course_id: "1705275",
              name: "Desarrollo de Software para Juegos",
              origin: "classroom",
              course_code: "1705275",
              curriculum_year: 2017,
              theory_group: "A",
              lab_group: "B",
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
                  room: "Aula 204",
                },
              ],
              created_at: "2026-11-01T00:00:00Z",
              updated_at: "2026-11-01T00:00:00Z",
            },
          ]);
        }
        if (url.endsWith("/health")) {
          return jsonResponse({ status: "healthy" });
        }
        return jsonResponse([]);
      })
    );

    render(<HomePage />);
    fireEvent.click(screen.getByRole("button", { name: "Horario" }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Horario" })).toBeDefined();
      expect(screen.getAllByText(/Aula 204/).length).toBeGreaterThanOrEqual(1);
    });

    // Bottom navigation keeps all 5 items
    expect(screen.getByRole("button", { name: "Tareas" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Horario" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Crear nueva tarea" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Hugo" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Ajustes" })).toBeDefined();

    // Tapping + Tarea opens Nueva tarea sheet with course pre-selected
    fireEvent.click(screen.getByRole("button", { name: "+ Tarea" }));
    expect(screen.getByRole("dialog", { name: "Nueva tarea" })).toBeDefined();
    expect(screen.getByTestId("selected-course-display").textContent).toBe(
      "Desarrollo de Software para Juegos A"
    );
  });

  it("renders HoyView and HorarioView from offline snapshot without flashing TareasSyncView when reloaded offline", async () => {
    Object.defineProperty(navigator, "onLine", {
      value: false,
      configurable: true,
    });

    localStorage.setItem("campusunsa_token", testToken);
    localStorage.setItem(
      "campusunsa_session:42",
      JSON.stringify({
        user: {
          id: "42",
          email: "marco@unsa.edu.pe",
          full_name: "Marco Student",
          role: "student",
        },
        classroomConnected: true,
        classroomSyncStatus: "CONNECTED",
        moodleIcalConnected: true,
        moodleIcalSyncStatus: "CONNECTED",
      })
    );
    localStorage.setItem(
      "campusunsa_board:42",
      JSON.stringify({
        courses: [
          {
            id: "c-off-1",
            course_code: "1705275",
            name: "DESARROLLO DE SOFTWARE PARA JUEGOS",
            theory_group: "A",
            lab_group: null,
            mapping_status: "LINKED",
            sources: [],
            schedule_blocks: [
              {
                id: "blk-off-1",
                course_code: "1705275",
                term: "2026B",
                component_type: "TEORIA",
                group_code: "A",
                day_of_week: 1,
                start_time: "08:40",
                end_time: "10:20",
                room: "Pabellón Sistemas",
              },
            ],
          },
        ],
        assignments: [
          {
            id: "task-off-1",
            title: "Practica Offline Cacheada",
            course_id: "c-off-1",
            course_name: "DESARROLLO DE SOFTWARE PARA JUEGOS",
            source_platform: "CLASSROOM",
            due_at: "2026-11-18T23:59:00Z",
            is_completed: false,
          },
        ],
        moodleSessionExpired: false,
      })
    );

    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("Failed to fetch"))
    );

    render(<HomePage />);

    // Renders cached view immediately instead of TareasSyncView
    expect(screen.queryByText("Conecta tus plataformas")).toBeNull();
    expect(screen.getByText("Practica Offline Cacheada")).toBeDefined();
    expect(
      screen.getByText(/Sin conexión · mostrando datos guardados/i)
    ).toBeDefined();

    // HorarioView also works offline
    fireEvent.click(screen.getByRole("button", { name: "Horario" }));
    await waitFor(() => {
      expect(screen.getAllByText(/Pabellón Sistemas/).length).toBeGreaterThanOrEqual(1);
    });
  });

  it("automatically re-syncs session and academic board when connection returns online", async () => {
    Object.defineProperty(navigator, "onLine", {
      value: false,
      configurable: true,
    });

    localStorage.setItem("campusunsa_token", testToken);
    localStorage.setItem(
      "campusunsa_session:42",
      JSON.stringify({
        user: {
          id: "42",
          email: "marco@unsa.edu.pe",
          full_name: "Marco Student",
          role: "student",
        },
        classroomConnected: true,
        classroomSyncStatus: "CONNECTED",
        moodleIcalConnected: true,
        moodleIcalSyncStatus: "CONNECTED",
      })
    );
    localStorage.setItem(
      "campusunsa_board:42",
      JSON.stringify({
        courses: [],
        assignments: [
          {
            id: "task-stale",
            title: "Tarea Cacheada Previa",
            course_id: "c-1",
            course_name: "Curso Demo",
            source_platform: "CLASSROOM",
            due_at: "2026-11-18T23:59:00Z",
            is_completed: false,
          },
        ],
        moodleSessionExpired: false,
      })
    );

    let onlineMode = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        if (!onlineMode) {
          throw new TypeError("Network offline");
        }
        const url = String(input);
        if (url.endsWith("/auth/me")) {
          return jsonResponse({ id: "42", email: "marco@unsa.edu.pe", full_name: "Marco Student" });
        }
        if (url.endsWith("/auth/google/classroom/status")) {
          return jsonResponse({ connected: true, sync_status: "CONNECTED" });
        }
        if (url.endsWith("/dutic/ical/status")) {
          return jsonResponse({ connected: true, sync_status: "CONNECTED" });
        }
        if (url.endsWith("/courses/assignments")) {
          return jsonResponse([
            {
              id: "task-fresh",
              title: "Tarea Sincronizada Online",
              course_id: "c-1",
              course_name: "Curso Demo",
              source_platform: "MOODLE",
              due_at: "2026-11-19T23:59:00Z",
              is_completed: false,
            },
          ]);
        }
        if (url.endsWith("/health")) {
          return jsonResponse({ status: "healthy" });
        }
        return jsonResponse([]);
      })
    );

    render(<HomePage />);
    expect(screen.getByText("Tarea Cacheada Previa")).toBeDefined();

    // Simulate network recovery
    onlineMode = true;
    Object.defineProperty(navigator, "onLine", {
      value: true,
      configurable: true,
    });
    act(() => {
      window.dispatchEvent(new Event("online"));
    });

    await waitFor(() => {
      expect(screen.getByText("Tarea Sincronizada Online")).toBeDefined();
    });
  });

  it("clears cached student session and academic board data on logout", async () => {
    localStorage.setItem("campusunsa_token", testToken);
    localStorage.setItem(
      "campusunsa_session:42",
      JSON.stringify({
        user: {
          id: "42",
          email: "marco@unsa.edu.pe",
          full_name: "Marco Student",
          role: "student",
        },
        classroomConnected: true,
        classroomSyncStatus: "CONNECTED",
        moodleIcalConnected: true,
        moodleIcalSyncStatus: "CONNECTED",
      })
    );
    localStorage.setItem(
      "campusunsa_board:42",
      JSON.stringify({ courses: [], assignments: [], moodleSessionExpired: false })
    );

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.endsWith("/auth/me")) {
          return jsonResponse({ id: "42", email: "marco@unsa.edu.pe", full_name: "Marco Student" });
        }
        if (url.endsWith("/auth/google/classroom/status") || url.endsWith("/dutic/ical/status")) {
          return jsonResponse({ connected: true, sync_status: "CONNECTED" });
        }
        if (url.endsWith("/health")) {
          return jsonResponse({ status: "healthy" });
        }
        return jsonResponse([]);
      })
    );

    render(<HomePage />);
    fireEvent.click(screen.getAllByRole("button", { name: "Ajustes" })[0]);

    await waitFor(() => {
      expect(screen.getByText(/Cerrar Sesión/i)).toBeDefined();
    });

    fireEvent.click(screen.getByText(/Cerrar Sesión/i));

    await waitFor(() => {
      expect(localStorage.getItem("campusunsa_token")).toBeNull();
      expect(localStorage.getItem("campusunsa_session:42")).toBeNull();
      expect(localStorage.getItem("campusunsa_board:42")).toBeNull();
    });
  });
});
