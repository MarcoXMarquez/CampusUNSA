import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AcademicCourse } from "@/hooks/useAcademicBoard";
import {
  coursePickerMessages,
  dueDatePickerMessages,
  newTaskMessages,
} from "@/lib/messages/task-board-messages";
import {
  formatLimaDueDisplay,
  getLimaQuickDueDate,
} from "@/lib/schedule-calculator";
import { NewTaskSheet } from "./NewTaskSheet";

function makeCourse(overrides: Partial<AcademicCourse> = {}): AcademicCourse {
  return {
    id: overrides.id ?? "enr-1",
    classroom_course_id: overrides.classroom_course_id ?? "cls-1",
    course_code: overrides.course_code ?? "1705275",
    name: overrides.name ?? "DESARROLLO DE SOFTWARE PARA JUEGOS",
    mapping_status: overrides.mapping_status ?? "LINKED",
    created_at: overrides.created_at ?? "2026-11-01T00:00:00Z",
    schedule_blocks: overrides.schedule_blocks ?? [
      {
        id: "blk-teo",
        course_code: "1705275",
        term: "2026B",
        group_code: "A",
        day_of_week: 3,
        start_time: "08:00",
        end_time: "09:40",
        room: "Aula 204",
        pavilion: "Pabellon Sistemas",
        component_type: "TEORIA",
      },
      {
        id: "blk-lab",
        course_code: "1705275",
        term: "2026B",
        group_code: "A",
        day_of_week: 5,
        start_time: "14:00",
        end_time: "15:40",
        room: "Lab 2",
        pavilion: "Pabellon Nuevo",
        component_type: "LABORATORIO",
      },
    ],
    ...overrides,
  };
}

