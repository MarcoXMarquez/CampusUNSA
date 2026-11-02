import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import HomePage from "./page";

describe("HomePage Component", () => {
  it("renders main iOS application navigation with Hoy view", () => {
    render(<HomePage />);
    expect(screen.getAllByText("Hoy").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Calendario")).toBeDefined();
    expect(screen.getByText("Ajustes")).toBeDefined();
  });

  it("renders the 3 campus geographical locations in Ajustes", () => {
    render(<HomePage />);
    const ajustesTab = screen.getByText("Ajustes");
    fireEvent.click(ajustesTab);
    expect(screen.getByText("Campus Ingenierias")).toBeDefined();
    expect(screen.getByText("Campus Biomedicas")).toBeDefined();
    expect(screen.getByText("Campus Sociales")).toBeDefined();
  });

  it("renders core infrastructure component indicators in Ajustes", () => {
    render(<HomePage />);
    const ajustesTab = screen.getByText("Ajustes");
    fireEvent.click(ajustesTab);
    expect(screen.getByText("FastAPI Core")).toBeDefined();
    expect(screen.getByText("PostgreSQL 16")).toBeDefined();
    expect(screen.getByText("Redis 7 Store")).toBeDefined();
  });
});
