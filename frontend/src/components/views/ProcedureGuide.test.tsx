import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ProcedureGuide } from "./ProcedureGuide";

describe("ProcedureGuide", () => {
  it("loads all four guides and returns to the assistant", () => {
    const onBack = vi.fn();
    render(<ProcedureGuide isOnline onBack={onBack} />);
    for (const title of ["Retiro de curso", "Rectificación de matrícula", "Exoneración de pagos", "Acceso a biblioteca"]) {
      expect(screen.getByRole("button", { name: new RegExp(title) })).toBeInTheDocument();
    }
    fireEvent.click(screen.getByRole("button", { name: "Volver a Hugo" }));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it("progresses through withdrawal requirements, dates, payment and forms", () => {
    render(<ProcedureGuide isOnline onBack={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /^Retiro de curso/ }));
    expect(screen.getByRole("heading", { name: "Requisitos" })).toHaveFocus();
    expect(screen.getByText(/constancia de matrícula/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Anterior" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    expect(screen.getByRole("heading", { name: "Plazo de presentación" })).toHaveFocus();
    expect(screen.getByText(/del 10 al 21 de agosto de 2026/i)).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Plazo de presentación" })).getByRole("link", { name: /cronograma oficial/i })).toHaveAttribute(
      "href", "https://transparencia.unsa.edu.pe/handle/123456789/1727",
    );
    const steps = within(screen.getByRole("navigation", { name: "Pasos del trámite" }));
    expect(steps.getByRole("button", { name: "Plazo de presentación" })).toHaveAttribute("aria-current", "step");
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    expect(screen.getByRole("heading", { name: "Pago y código" })).toHaveFocus();
    expect(screen.getByText(/código.*generado/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    expect(screen.getByRole("heading", { name: "Formulario y entrega" })).toHaveFocus();
    expect(screen.getByRole("link", { name: /ficha oficial/i })).toHaveAttribute("target", "_blank");
    expect(screen.queryByRole("button", { name: "Siguiente" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Anterior" }));
    expect(screen.getByRole("heading", { name: "Pago y código" })).toHaveFocus();
  });

  it("shows guidance when the catalog has no entries", () => {
    render(<ProcedureGuide isOnline onBack={vi.fn()} items={[]} />);
    expect(screen.getByText("No hay trámites disponibles.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Volver a Hugo" })).toBeInTheDocument();
  });

  it("keeps the bundled guide visible offline and resets navigation when another guide is chosen", () => {
    render(<ProcedureGuide isOnline={false} onBack={vi.fn()} />);
    expect(screen.getByRole("status")).toHaveTextContent(/sin conexión/i);
    fireEvent.click(screen.getByRole("button", { name: /^Retiro de curso/ }));
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    fireEvent.click(screen.getByRole("button", { name: "Volver a trámites" }));
    expect(screen.getByRole("heading", { name: "Guía de trámites" })).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: /^Acceso a biblioteca/ }));
    expect(screen.getByRole("heading", { name: "Requisitos" })).toHaveFocus();
  });
});