describe("NewTaskSheet modal", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("renders Stitch layout defaults and formats course names with Smart Title Case", () => {
    const courses = [makeCourse()];
    const expectedToday = formatLimaDueDisplay(getLimaQuickDueDate("today"));

    render(
      <NewTaskSheet
        opened
        courses={courses}
        allSourcesSynced
        isOnline
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />
    );

    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText(newTaskMessages.sheetTitle)).toBeTruthy();
    expect(screen.getByRole("button", { name: newTaskMessages.cancelAction })).toBeTruthy();
    expect(screen.getByRole("button", { name: newTaskMessages.submitAction })).toBeTruthy();
    expect(screen.getByPlaceholderText(newTaskMessages.titlePlaceholder)).toBeTruthy();
    expect(screen.getByPlaceholderText(newTaskMessages.notesPlaceholder)).toBeTruthy();
    expect(screen.getByTestId("due-date-display").textContent).toBe(expectedToday);
    expect(screen.getByTestId("selected-course-display").textContent).toBe(
      newTaskMessages.noCourseLabel
    );

    // Open CoursePickerSheet and select formatted course
    fireEvent.click(screen.getByRole("button", { name: newTaskMessages.courseSelectAria }));
    expect(screen.getByRole("dialog", { name: coursePickerMessages.sheetTitle })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Desarrollo de Software para Juegos/i }));
    expect(screen.getByTestId("selected-course-display").textContent).toBe(
      "Desarrollo de Software para Juegos"
    );
  });

  it("pre-selects initialCourse, calculates component-aware Proxima clase, and submits payload", async () => {
    vi.useFakeTimers();
    const fixedNow = new Date("2026-11-16T09:00:00-05:00");
    vi.setSystemTime(fixedNow);

    const course = makeCourse();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();

    render(
      <NewTaskSheet
        opened
        courses={[course]}
        initialCourse={course}
        allSourcesSynced
        isOnline
        onClose={onClose}
        onSubmit={onSubmit}
      />
    );

    expect(screen.getByTestId("selected-course-display").textContent).toBe(
      "Desarrollo de Software para Juegos"
    );

    fireEvent.change(screen.getByPlaceholderText(newTaskMessages.titlePlaceholder), {
      target: { value: "  Entrega de prototipo 02  " },
    });

    fireEvent.click(screen.getByRole("button", { name: newTaskMessages.typeLab }));
    fireEvent.click(screen.getByRole("button", { name: newTaskMessages.quickNextClass }));
    expect(screen.getByTestId("due-date-display").textContent).toBe("Vie 20 nov, 14:00");

    fireEvent.click(screen.getByRole("switch", { name: newTaskMessages.highPriorityLabel }));
    fireEvent.change(screen.getByPlaceholderText(newTaskMessages.notesPlaceholder), {
      target: { value: "Incluir APK" },
    });

    vi.useRealTimers();
    fireEvent.click(screen.getByRole("button", { name: newTaskMessages.submitAction }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        title: "Entrega de prototipo 02",
        course_code: "1705275",
        component_type: "LABORATORIO",
        due_date: "2026-11-20T14:00:00-05:00",
        priority: "ALTA",
        notes: "Incluir APK",
      });
    });
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it("supports Sin curso personal task creation, quick Manana pill, and clearing due date via DueDatePickerSheet", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-16T10:00:00-05:00"));

    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();

    render(
      <NewTaskSheet
        opened
        courses={[makeCourse()]}
        allSourcesSynced
        isOnline
        onClose={onClose}
        onSubmit={onSubmit}
      />
    );

    expect(screen.getByTestId("selected-course-display").textContent).toBe(
      newTaskMessages.noCourseLabel
    );

    const nextClassBtn = screen.getByRole("button", {
      name: newTaskMessages.quickNextClass,
    }) as HTMLButtonElement;
    expect(nextClassBtn.disabled).toBe(true);

    fireEvent.change(screen.getByPlaceholderText(newTaskMessages.titlePlaceholder), {
      target: { value: "Tramitar constancia" },
    });
    fireEvent.click(screen.getByRole("button", { name: newTaskMessages.quickTomorrow }));
    expect(screen.getByTestId("due-date-display").textContent).toBe("Mar 17 nov, 23:59");

    // Open DueDatePickerSheet, test Escape closes only submodal, then clear via Quitar fecha
    fireEvent.click(screen.getByRole("button", { name: newTaskMessages.dueDateInputAria }));
    expect(screen.getByRole("dialog", { name: dueDatePickerMessages.sheetTitle })).toBeTruthy();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: dueDatePickerMessages.sheetTitle })).toBeNull();
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: newTaskMessages.dueDateInputAria }));
    fireEvent.click(screen.getByRole("button", { name: dueDatePickerMessages.clearDateAction }));
    expect(screen.getByTestId("due-date-display").textContent).toBe(
      newTaskMessages.noDueDateLabel
    );

    vi.useRealTimers();
    fireEvent.click(screen.getByRole("button", { name: newTaskMessages.submitAction }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        title: "Tramitar constancia",
        course_code: null,
        component_type: "TEORIA",
        due_date: null,
        priority: null,
        notes: null,
      });
    });
  });

  it("shows sync guidance and blocks submission when courses are missing or user is offline", () => {
    const { rerender } = render(
      <NewTaskSheet
        opened
        courses={[]}
        allSourcesSynced={false}
        isOnline
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />
    );

    expect(screen.getByText(newTaskMessages.noCoursesNotice)).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText(newTaskMessages.titlePlaceholder), {
      target: { value: "Tarea bloqueada" },
    });
    const submitBtn = screen.getByRole("button", {
      name: newTaskMessages.submitAction,
    }) as HTMLButtonElement;
    expect(submitBtn.disabled).toBe(true);

    rerender(
      <NewTaskSheet
        opened
        courses={[makeCourse()]}
        allSourcesSynced={false}
        isOnline={false}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />
    );

    expect(screen.getByText(newTaskMessages.syncRequiredNotice)).toBeTruthy();
    expect(screen.getByText(newTaskMessages.offlineNotice)).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: newTaskMessages.submitAction }) as HTMLButtonElement)
        .disabled
    ).toBe(true);
  });

  it("displays an inline error without closing when submission fails", async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error("Error del servidor"));
    const onClose = vi.fn();

    render(
      <NewTaskSheet
        opened
        courses={[makeCourse()]}
        allSourcesSynced
        isOnline
        onClose={onClose}
        onSubmit={onSubmit}
      />
    );

    fireEvent.change(screen.getByPlaceholderText(newTaskMessages.titlePlaceholder), {
      target: { value: "Revisar rubrica" },
    });
    fireEvent.click(screen.getByRole("button", { name: newTaskMessages.submitAction }));

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toBe("Error del servidor");
    });
    expect(onClose).not.toHaveBeenCalled();
  });
});
