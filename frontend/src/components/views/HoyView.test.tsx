import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HoyView } from "./HoyView";
import type { AcademicAssignment } from "@/components/sheets/TaskDetailSheet";

const task: AcademicAssignment = {
  id: "task-1", course_id: "course-1", classroom_assignment_id: "external-1",
  title: "Deliver sprint report", due_date: "2026-11-03T18:00:00Z",
  origin: "classroom", state: "PUBLISHED", created_at: "2026-11-01T00:00:00Z",
};
const baseProps = {
  assignments: [task], courses: [], loading: false, syncing: false, isOnline: true,
  moodleSessionExpired: false, syncError: null,
  onRefresh: vi.fn(), onOpenSettings: vi.fn(), onReconnectMoodle: vi.fn(),
  onCompletionChange: vi.fn(), completionPending: false, completionError: null,
};

describe("urgency task board", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-03T12:00:00Z"));
    vi.clearAllMocks();
  });
  afterEach(() => { cleanup(); vi.useRealTimers(); });

  it("groups tasks into red, yellow and green urgency windows", () => {
    render(<HoyView {...baseProps} assignments={[
      task,
      { ...task, id: "soon", title: "Prepare presentation", due_date: "2026-11-05T12:00:00Z" },
      { ...task, id: "later", title: "Research project", due_date: "2026-11-07T12:00:00Z" },
    ]} />);
    for (const label of ["Menos de 24 h", "De 24 a 72 h", "Más de 72 h"]) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
    expect(screen.getByLabelText("Urgencia: menos de 24 horas").getAttribute("data-urgency")).toBe("urgent");
    expect(screen.getByLabelText("Urgencia: de 24 a 72 horas").getAttribute("data-urgency")).toBe("soon");
    expect(screen.getByLabelText("Urgencia: más de 72 horas").getAttribute("data-urgency")).toBe("later");
  });

  it("renders row skeletons while loading", () => {
    render(<HoyView {...baseProps} assignments={[]} loading />);
    expect(screen.getByRole("status", { name: "Cargando entregas" })).toBeDefined();
    expect(screen.queryByText("Nada pendiente. Disfruta tu día.")).toBeNull();
  });

  it("renders the empty state", () => {
    render(<HoyView {...baseProps} assignments={[]} />);
    expect(screen.getByText("Nada pendiente. Disfruta tu día.")).toBeDefined();
  });

  it("keeps cached tasks visible offline", () => {
    render(<HoyView {...baseProps} isOnline={false} />);
    expect(screen.getByText("Sin conexión · mostrando datos guardados")).toBeDefined();
    expect(screen.getByText(task.title)).toBeDefined();
  });

  it("offers Moodle reconnection without hiding Classroom content", () => {
    render(<HoyView {...baseProps} moodleSessionExpired />);
    fireEvent.click(screen.getByRole("button", { name: "Reconectar Moodle" }));
    expect(baseProps.onReconnectMoodle).toHaveBeenCalledOnce();
    expect(screen.getByText(task.title)).toBeDefined();
  });

  it("retains tasks after sync errors and offers retry", () => {
    render(<HoyView {...baseProps} syncError="Connection failed" />);
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(baseProps.onRefresh).toHaveBeenCalledOnce();
    expect(screen.getByText(task.title)).toBeDefined();
  });

  it("clamps long headlines", () => {
    const title = "Long assignment title ".repeat(20);
    render(<HoyView {...baseProps} assignments={[{ ...task, title }]} />);
    expect(screen.getByText(title.trim()).className).toContain("line-clamp-2");
  });

  it("opens a detail sheet with a completion action instead of a row action", () => {
    render(<HoyView {...baseProps} />);
    const row = screen.getByRole("button", { name: /Deliver sprint report/ });
    expect(within(row).queryByRole("button")).toBeNull();
    fireEvent.click(row);
    fireEvent.click(screen.getByRole("button", { name: "Marcar como completada" }));
    expect(baseProps.onCompletionChange).toHaveBeenCalledWith(task.id, true);
  });

  it("updates the selected detail when an optimistic task change arrives", () => {
    const view = render(<HoyView {...baseProps} />);
    fireEvent.click(screen.getByRole("button", { name: /Deliver sprint report/ }));
    view.rerender(<HoyView {...baseProps} assignments={[{ ...task, is_completed: true }]} />);
    expect(screen.getByRole("button", { name: "Marcar como pendiente" })).toBeDefined();
  });

  it("recalculates urgency while the board remains open", () => {
    render(<HoyView {...baseProps} assignments={[{ ...task, due_date: "2026-11-04T12:00:00Z" }]} />);
    expect(screen.getByLabelText("Urgencia: de 24 a 72 horas")).toBeDefined();
    act(() => { vi.advanceTimersByTime(30_000); });
    expect(screen.getByLabelText("Urgencia: menos de 24 horas")).toBeDefined();
  });

  it("prevents offline completion without removing cached tasks", () => {
    render(<HoyView {...baseProps} isOnline={false} />);
    fireEvent.click(screen.getByRole("button", { name: /Deliver sprint report/ }));
    expect(screen.getByRole("button", { name: "Marcar como completada" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByText("Conéctate para guardar cambios de estado.")).toBeDefined();
  });

  it("hides the next-class countdown widget when courses have no schedule blocks", () => {
    render(<HoyView {...baseProps} courses={[]} />);
    expect(screen.queryByRole("button", { name: /Ver horario semanal completo/i })).toBeNull();
  });

  it("renders next-class widget below filter with room/pavilion and opens Horario tab on click", () => {
    // Tuesday 2026-11-17 09:30 America/Lima -> 14:30Z
    vi.setSystemTime(new Date("2026-11-17T14:30:00Z"));
    const onOpenSchedule = vi.fn();
    render(
      <HoyView
        {...baseProps}
        onOpenSchedule={onOpenSchedule}
        courses={[
          {
            id: "course-1",
            classroom_course_id: "1705275",
            name: "Ingeniería de Sistemas",
            origin: "classroom",
            course_code: "1705275",
            mapping_status: "LINKED",
            schedule_blocks: [
              {
                id: "blk-1",
                course_code: "1705275",
                term: "2026B",
                component_type: "TEORIA",
                group_code: "A",
                day_of_week: 2,
                start_time: "10:00",
                end_time: "11:40",
                room: "Aula 201",
                pavilion: "Pabellón Matilde Pérez",
              },
            ],
            created_at: "2026-11-01T00:00:00Z",
          },
        ]}
      />
    );

    const widgetBtn = screen.getByRole("button", { name: /Ver horario semanal completo/i });
    expect(within(widgetBtn).getByText("Próxima clase en 30 min")).toBeDefined();
    expect(within(widgetBtn).getByText("Ingeniería de Sistemas")).toBeDefined();
    expect(within(widgetBtn).getByText(/Aula 201 · Pabellón Matilde Pérez/)).toBeDefined();

    fireEvent.click(widgetBtn);
    expect(onOpenSchedule).toHaveBeenCalledOnce();
  });
});
