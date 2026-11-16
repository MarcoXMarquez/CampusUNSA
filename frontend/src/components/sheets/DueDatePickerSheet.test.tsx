import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AcademicCourse } from "@/hooks/useAcademicBoard";
import { dueDatePickerMessages } from "@/lib/messages/task-board-messages";
import { DueDatePickerSheet } from "./DueDatePickerSheet";

function makeCourseWithSchedule(): AcademicCourse {
  return {
    id: "enr-1",
    classroom_course_id: "1705275",
    course_code: "1705275",
    name: "Desarrollo de Software para Juegos",
    mapping_status: "LINKED",
    created_at: "2026-11-01T00:00:00Z",
    schedule_blocks: [
      {
        id: "blk-tue",
        course_code: "1705275",
        term: "2026B",
        component_type: "TEORIA",
        group_code: "A",
        day_of_week: 2,
        start_time: "08:00",
        end_time: "09:40",
        room: "Aula 204",
      },
      {
        id: "blk-thu",
        course_code: "1705275",
        term: "2026B",
        component_type: "TEORIA",
        group_code: "A",
        day_of_week: 4,
        start_time: "10:00",
        end_time: "11:40",
        room: "Aula 204",
      },
    ],
  };
}

describe("DueDatePickerSheet modal", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-15T12:00:00-05:00"));
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it("renders Stitch summary, quick pills with next class date, calendar dots, and disables past days", () => {
    render(
      <DueDatePickerSheet
        opened
        value="2026-11-20T23:59:00-05:00"
        selectedCourse={makeCourseWithSchedule()}
        courses={[makeCourseWithSchedule()]}
        componentType="TEORIA"
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByRole("dialog", { name: dueDatePickerMessages.sheetTitle })).toBeTruthy();
    expect(screen.getByText("Vie 20 nov, 23:59")).toBeTruthy();
    expect(screen.getByText("En 5 días")).toBeTruthy();
    expect(screen.getByText("Noviembre 2026")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Próxima clase.*Mar 17/i })).toBeTruthy();

    // Previous month arrow is disabled when already on current month
    const prevBtn = screen.getByRole("button", {
      name: dueDatePickerMessages.prevMonthAria,
    }) as HTMLButtonElement;
    expect(prevBtn.disabled).toBe(true);

    // Past days cannot be clicked/selected
    const pastDay10 = screen.getByRole("button", { name: "2026-11-10" }) as HTMLButtonElement;
    expect(pastDay10.disabled).toBe(true);
    fireEvent.click(pastDay10);
    expect(screen.getByText("Vie 20 nov, 23:59")).toBeTruthy();

    // Class-day dot indicators appear on Tuesday/Thursday blocks in the month (17, 19, 24, 26)
    expect(screen.getByTestId("calendar-class-dot-2026-11-17")).toBeTruthy();
    expect(screen.getByTestId("calendar-class-dot-2026-11-19")).toBeTruthy();
    expect(screen.getByTestId("calendar-class-dot-2026-11-24")).toBeTruthy();
    expect(screen.getByTestId("calendar-class-dot-2026-11-26")).toBeTruthy();
  });

  it("updates draft day, month, and time, then confirms with Listo", () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();

    render(
      <DueDatePickerSheet
        opened
        value="2026-11-20T23:59:00-05:00"
        selectedCourse={makeCourseWithSchedule()}
        courses={[makeCourseWithSchedule()]}
        componentType="TEORIA"
        onConfirm={onConfirm}
        onClose={onClose}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "2026-11-25" }));
    expect(screen.getByText("Mié 25 nov, 23:59")).toBeTruthy();
    expect(screen.getByText("En 10 días")).toBeTruthy();

    const timeInput = screen.getByLabelText(dueDatePickerMessages.timeInputAria);
    fireEvent.change(timeInput, { target: { value: "18:30" } });
    expect(screen.getByText("Mié 25 nov, 18:30")).toBeTruthy();

    // Browse next month (Diciembre 2026) and back
    fireEvent.click(screen.getByRole("button", { name: dueDatePickerMessages.nextMonthAria }));
    expect(screen.getByText("Diciembre 2026")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "2026-12-01" }));
    expect(screen.getByText("Mar 1 dic, 18:30")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: dueDatePickerMessages.doneAction }));
    expect(onConfirm).toHaveBeenCalledWith("2026-12-01T18:30:00-05:00");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("discards draft changes on Cancelar and clears date on Quitar fecha", () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();

    const { rerender } = render(
      <DueDatePickerSheet
        opened
        value="2026-11-20T23:59:00-05:00"
        selectedCourse={makeCourseWithSchedule()}
        courses={[makeCourseWithSchedule()]}
        componentType="TEORIA"
        onConfirm={onConfirm}
        onClose={onClose}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: dueDatePickerMessages.quickTomorrow }));
    expect(screen.getByText("Lun 16 nov, 23:59")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: dueDatePickerMessages.cancelAction }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);

    onClose.mockClear();
    rerender(
      <DueDatePickerSheet
        opened
        value="2026-11-20T23:59:00-05:00"
        selectedCourse={makeCourseWithSchedule()}
        courses={[makeCourseWithSchedule()]}
        componentType="TEORIA"
        onConfirm={onConfirm}
        onClose={onClose}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: dueDatePickerMessages.clearDateAction }));
    expect(onConfirm).toHaveBeenCalledWith(null);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
