import React from "react";
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CampusDirectory } from "./CampusDirectory";

vi.mock("./CampusMap", () => ({
  CampusMap: ({ selected }: { selected: { label: string } | null }) => (
    <div data-testid="map">{selected?.label}</div>
  ),
}));

afterEach(cleanup);

function search(value: string) {
  fireEvent.change(screen.getByRole("searchbox"), { target: { value } });
}

describe("CampusDirectory", () => {
  it("offers all three campuses and shows their addresses without a session", () => {
    render(<CampusDirectory isOnline onBack={vi.fn()} />);
    for (const campus of ["Ingenierías", "Biomédicas", "Sociales"]) {
      expect(screen.getByRole("button", { name: campus })).toBeEnabled();
    }
    expect(within(screen.getByRole("region", { name: "Escuelas profesionales" })).getAllByRole("listitem")).toHaveLength(49);
    fireEvent.click(screen.getByRole("button", { name: "Biomédicas" }));
    expect(screen.getByRole("button", { name: "Biomédicas" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("map")).toHaveTextContent("Biomédicas");
    expect(screen.getByText("Av. Daniel Alcides Carrión s/n")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /ingeniería de sistemas/i })).not.toBeInTheDocument();
  });

  it("finds schools with accent-insensitive queries and selects their map location", () => {
    render(<CampusDirectory isOnline onBack={vi.fn()} />);
    search("  ingenieria   SISTEMAS ");
    fireEvent.click(screen.getByRole("button", { name: /ingeniería de sistemas/i }));
    expect(screen.getByTestId("map")).toHaveTextContent("Ingeniería de Sistemas");
    expect(screen.getByRole("heading", { name: "Ingeniería de Sistemas" })).toBeInTheDocument();
  });

  it("keeps the official Agronomy address available offline and clears an empty search", () => {
    render(<CampusDirectory isOnline={false} onBack={vi.fn()} />);
    expect(screen.getByText(/sin conexión/i)).toBeInTheDocument();
    expect(screen.queryByTestId("map")).not.toBeInTheDocument();
    search("zzzz");
    expect(screen.getByText(/no encontramos escuelas/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Borrar búsqueda" }));
    search("agronomia");
    const result = screen.getByRole("button", { name: /agronomía/i });
    expect(within(result).getByText(/urb\. aurora/i)).toBeInTheDocument();
  });

  it("leaves the directory through its back control", () => {
    const onBack = vi.fn();
    render(<CampusDirectory isOnline onBack={onBack} />);
    fireEvent.click(screen.getByRole("button", { name: "Volver a Horario" }));
    expect(onBack).toHaveBeenCalledOnce();
  });
});
