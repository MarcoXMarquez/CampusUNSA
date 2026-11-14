import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HorarioView } from "./HorarioView";
import type { AcademicAssignment } from "./TaskDetailSheet";
import type { AcademicCourse } from "../hooks/useAcademicBoard";

const baseLinkedCourse: AcademicCourse = {
  id: "enr-1",
  classroom_course_id: "1705275",
  name: "Desarrollo de Software para Juegos",
  origin: "classroom",
  course_code: "1705275",
  curriculum_year: 2017,
  theory_group: "A",
  lab_group: "B",
  mapping_status: "LINKED",
  sources: [
    {
      source_id: "src-1",
      origin: "classroom",
      external_course_id: "gc-1",
      raw_name: "Desarrollo de Software para Juegos - A",
      component_type: "TEORIA",
      mapping_status: "LINKED",
    },
  ],
  schedule_blocks: [
    {
      id: "blk-1",
      course_code: "1705275",
      term: "2026B",
      component_type: "TEORIA",
      group_code: "A",
      day_of_week: 1,
      start_time: "08:40",
      end_time: "10:20",
      room: "Aula 204",
    },
    {
      id: "blk-2",
      course_code: "1705275",
      term: "2026B",
      component_type: "LABORATORIO",
      group_code: "B",
      day_of_week: 3,
      start_time: "15:50",
      end_time: "17:30",
      room: "Lab 4",
    },
  ],
  created_at: "2026-11-01T00:00:00Z",
};

const baseAssignments: AcademicAssignment[] = [
  {
    id: "a-1",
    course_id: "enr-1",
    course_code: "1705275",
    classroom_assignment_id: "gc-a1",
    title: "Prototype",
    state: "PUBLISHED",
    is_completed: true,
    origin: "classroom",
    created_at: "2026-11-01T00:00:00Z",
  },
  {
    id: "a-2",
    course_id: "enr-1",
    course_code: "1705275",
    classroom_assignment_id: "gc-a2",
    title: "Physics Engine",
    state: "PUBLISHED",
    is_completed: false,
    origin: "classroom",
    created_at: "2026-11-01T00:00:00Z",
  },
];

