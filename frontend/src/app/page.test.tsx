import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("renders main iOS application navigation with Hoy view", () => {
    render(<HomePage />);
    expect(screen.getAllByText("Hoy").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Calendario")).toBeDefined();
    expect(screen.getByText("Ajustes")).toBeDefined();
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
});
