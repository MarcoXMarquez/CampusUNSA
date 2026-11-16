import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BottomTabBar } from "./BottomTabBar";

describe("BottomTabBar liquid glass navigation dock", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders floating liquid-glass capsule dock with 5 accessible controls and elevated crimson + FAB", () => {
    const onSelectTab = vi.fn();
    const onOpenNewTask = vi.fn();

    const { container } = render(
      <BottomTabBar
        activeTab="tareas"
        onSelectTab={onSelectTab}
        onOpenNewTask={onOpenNewTask}
      />
    );

    const dock = container.querySelector(".liquid-glass-dock");
    expect(dock).not.toBeNull();
    expect(dock?.className).toContain("rounded-full");

    const svgFilter = container.querySelector("#campus-liquid-glass-dock");
    expect(svgFilter).not.toBeNull();

    const tareasBtn = screen.getByRole("button", { name: "Tareas" });
    const horarioBtn = screen.getByRole("button", { name: "Horario" });
    const createBtn = screen.getByRole("button", { name: "Crear nueva tarea" });
    const hugoBtn = screen.getByRole("button", { name: "Hugo" });
    const ajustesBtn = screen.getByRole("button", { name: "Ajustes" });

    expect(tareasBtn.getAttribute("aria-current")).toBe("page");
    expect(horarioBtn.getAttribute("aria-current")).toBeNull();

    // Central + FAB elevates above dock rim with solid crimson fill, subtle border, soft shadow, and press scale
    expect(createBtn.className).toContain("-translate-y-4");
    expect(createBtn.className).toContain("rounded-full");
    expect(createBtn.className).toContain("bg-brand-cta");
    expect(createBtn.className).toContain("shadow-lg");
    expect(createBtn.className).toContain("active:scale-95");

    fireEvent.click(horarioBtn);
    expect(onSelectTab).toHaveBeenCalledWith("horario");

    fireEvent.click(hugoBtn);
    expect(onSelectTab).toHaveBeenCalledWith("hugo");

    fireEvent.click(ajustesBtn);
    expect(onSelectTab).toHaveBeenCalledWith("ajustes");

    fireEvent.click(createBtn);
    expect(onOpenNewTask).toHaveBeenCalledTimes(1);
  });

  it("highlights selected tab with crimson icon and label without any circular or pill background", () => {
    render(
      <BottomTabBar
        activeTab="horario"
        onSelectTab={vi.fn()}
        onOpenNewTask={vi.fn()}
      />
    );

    const horarioBtn = screen.getByRole("button", { name: "Horario" });
    const tareasBtn = screen.getByRole("button", { name: "Tareas" });

    expect(horarioBtn.getAttribute("aria-current")).toBe("page");
    expect(horarioBtn.className).toContain("text-brand-action");
    expect(horarioBtn.className).toContain("transition-colors");
    expect(horarioBtn.className).not.toContain("bg-brand-action");
    expect(horarioBtn.className).not.toContain("ring-");
    expect(tareasBtn.className).toContain("text-ink-secondary");
    expect(tareasBtn.className).not.toContain("bg-");
  });

  it("disables gentle SVG turbulence animation when prefers-reduced-motion is reduce", () => {
    vi.spyOn(window, "matchMedia").mockImplementation(
      (query: string): MediaQueryList =>
        ({
          matches: query === "(prefers-reduced-motion: reduce)",
          media: query,
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(),
        }) as unknown as MediaQueryList
    );

    const { container } = render(
      <BottomTabBar
        activeTab="tareas"
        onSelectTab={vi.fn()}
        onOpenNewTask={vi.fn()}
      />
    );

    expect(container.querySelector("#campus-liquid-glass-dock")).not.toBeNull();
    expect(
      container.querySelector("#campus-liquid-glass-dock animate")
    ).toBeNull();
  });
});