describe("HorarioView component", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders mandatory loading skeletons, empty guidance, offline, expired, and error states", () => {
    const onRefresh = vi.fn();
    const onReconnectMoodle = vi.fn();

    // 1. Loading skeleton state
    const { rerender } = render(
      <HorarioView
        courses={[]}
        assignments={[]}
        loading={true}
        syncing={false}
        isOnline={true}
        moodleSessionExpired={false}
        syncError={null}
        onRefresh={onRefresh}
        onReconnectMoodle={onReconnectMoodle}
        onOpenNewTask={vi.fn()}
      />
    );
    expect(screen.getByRole("status", { name: "Cargando horario" })).toBeDefined();

    // 2. Empty state
    rerender(
      <HorarioView
        courses={[]}
        assignments={[]}
        loading={false}
        syncing={false}
        isOnline={true}
        moodleSessionExpired={false}
        syncError={null}
        onRefresh={onRefresh}
        onReconnectMoodle={onReconnectMoodle}
        onOpenNewTask={vi.fn()}
      />
    );
    expect(screen.getByText("Aún no tienes cursos vinculados.")).toBeDefined();

    // 3. Offline + Expired + Sync error while preserving existing courses + Long course title truncation
    const longCourse: AcademicCourse = {
      ...baseLinkedCourse,
      name: "Arquitectura de Sistemas Distribuidos Avanzados y Computación en la Nube de Alta Disponibilidad",
    };
    rerender(
      <HorarioView
        courses={[longCourse]}
        assignments={baseAssignments}
        loading={false}
        syncing={false}
        isOnline={false}
        moodleSessionExpired={true}
        syncError="Error al actualizar"
        onRefresh={onRefresh}
        onReconnectMoodle={onReconnectMoodle}
        onOpenNewTask={vi.fn()}
      />
    );

    expect(screen.getByText("Sin conexión · mostrando datos guardados")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: /Sesión de Moodle vencida/i }));
    expect(onReconnectMoodle).toHaveBeenCalledTimes(1);

    expect(screen.getByRole("alert")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(onRefresh).toHaveBeenCalledTimes(1);

    const titles = screen.getAllByText(longCourse.name);
    expect(titles.some((el) => el.className.includes("line-clamp-2"))).toBe(true);
  });

  it("computes Siguiente card in America/Lima for upcoming today, in-progress, and next-week sessions", () => {
    // Monday 2026-11-16 08:15 America/Lima -> 25 min before Mon 08:40-10:20 TEORIA A
    const mondayMorning = new Date("2026-11-16T08:15:00-05:00");
    const { rerender } = render(
      <HorarioView
        courses={[baseLinkedCourse]}
        assignments={baseAssignments}
        loading={false}
        syncing={false}
        isOnline={true}
        moodleSessionExpired={false}
        syncError={null}
        currentTime={mondayMorning}
        onRefresh={vi.fn()}
        onReconnectMoodle={vi.fn()}
        onOpenNewTask={vi.fn()}
      />
    );

    expect(screen.getByText(/Siguiente · en 25 min/)).toBeDefined();
    expect(screen.getAllByText("08:40").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/10:20/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Teoría A · Aula 204/)).toBeDefined();

    // Monday 2026-11-16 09:55 America/Lima -> currently in progress, ends in 25 min
    const mondayDuringClass = new Date("2026-11-16T09:55:00-05:00");
    rerender(
      <HorarioView
        courses={[baseLinkedCourse]}
        assignments={baseAssignments}
        loading={false}
        syncing={false}
        isOnline={true}
        moodleSessionExpired={false}
        syncError={null}
        currentTime={mondayDuringClass}
        onRefresh={vi.fn()}
        onReconnectMoodle={vi.fn()}
        onOpenNewTask={vi.fn()}
      />
    );
    expect(screen.getByText(/En curso · termina en 25 min/)).toBeDefined();

    // Thursday 2026-11-19 20:00 America/Lima -> next session wraps to Monday 08:40
    const thursdayNight = new Date("2026-11-19T20:00:00-05:00");
    rerender(
      <HorarioView
        courses={[baseLinkedCourse]}
        assignments={baseAssignments}
        loading={false}
        syncing={false}
        isOnline={true}
        moodleSessionExpired={false}
        syncError={null}
        currentTime={thursdayNight}
        onRefresh={vi.fn()}
        onReconnectMoodle={vi.fn()}
        onOpenNewTask={vi.fn()}
      />
    );
    expect(screen.getByText(/Siguiente · Lun 08:40/)).toBeDefined();
  });

  it("renders schedule rows, delivery progress counts, and triggers + Tarea handler", () => {
    const onOpenNewTask = vi.fn();
    const completedCourse: AcademicCourse = {
      ...baseLinkedCourse,
      id: "enr-2",
      course_code: "1704257",
      name: "Negocios Electronicos",
      schedule_blocks: [],
    };
    const completedTask: AcademicAssignment = {
      id: "a-3",
      course_id: "enr-2",
      course_code: "1704257",
      classroom_assignment_id: "gc-a3",
      title: "Informe Final",
      state: "PUBLISHED",
      is_completed: true,
      origin: "moodle",
      created_at: "2026-11-01T00:00:00Z",
    };

    render(
      <HorarioView
        courses={[baseLinkedCourse, completedCourse]}
        assignments={[...baseAssignments, completedTask]}
        loading={false}
        syncing={false}
        isOnline={true}
        moodleSessionExpired={false}
        syncError={null}
        currentTime={new Date("2026-11-16T08:15:00-05:00")}
        onRefresh={vi.fn()}
        onReconnectMoodle={vi.fn()}
        onOpenNewTask={onOpenNewTask}
      />
    );

    expect(screen.getAllByText("Teoría A · Lab B").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Lun 08:40–10:20 · Aula 204/)).toBeDefined();
    expect(screen.getByText(/Mié 15:50–17:30 · Lab 4/)).toBeDefined();
    expect(screen.getByText(/1\/2 entregas/)).toBeDefined();
    expect(screen.getByText("1 pendiente")).toBeDefined();
    expect(screen.getByText("1/1 entregas")).toBeDefined();

    const addButtons = screen.getAllByRole("button", { name: "+ Tarea" });
    fireEvent.click(addButtons[0]);
    expect(onOpenNewTask).toHaveBeenCalledWith(baseLinkedCourse);
  });

  it("opens schedule editor modal, edits groups and blocks, and saves via onSaveSchedule", async () => {
    const onSaveSchedule = vi.fn().mockResolvedValue(undefined);
    const onLoadGroupSchedule = vi.fn().mockResolvedValue([]);

    render(
      <HorarioView
        courses={[baseLinkedCourse]}
        assignments={baseAssignments}
        loading={false}
        syncing={false}
        isOnline={true}
        moodleSessionExpired={false}
        syncError={null}
        currentTime={new Date("2026-11-16T08:15:00-05:00")}
        onRefresh={vi.fn()}
        onReconnectMoodle={vi.fn()}
        onOpenNewTask={vi.fn()}
        onSaveSchedule={onSaveSchedule}
        onLoadGroupSchedule={onLoadGroupSchedule}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Editar horario/i }));

    expect(screen.getByRole("dialog", { name: /Editar horario/i })).toBeDefined();

    const theorySelect = screen.getByLabelText("Grupo de Teoría");
    fireEvent.change(theorySelect, { target: { value: "C" } });

    await waitFor(() => {
      expect(onLoadGroupSchedule).toHaveBeenCalledWith("1705275", "C", "B");
    });

    fireEvent.click(screen.getByRole("button", { name: /\+ Agregar sesión/i }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar horario" }));

    await waitFor(() => {
      expect(onSaveSchedule).toHaveBeenCalledTimes(1);
    });
    const [savedCode, savedPayload] = onSaveSchedule.mock.calls[0];
    expect(savedCode).toBe("1705275");
    expect(savedPayload.theory_group).toBe("C");
    expect(savedPayload.lab_group).toBe("B");
    expect(savedPayload.blocks.length).toBeGreaterThanOrEqual(1);
  });

  it("renders compact PENDING_LINK section and links external source to official course", async () => {
    const pendingCourse: AcademicCourse = {
      id: "src-pending-1",
      classroom_course_id: "ext-99",
      name: "Curso 26B_20-CG-Teoria",
      origin: "moodle",
      course_code: null,
      mapping_status: "PENDING_LINK",
      sources: [
        {
          source_id: "src-pending-1",
          origin: "moodle",
          external_course_id: "ext-99",
          raw_name: "Curso 26B_20-CG-Teoria",
          component_type: "TEORIA",
          mapping_status: "PENDING_LINK",
        },
      ],
      schedule_blocks: [],
      created_at: "2026-11-01T00:00:00Z",
    };

    const onLinkPendingSource = vi.fn().mockResolvedValue(undefined);

    render(
      <HorarioView
        courses={[baseLinkedCourse, pendingCourse]}
        assignments={baseAssignments}
        catalogCourses={[
          {
            code: "1703239",
            curriculum_year: 2017,
            official_name: "COMPUTACION GRAFICA",
            normalized_name: "COMPUTACION GRAFICA",
            category: "E",
            study_year: 3,
            semester: 2,
            department: "INGENIERIA DE SIST",
            credits: 4,
            prerequisites: [],
            min_credits_required: 0,
            theory_hours: 2,
            practice_hours: 2,
            lab_hours: 2,
          },
        ]}
        loading={false}
        syncing={false}
        isOnline={true}
        moodleSessionExpired={false}
        syncError={null}
        onRefresh={vi.fn()}
        onReconnectMoodle={vi.fn()}
        onOpenNewTask={vi.fn()}
        onLinkPendingSource={onLinkPendingSource}
      />
    );

    expect(screen.getByText("Cursos pendientes de vincular")).toBeDefined();
    expect(screen.getByText("Curso 26B_20-CG-Teoria")).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Vincular curso" }));
    expect(screen.getByRole("dialog", { name: "Vincular curso al catálogo" })).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: /1703239/i }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar vinculación" }));

    await waitFor(() => {
      expect(onLinkPendingSource).toHaveBeenCalledWith("src-pending-1", {
        course_code: "1703239",
        component_type: "TEORIA",
        group_code: "A",
      });
    });
  });
});
