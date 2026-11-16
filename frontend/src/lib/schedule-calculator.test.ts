import { describe, expect, it } from "vitest";
import type { AcademicCourse } from "@/hooks/useAcademicBoard";
import type { CourseScheduleBlock } from "@/lib/api-client";
import {
  buildCalendarMonthGrid,
  buildWeeklySchedule,
  formatCourseDisplayName,
  formatCourseGroupSubtitle,
  formatLimaDueDateTimeInput,
  formatLimaDueDisplay,
  formatRelativeDueSummary,
  formatShortWeekdayDay,
  getLimaQuickDueDate,
  parseLimaDateTimeInput,
  resolveNextClass,
  resolveNextCourseSessionIso,
} from "./schedule-calculator";

function makeBlock(
  overrides: Partial<CourseScheduleBlock> & {
    day_of_week: number;
    start_time: string;
    end_time: string;
  }
): CourseScheduleBlock {
  return {
    id: overrides.id ?? `blk-${overrides.day_of_week}-${overrides.start_time}`,
    course_code: overrides.course_code ?? "1705275",
    term: overrides.term ?? "2026B",
    component_type: overrides.component_type ?? "TEORIA",
    group_code: overrides.group_code ?? "A",
    day_of_week: overrides.day_of_week,
    start_time: overrides.start_time,
    end_time: overrides.end_time,
    room: overrides.room !== undefined ? overrides.room : "Aula 201",
    pavilion: overrides.pavilion !== undefined ? overrides.pavilion : "Pabellón Matilde Pérez",
  };
}

function makeCourse(overrides: Partial<AcademicCourse> = {}): AcademicCourse {
  return {
    id: overrides.id ?? "enr-1",
    classroom_course_id: overrides.classroom_course_id ?? "1705275",
    name: overrides.name ?? "Ingeniería de Sistemas",
    origin: overrides.origin ?? "classroom",
    course_code: overrides.course_code ?? "1705275",
    curriculum_year: 2017,
    theory_group: overrides.theory_group !== undefined ? overrides.theory_group : "A",
    lab_group: overrides.lab_group !== undefined ? overrides.lab_group : "B",
    section: overrides.section ?? null,
    mapping_status: overrides.mapping_status ?? "LINKED",
    sources: [],
    schedule_blocks: overrides.schedule_blocks ?? [],
    created_at: "2026-11-01T00:00:00Z",
  };
}

