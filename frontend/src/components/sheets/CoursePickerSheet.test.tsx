import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AcademicCourse } from "@/hooks/useAcademicBoard";
import { coursePickerMessages } from "@/lib/messages/task-board-messages";
import { CoursePickerSheet } from "./CoursePickerSheet";

function makeCourse(overrides: Partial<AcademicCourse> = {}): AcademicCourse {
  return {
    id: overrides.id ?? "enr-1",
    classroom_course_id: overrides.classroom_course_id ?? "1705275",
    course_code: overrides.course_code ?? "1705275",
    name: overrides.name ?? "DESARROLLO DE SOFTWARE PARA JUEGOS",
    theory_group: overrides.theory_group !== undefined ? overrides.theory_group : "A",
    lab_group: overrides.lab_group !== undefined ? overrides.lab_group : "A",
    section: overrides.section ?? null,
    mapping_status: overrides.mapping_status ?? "LINKED",
    schedule_blocks: overrides.schedule_blocks ?? [],
    created_at: overrides.created_at ?? "2026-11-01T00:00:00Z",
    ...overrides,
  };
}

describe("CoursePickerSheet modal", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders Stitch course list with group subtitles, checkmark, and dynamic search count", () => {
    const courses = [
      makeCourse({
        id: "enr-1",
        course_code: "1705275",
        name: "DESARROLLO DE SOFTWARE PARA JUEGOS",
        theory_group: "A",
        lab_group: "A",
      }),
      makeCourse({
        id: "enr-2",
        course_code: "1705280",
        name: "CALIDAD DE SOFTWARE",
        theory_group: "B",
        lab_group: null,
      }),
    ];

    render(
      <CoursePickerSheet
        opened
        courses={courses}
        selectedCourseCode="1705275"
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByRole("dialog", { name: coursePickerMessages.sheetTitle })).toBeTruthy();
    expect(
      screen.getByPlaceholderText(coursePickerMessages.searchPlaceholderMany(2))
    ).toBeTruthy();
    expect(screen.getByText(coursePickerMessages.sectionTitle)).toBeTruthy();
    expect(screen.getByText("Desarrollo de Software para Juegos A")).toBeTruthy();
    expect(screen.getByText("Teoría A · Lab A")).toBeTruthy();
    expect(screen.getByText("Calidad de Software B")).toBeTruthy();
    expect(screen.getByText("Grupo B")).toBeTruthy();
    expect(screen.getByLabelText(coursePickerMessages.selectedAria)).toBeTruthy();
    expect(screen.getByText(coursePickerMessages.noCourseTitle)).toBeTruthy();
  });

  it("filters courses by search text and returns empty state when no match", () => {
    const courses = [
      makeCourse({
        id: "enr-1",
        course_code: "1705275",
        name: "DESARROLLO DE SOFTWARE PARA JUEGOS",
      }),
      makeCourse({
        id: "enr-2",
        course_code: "1705280",
        name: "CALIDAD DE SOFTWARE",
        theory_group: "B",
        lab_group: null,
      }),
    ];

    render(
      <CoursePickerSheet
        opened
        courses={courses}
        selectedCourseCode=""
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />
    );

    const search = screen.getByLabelText(coursePickerMessages.searchAria);
    fireEvent.change(search, { target: { value: "calidad" } });

    expect(screen.getByText("Calidad de Software B")).toBeTruthy();
    expect(screen.queryByText("Desarrollo de Software para Juegos A")).toBeNull();

    fireEvent.change(search, { target: { value: "inexistente" } });
    expect(screen.getByText(coursePickerMessages.emptySearch)).toBeTruthy();
  });

  it("selects a course or Sin curso immediately and cancels cleanly", () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    const courses = [
      makeCourse({
        id: "enr-1",
        course_code: "1705275",
        name: "SISTEMAS DISTRIBUIDOS",
        theory_group: "B",
        lab_group: "B",
      }),
    ];

    const { rerender } = render(
      <CoursePickerSheet
        opened
        courses={courses}
        selectedCourseCode=""
        onSelect={onSelect}
        onClose={onClose}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Sistemas Distribuidos B/i }));
    expect(onSelect).toHaveBeenCalledWith("1705275");
    expect(onClose).toHaveBeenCalledTimes(1);

    onSelect.mockClear();
    onClose.mockClear();

    rerender(
      <CoursePickerSheet
        opened
        courses={courses}
        selectedCourseCode="1705275"
        onSelect={onSelect}
        onClose={onClose}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Sin curso/i }));
    expect(onSelect).toHaveBeenCalledWith("");
    expect(onClose).toHaveBeenCalledTimes(1);

    onSelect.mockClear();
    onClose.mockClear();
    fireEvent.click(screen.getByRole("button", { name: coursePickerMessages.cancelAction }));
    expect(onSelect).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
