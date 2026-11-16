import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HoyView } from "./HoyView";
import type { AcademicAssignment } from "@/components/sheets/TaskDetailSheet";
import type { AcademicCourse } from "@/hooks/useAcademicBoard";

const sampleCourses: AcademicCourse[] = [
  {
    id: "course-1",
    classroom_course_id: "1704257",
    name: "Calidad de Software",
    course_code: "1704257",
    theory_group: "A",
    lab_group: "B",
    mapping_status: "LINKED",
    sources: [
      {
        source_id: "src-1-lab",
        origin: "classroom",
        external_course_id: "gc-1",
        raw_name: "Calidad de Software - Lab",
        component_type: "LABORATORIO",
        mapping_status: "LINKED",
      },
    ],
    created_at: "2026-11-01T00:00:00Z",
  },
  {
    id: "course-2",
    classroom_course_id: "1704258",
    name: "Sistemas Distribuidos",
    course_code: "1704258",
    theory_group: "B",
    lab_group: null,
    mapping_status: "LINKED",
    sources: [
      {
        source_id: "src-2-unico",
        origin: "moodle",
        external_course_id: "md-2",
        raw_name: "Sistemas Distribuidos",
        component_type: "UNICO",
        mapping_status: "LINKED",
      },
    ],
    created_at: "2026-11-01T00:00:00Z",
  },
];

const baseTask: AcademicAssignment = {
  id: "task-1",
  course_id: "course-1",
  source_id: "src-1-lab",
  course_code: "1704257",
  classroom_assignment_id: "external-1",
  title: "Deliver sprint report",
  due_date: "2026-11-16T04:59:00Z", // Sun 23:59 Lima ("Hoy")
  origin: "classroom",
  component_type: "LABORATORIO",
  group_code: "B",
  priority: null,
  state: "PUBLISHED",
  is_completed: false,
  created_at: "2026-11-01T00:00:00Z",
};

const baseProps = {
  assignments: [baseTask],
  courses: sampleCourses,
  loading: false,
  syncing: false,
  isOnline: true,
  moodleSessionExpired: false,
  syncError: null,
  onRefresh: vi.fn(),
  onOpenSettings: vi.fn(),
  onReconnectMoodle: vi.fn(),
  onCompletionChange: vi.fn(),
  completionPending: false,
  completionError: null,
};

