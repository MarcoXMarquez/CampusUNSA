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
});
