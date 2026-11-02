import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { AcademicHubCard } from "./AcademicHubCard";

describe("AcademicHubCard Component", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    global.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve([]),
      })
    ) as unknown as typeof fetch;
  });

  it("renders Classroom and DUTIC synchronization options", () => {
    render(<AcademicHubCard />);
    expect(screen.getByText("Sincronizacion Google Classroom")).toBeDefined();
    expect(screen.getByText("Sincronizacion DUTIC Moodle")).toBeDefined();
  });

  it("displays disconnected badge by default when unlinked", () => {
    render(<AcademicHubCard />);
    expect(screen.getByText("No Vinculado")).toBeDefined();
    expect(screen.getByText("Vincular Google Classroom (1 Clic)")).toBeDefined();
  });

  it("provides toggle for offline sandbox mode", () => {
    render(<AcademicHubCard />);
    expect(screen.getByText("Modo Sandbox / Opciones Avanzadas")).toBeDefined();
  });
  it("renders clean tasks and courses buttons for clean slate testing", () => {
    render(<AcademicHubCard />);
    expect(screen.getByText("Borrar Tareas")).toBeDefined();
    expect(screen.getByText("Borrar Cursos")).toBeDefined();
  });

  it("renders filter buttons and search input", () => {
    render(<AcademicHubCard />);
    expect(screen.getByText("Filtrar:")).toBeDefined();
    expect(screen.getByPlaceholderText("Buscar curso o seccion...")).toBeDefined();
  });

  it("renders Moodle iCal controls when switching to DUTIC tab", async () => {
    const { fireEvent } = await import("@testing-library/react");
    render(<AcademicHubCard />);
    const duticTab = screen.getByText("Sincronizacion DUTIC Moodle");
    fireEvent.click(duticTab);

    expect(screen.getByText("Suscripcion de Calendario iCal Moodle (DUTIC)")).toBeDefined();
    expect(screen.getByText("Vincular y Sincronizar Calendario iCal")).toBeDefined();
    expect(screen.getByText("Cargar Feed Demo UNSA (1 Clic)")).toBeDefined();
  });
});