describe("Stitch Tareas board (HoyView)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Sunday 2026-11-15 19:00 America/Lima -> 2026-11-16T00:00:00Z
    vi.setSystemTime(new Date("2026-11-16T00:00:00.000Z"));
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("groups tasks into Vencidas, Hoy, Esta semana, Próximas, and Sin fecha with counts and priority", () => {
    render(
      <HoyView
        {...baseProps}
        assignments={[
          {
            ...baseTask,
            id: "overdue-1",
            title: "Informe de Calidad ISO 25010",
            due_date: "2026-11-10T04:59:00Z",
            priority: "ALTA",
          },
          baseTask,
          {
            ...baseTask,
            id: "week-1",
            course_id: "course-2",
            course_code: "1704258",
            source_id: "src-2-unico",
            component_type: "UNICO",
            group_code: "B",
            title: "Lectura Consenso Raft",
            due_date: "2026-11-19T04:59:00Z",
          },
          {
            ...baseTask,
            id: "upcoming-1",
            title: "Examen Final",
            due_date: "2026-11-28T04:59:00Z",
          },
          {
            ...baseTask,
            id: "undated-1",
            title: "Guia sin fecha",
            due_date: null,
          },
          {
            ...baseTask,
            id: "done-1",
            title: "Tarea ya completada",
            is_completed: true,
          },
        ]}
      />
    );

    expect(screen.getByRole("heading", { name: "Tareas" })).toBeDefined();
    for (const label of ["Vencidas", "Hoy", "Esta semana", "Próximas", "Sin fecha"]) {
      expect(screen.getByRole("region", { name: label })).toBeDefined();
    }
    expect(screen.queryByText("Tarea ya completada")).toBeNull();
    expect(screen.queryByRole("region", { name: "Completadas" })).toBeNull();

    const overdueRegion = screen.getByRole("region", { name: "Vencidas" });
    expect(within(overdueRegion).getByText("1 tarea")).toBeDefined();
    expect(within(overdueRegion).getByText("Alta")).toBeDefined();
    expect(within(overdueRegion).getByText(/Calidad de Software B/)).toBeDefined();
  });

  it("filters by Todas, Teoría (including UNICO), Lab, course dropdown, and text search", () => {
    render(
      <HoyView
        {...baseProps}
        assignments={[
          baseTask, // LABORATORIO, course-1
          {
            ...baseTask,
            id: "theory-unico",
            course_id: "course-2",
            course_code: "1704258",
            source_id: "src-2-unico",
            component_type: "UNICO",
            group_code: "B",
            title: "Lectura Consenso Raft",
          },
        ]}
      />
    );

    // Filter Lab: hides UNICO theory task
    fireEvent.click(screen.getByRole("button", { name: "Lab" }));
    expect(screen.getByText("Deliver sprint report")).toBeDefined();
    expect(screen.queryByText("Lectura Consenso Raft")).toBeNull();

    // Filter Teoria: shows UNICO task and hides Lab task
    fireEvent.click(screen.getByRole("button", { name: "Teoría" }));
    expect(screen.getByText("Lectura Consenso Raft")).toBeDefined();
    expect(screen.queryByText("Deliver sprint report")).toBeNull();

    // Back to Todas and filter by course dropdown
    fireEvent.click(screen.getByRole("button", { name: "Todas" }));
    fireEvent.change(screen.getByLabelText("Filtrar por curso"), {
      target: { value: "course-1" },
    });
    expect(screen.getByText("Deliver sprint report")).toBeDefined();
    expect(screen.queryByText("Lectura Consenso Raft")).toBeNull();

    // Reset course and search by title
    fireEvent.change(screen.getByLabelText("Filtrar por curso"), {
      target: { value: "all" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Buscar tareas" }));
    fireEvent.change(screen.getByPlaceholderText("Buscar por título o curso..."), {
      target: { value: "Raft" },
    });
    expect(screen.getByText("Lectura Consenso Raft")).toBeDefined();
    expect(screen.queryByText("Deliver sprint report")).toBeNull();
  });

  it("hides a task on inline check, displays Undo toast, and reverts on Deshacer", () => {
    render(<HoyView {...baseProps} />);

    fireEvent.click(
      screen.getByRole("button", { name: /Marcar como completada: Deliver sprint report/i })
    );

    expect(baseProps.onCompletionChange).toHaveBeenCalledWith("task-1", true);
    expect(screen.queryByRole("heading", { name: "Deliver sprint report" })).toBeNull();
    expect(screen.getByText("Tarea completada")).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Deshacer" }));
    expect(baseProps.onCompletionChange).toHaveBeenCalledWith("task-1", false);
    expect(screen.getByRole("heading", { name: "Deliver sprint report" })).toBeDefined();
    expect(screen.queryByText("Tarea completada")).toBeNull();
  });

  it("opens the pending implementation modal when tapping the task card body", () => {
    render(<HoyView {...baseProps} />);
    fireEvent.click(screen.getByRole("button", { name: /^Deliver sprint report/i }));

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Pendiente de implementación.")).toBeDefined();
    fireEvent.click(within(dialog).getByRole("button", { name: "Cerrar" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("prevents inline completion when offline and restores hidden task if completionError arrives", () => {
    const view = render(<HoyView {...baseProps} isOnline={false} />);
    fireEvent.click(
      screen.getByRole("button", { name: /Marcar como completada: Deliver sprint report/i })
    );
    expect(baseProps.onCompletionChange).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "Deliver sprint report" })).toBeDefined();
    expect(screen.getByText("Conéctate para guardar cambios de estado.")).toBeDefined();

    view.rerender(<HoyView {...baseProps} isOnline />);
    fireEvent.click(
      screen.getByRole("button", { name: /Marcar como completada: Deliver sprint report/i })
    );
    expect(screen.queryByRole("heading", { name: "Deliver sprint report" })).toBeNull();

    view.rerender(<HoyView {...baseProps} isOnline completionError="Failed" />);
    expect(screen.getByRole("heading", { name: "Deliver sprint report" })).toBeDefined();
    expect(screen.getByRole("alert").textContent).toContain("No se pudo guardar el cambio");
  });

  it("renders row skeletons, empty state, offline notice, Moodle reconnect, sync error, and clamps headlines", () => {
    const view = render(<HoyView {...baseProps} assignments={[]} loading />);
    expect(screen.getByRole("status", { name: "Cargando entregas" })).toBeDefined();
    expect(screen.queryByText("Nada pendiente. Disfruta tu día.")).toBeNull();

    view.rerender(<HoyView {...baseProps} assignments={[]} loading={false} />);
    expect(screen.getByText("Nada pendiente. Disfruta tu día.")).toBeDefined();

    const longTitle = "Long assignment title ".repeat(20).trim();
    view.rerender(
      <HoyView
        {...baseProps}
        assignments={[{ ...baseTask, title: longTitle }]}
        isOnline={false}
        moodleSessionExpired
        syncError="Connection failed"
      />
    );
    expect(screen.getByText("Sin conexión · mostrando datos guardados")).toBeDefined();
    expect(screen.getByText(longTitle).className).toContain("line-clamp-2");

    fireEvent.click(screen.getByRole("button", { name: /Sesión de Moodle vencida/i }));
    expect(baseProps.onReconnectMoodle).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(baseProps.onRefresh).toHaveBeenCalledOnce();
  });

  it("triggers onRefresh via pull-to-refresh touch gesture at top of scroll", () => {
    render(<HoyView {...baseProps} />);
    const container = screen.getByTestId("tareas-board");

    fireEvent.touchStart(container, { touches: [{ clientY: 100 }] });
    fireEvent.touchMove(container, { touches: [{ clientY: 260 }] });
    expect(screen.getByText("Suelta para actualizar")).toBeDefined();

    fireEvent.touchEnd(container);
    expect(baseProps.onRefresh).toHaveBeenCalledOnce();
  });

  it("auto-dismisses the undo toast after timeout without crashing", () => {
    render(<HoyView {...baseProps} />);
    fireEvent.click(
      screen.getByRole("button", { name: /Marcar como completada: Deliver sprint report/i })
    );
    expect(screen.getByText("Tarea completada")).toBeDefined();

    act(() => {
      vi.advanceTimersByTime(5500);
    });
    expect(screen.queryByText("Tarea completada")).toBeNull();
  });

  it("normalizes all-caps course and task titles into smart title case", () => {
    render(
      <HoyView
        {...baseProps}
        courses={[
          {
            ...sampleCourses[0],
            name: "DESARROLLO DE SOFTWARE PARA JUEGOS",
          },
        ]}
        assignments={[
          {
            ...baseTask,
            title: "ENTREGA DE INFORME ISO",
            courseName: "DESARROLLO DE SOFTWARE PARA JUEGOS",
          },
        ]}
      />
    );

    expect(screen.getByText("Entrega de Informe ISO")).toBeDefined();
    expect(screen.getByText("Desarrollo de Software para Juegos B")).toBeDefined();
    expect(screen.queryByText("ENTREGA DE INFORME ISO")).toBeNull();
  });
});