describe("schedule-calculator domain logic", () => {
  it("returns null when linked courses have no blocks or only pending courses exist", () => {
    const pending = makeCourse({
      mapping_status: "PENDING_LINK",
      schedule_blocks: [makeBlock({ day_of_week: 1, start_time: "08:00", end_time: "10:00" })],
    });
    const emptyLinked = makeCourse({ schedule_blocks: [] });
    const now = new Date("2026-11-17T09:30:00-05:00");

    expect(resolveNextClass([pending, emptyLinked], now)).toBeNull();
  });

  it("computes upcoming class later today with exact countdown, room, and pavilion", () => {
    const course = makeCourse({
      name: "Ingeniería de Sistemas",
      schedule_blocks: [
        makeBlock({
          day_of_week: 2,
          start_time: "10:00",
          end_time: "11:40",
          room: "Aula 201",
          pavilion: "Pabellón Matilde Pérez",
        }),
      ],
    });

    const summary = resolveNextClass([course], new Date("2026-11-17T09:30:00-05:00"));
    expect(summary).not.toBeNull();
    expect(summary?.status).toBe("UPCOMING_TODAY");
    expect(summary?.minutesRemaining).toBe(30);
    expect(summary?.subLabel).toBe("Siguiente clase · en 30 min");
    expect(summary?.widgetStatusLabel).toBe("Próxima clase en 30 min");
    expect(summary?.locationLabel).toBe("Aula 201 · Pabellón Matilde Pérez");
    expect(summary?.isTomorrow).toBe(false);
  });

  it("transitions across consecutive slots and midday UTC-to-Lima boundary", () => {
    const course = makeCourse({
      schedule_blocks: [
        makeBlock({ id: "b1", day_of_week: 3, start_time: "10:20", end_time: "12:00", room: "Aula 101" }),
        makeBlock({
          id: "b2",
          day_of_week: 3,
          start_time: "12:00",
          end_time: "13:40",
          component_type: "LABORATORIO",
          group_code: "B",
          room: "Lab 4",
          pavilion: "Pabellón Alan Turing",
        }),
      ],
    });

    // 17:00Z = 12:00 America/Lima -> boundary moves cleanly into second consecutive slot
    const summary = resolveNextClass([course], new Date("2026-11-18T17:00:00Z"));
    expect(summary?.status).toBe("IN_PROGRESS");
    expect(summary?.block.id).toBe("b2");
    expect(summary?.minutesRemaining).toBe(100);
    expect(summary?.subLabel).toBe("En curso · termina en 1 h 40 min");
  });

  it("breaks overlapping active slots deterministically by earliest end_time", () => {
    const c1 = makeCourse({
      id: "c1",
      course_code: "1705275",
      name: "Curso Largo",
      schedule_blocks: [makeBlock({ id: "long", course_code: "1705275", day_of_week: 1, start_time: "09:00", end_time: "11:30" })],
    });
    const c2 = makeCourse({
      id: "c2",
      course_code: "1704257",
      name: "Curso Corto",
      schedule_blocks: [makeBlock({ id: "short", course_code: "1704257", day_of_week: 1, start_time: "09:30", end_time: "10:30" })],
    });

    const summary = resolveNextClass([c1, c2], new Date("2026-11-16T09:45:00-05:00"));
    expect(summary?.status).toBe("IN_PROGRESS");
    expect(summary?.course.course_code).toBe("1704257");
    expect(summary?.minutesRemaining).toBe(45);
  });

  it("distinguishes tomorrow sessions from multi-day/weekend jumps", () => {
    const course = makeCourse({
      schedule_blocks: [
        makeBlock({ id: "mon", day_of_week: 1, start_time: "08:00", end_time: "09:40" }),
        makeBlock({ id: "wed", day_of_week: 3, start_time: "08:00", end_time: "09:40" }),
      ],
    });

    // Tuesday 20:00 -> tomorrow Wednesday 08:00
    const tuesdayNight = resolveNextClass([course], new Date("2026-11-17T20:00:00-05:00"));
    expect(tuesdayNight?.status).toBe("NEXT_DAY");
    expect(tuesdayNight?.isTomorrow).toBe(true);
    expect(tuesdayNight?.subLabel).toBe("Siguiente clase · Mañana 08:00");
    expect(tuesdayNight?.widgetStatusLabel).toBe("Sin más clases hoy · Próxima: Mañana 08:00");

    // Sunday 21:00 -> tomorrow Monday 08:00 (wraps across week boundary)
    const sundayNight = resolveNextClass([course], new Date("2026-11-22T21:00:00-05:00"));
    expect(sundayNight?.status).toBe("NEXT_DAY");
    expect(sundayNight?.isTomorrow).toBe(true);
    expect(sundayNight?.widgetStatusLabel).toBe("Sin más clases hoy · Próxima: Mañana 08:00");

    // Thursday 19:00 -> multi-day gap to Monday 08:00
    const thursdayNight = resolveNextClass([course], new Date("2026-11-19T19:00:00-05:00"));
    expect(thursdayNight?.status).toBe("NEXT_DAY");
    expect(thursdayNight?.isTomorrow).toBe(false);
    expect(thursdayNight?.subLabel).toBe("Siguiente clase · Lun 08:00");
    expect(thursdayNight?.widgetStatusLabel).toBe("Sin más clases hoy · Próxima: Lun 08:00");
  });

  it("builds chronological weekly days while excluding pending courses", () => {
    const linked = makeCourse({
      id: "enr-1",
      name: "Desarrollo de Juegos",
      schedule_blocks: [
        makeBlock({ id: "late", day_of_week: 1, start_time: "14:00", end_time: "15:40", room: "Lab 2" }),
        makeBlock({ id: "early", day_of_week: 1, start_time: "08:40", end_time: "10:20", room: "Aula 204" }),
        makeBlock({ id: "fri", day_of_week: 5, start_time: "10:00", end_time: "11:40", room: "Aula 301" }),
      ],
    });
    const pending = makeCourse({
      id: "pen-1",
      mapping_status: "PENDING_LINK",
      schedule_blocks: [makeBlock({ id: "ign", day_of_week: 2, start_time: "08:00", end_time: "09:40" })],
    });

    const days = buildWeeklySchedule([linked, pending]);
    expect(days).toHaveLength(7);
    expect(days[0].dayOfWeek).toBe(1);
    expect(days[0].sessions.map((s) => s.block.id)).toEqual(["early", "late"]);
    expect(days[1].sessions).toHaveLength(0);
    expect(days[4].sessions.map((s) => s.block.id)).toEqual(["fri"]);
  });

  it("computes Lima quick due dates for today and tomorrow including month rollover", () => {
    const now = new Date("2026-11-30T14:20:00-05:00");
    expect(getLimaQuickDueDate("today", now)).toBe("2026-11-30T23:59:00-05:00");
    expect(getLimaQuickDueDate("tomorrow", now)).toBe("2026-12-01T23:59:00-05:00");
    expect(formatLimaDueDisplay("2026-11-20T23:59:00-05:00")).toBe("Vie 20 nov, 23:59");
    expect(formatLimaDueDisplay(null)).toBe("Sin fecha");
    expect(formatLimaDueDateTimeInput("2026-11-20T23:59:00-05:00")).toBe("2026-11-20T23:59");
    expect(parseLimaDateTimeInput("2026-11-20T23:59")).toBe("2026-11-20T23:59:00-05:00");
  });

  it("resolves next course session filtered by component type with fallback", () => {
    const course = makeCourse({
      id: "enr-1",
      name: "Computación Gráfica",
      schedule_blocks: [
        makeBlock({
          id: "teo-wed",
          day_of_week: 3,
          start_time: "08:00",
          end_time: "09:40",
          component_type: "TEORIA",
        }),
        makeBlock({
          id: "lab-fri",
          day_of_week: 5,
          start_time: "14:00",
          end_time: "15:40",
          component_type: "LABORATORIO",
        }),
      ],
    });
    const theoryOnlyCourse = makeCourse({
      id: "enr-2",
      name: "Ética",
      schedule_blocks: [
        makeBlock({
          id: "teo-tue",
          day_of_week: 2,
          start_time: "10:00",
          end_time: "11:40",
          component_type: "TEORIA",
        }),
      ],
    });

    // Monday 2026-11-16 09:00 Lima
    const monday = new Date("2026-11-16T09:00:00-05:00");
    expect(resolveNextCourseSessionIso(course, "TEORIA", monday)).toBe("2026-11-18T08:00:00-05:00");
    expect(resolveNextCourseSessionIso(course, "LABORATORIO", monday)).toBe(
      "2026-11-20T14:00:00-05:00"
    );
    // Fallback to any session when selected component has no blocks
    expect(resolveNextCourseSessionIso(theoryOnlyCourse, "LABORATORIO", monday)).toBe(
      "2026-11-17T10:00:00-05:00"
    );
    expect(resolveNextCourseSessionIso(null, "TEORIA", monday)).toBeNull();
  });

  it("builds Monday-first monthly calendar grid marking past and today cells in Lima", () => {
    const now = new Date("2026-11-15T20:00:00-05:00");
    const grid = buildCalendarMonthGrid(2026, 11, now);
    // November 1, 2026 is Sunday -> 6 leading blank cells
    expect(grid.slice(0, 6).every((cell) => cell.day === null)).toBe(true);
    const nov1 = grid[6];
    expect(nov1.day).toBe(1);
    expect(nov1.dayOfWeek).toBe(7);
    expect(nov1.isPast).toBe(true);
    expect(nov1.isToday).toBe(false);

    const nov15 = grid.find((cell) => cell.day === 15);
    expect(nov15?.isPast).toBe(false);
    expect(nov15?.isToday).toBe(true);

    const nov20 = grid.find((cell) => cell.day === 20);
    expect(nov20?.isPast).toBe(false);
    expect(nov20?.dateKey).toBe("2026-11-20");

    expect(formatRelativeDueSummary("2026-11-20T23:59:00-05:00", now)).toBe("En 5 días");
    expect(formatRelativeDueSummary("2026-11-15T23:59:00-05:00", now)).toBe("Hoy");
    expect(formatRelativeDueSummary("2026-11-16T23:59:00-05:00", now)).toBe("Mañana");
    expect(formatShortWeekdayDay("2026-11-17T08:00:00-05:00")).toBe("Mar 17");
  });

  it("formats Stitch course picker display names and group subtitles", () => {
    const singleGroup = makeCourse({
      name: "CALIDAD DE SOFTWARE",
      theory_group: "B",
      lab_group: null,
    });
    const dualGroup = makeCourse({
      name: "DESARROLLO DE SOFTWARE PARA JUEGOS",
      theory_group: "A",
      lab_group: "A",
    });

    expect(formatCourseDisplayName(singleGroup)).toBe("Calidad de Software B");
    expect(formatCourseGroupSubtitle(singleGroup)).toBe("Grupo B");
    expect(formatCourseDisplayName(dualGroup)).toBe("Desarrollo de Software para Juegos A");
    expect(formatCourseGroupSubtitle(dualGroup)).toBe("Teoría A · Lab A");
  });
});
