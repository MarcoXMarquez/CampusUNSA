import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TareasSyncView } from "./TareasSyncView";

describe("TareasSyncView component", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders initial 0 de 2 conectadas state with Hugo avatar and Stitch layout", () => {
    const { container } = render(
      <TareasSyncView
        classroomConnected={false}
        moodleIcalConnected={false}
        onLinkClassroom={vi.fn()}
        onSubscribeMoodleIcal={vi.fn()}
      />
    );

    expect(screen.getByRole("heading", { name: "Tareas" })).toBeDefined();
    expect(screen.getByText("Conecta tus plataformas")).toBeDefined();
    expect(screen.getByText("Plataformas")).toBeDefined();
    expect(screen.getByText("0 de 2 conectadas")).toBeDefined();
    expect(screen.getAllByText("No conectado")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Conectar" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Vincular" })).toBeDefined();

    const mascot = screen.getByAltText("Mascota Pingüino CampusUNSA");
    expect(mascot.getAttribute("src")).toBe("/images/onboarding/step-2-courses.webp");

    // Verify edge-to-edge full-screen presentation without synthetic phone frame chrome
    expect(container.innerHTML).not.toContain("9:41");
    expect(container.innerHTML).not.toContain("rounded-[48px]");
  });

  it("updates progress indicator and platform buttons across partial connected states", () => {
    const { rerender } = render(
      <TareasSyncView
        classroomConnected={true}
        moodleIcalConnected={false}
        onLinkClassroom={vi.fn()}
        onSubscribeMoodleIcal={vi.fn()}
      />
    );

    expect(screen.getByText("1 de 2 conectadas")).toBeDefined();
    expect(screen.getAllByText("Conectado").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("No conectado")).toBeDefined();
    const classroomBtn = screen.getByRole("button", { name: "Conectado" }) as HTMLButtonElement;
    expect(classroomBtn.disabled).toBe(true);

    rerender(
      <TareasSyncView
        classroomConnected={false}
        moodleIcalConnected={true}
        onLinkClassroom={vi.fn()}
        onSubscribeMoodleIcal={vi.fn()}
      />
    );

    expect(screen.getByText("1 de 2 conectadas")).toBeDefined();
    const duticUpdateBtn = screen.getByRole("button", {
      name: "Actualizar",
    }) as HTMLButtonElement;
    expect(duticUpdateBtn.disabled).toBe(false);
  });

  it("triggers Google Classroom connection handler when clicking Conectar", () => {
    const onLinkClassroom = vi.fn();
    render(
      <TareasSyncView
        classroomConnected={false}
        moodleIcalConnected={false}
        onLinkClassroom={onLinkClassroom}
        onSubscribeMoodleIcal={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Conectar" }));
    expect(onLinkClassroom).toHaveBeenCalledOnce();
  });

  it("opens the Moodle iCal modal and submits the entered URL", async () => {
    const onSubscribeMoodleIcal = vi.fn().mockResolvedValue(undefined);
    render(
      <TareasSyncView
        classroomConnected={false}
        moodleIcalConnected={false}
        onLinkClassroom={vi.fn()}
        onSubscribeMoodleIcal={onSubscribeMoodleIcal}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Vincular" }));
    const dialog = screen.getByRole("dialog", { name: "Suscribir Moodle iCal" });
    expect(dialog).toBeDefined();

    const input = screen.getByLabelText("URL de calendario iCal de Moodle") as HTMLInputElement;
    fireEvent.change(input, {
      target: {
        value:
          "https://aulavirtual.unsa.edu.pe/2026B/calendar/export_execute.php?userid=1&authtoken=abc",
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Suscribir" }));

    await waitFor(() => {
      expect(onSubscribeMoodleIcal).toHaveBeenCalledWith(
        "https://aulavirtual.unsa.edu.pe/2026B/calendar/export_execute.php?userid=1&authtoken=abc"
      );
    });

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Suscribir Moodle iCal" })).toBeNull();
    });
  });

  it("displays validation error inside iCal modal when subscription rejects", async () => {
    const onSubscribeMoodleIcal = vi
      .fn()
      .mockRejectedValue(new Error("URL iCal no permitida"));
    render(
      <TareasSyncView
        classroomConnected={false}
        moodleIcalConnected={false}
        onLinkClassroom={vi.fn()}
        onSubscribeMoodleIcal={onSubscribeMoodleIcal}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Vincular" }));
    const input = screen.getByLabelText("URL de calendario iCal de Moodle");
    fireEvent.change(input, { target: { value: "https://invalid.example.com/cal.ics" } });
    fireEvent.click(screen.getByRole("button", { name: "Suscribir" }));

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toContain("URL iCal no permitida");
    });
  });

  it("opens and closes the temporary tutorial modal when clicking the iCal help link", () => {
    render(
      <TareasSyncView
        classroomConnected={false}
        moodleIcalConnected={false}
        onLinkClassroom={vi.fn()}
        onSubscribeMoodleIcal={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "¿Dónde encuentro mi enlace iCal?" }));
    expect(screen.getByRole("dialog", { name: "Guía de sincronización" })).toBeDefined();
    expect(screen.getByText("Acá irá el tutorial para extraer el enlace")).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Entendido" }));
    expect(screen.queryByRole("dialog", { name: "Guía de sincronización" })).toBeNull();
  });
});
