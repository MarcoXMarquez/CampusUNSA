import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  formatTaskMetadataLine,
  getTaskScheduleGroup,
  groupTasksBySchedule,
} from "./task-urgency";

describe("task calendar grouping (America/Lima)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Sunday 2026-11-15 19:00 America/Lima -> 2026-11-16T00:00:00Z
    vi.setSystemTime(new Date("2026-11-16T00:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([
    ["2026-11-15T23:59:59.000Z", "overdue"],
    ["2026-11-16T04:59:00.000Z", "today"], // Sun 23:59 Lima
    ["2026-11-16T05:00:00.000Z", "week"], // Mon 00:00 Lima (+1 day)
    ["2026-11-19T04:59:00.000Z", "week"], // Wed 23:59 Lima (+3 days)
    ["2026-11-23T04:59:00.000Z", "week"], // Sun 23:59 Lima (+7 days)
    ["2026-11-23T05:00:00.000Z", "upcoming"], // Mon 00:00 Lima (+8 days)
    ["invalid", "undated"],
    [null, "undated"],
    [undefined, "undated"],
  ])("classifies %s as %s", (deadline, expected) => {
    expect(getTaskScheduleGroup(deadline)).toBe(expected);
  });

  it("excludes completed tasks from active buckets and sorts ascending by due_date", () => {
    const tasks = [
      { id: "week-late", due_date: "2026-11-19T04:59:00Z" },
      { id: "done", due_date: "2026-11-16T02:00:00Z", is_completed: true },
      { id: "today-task", due_date: "2026-11-16T04:59:00Z" },
      { id: "week-early", due_date: "2026-11-17T04:59:00Z" },
      { id: "overdue-task", due_date: "2026-11-10T15:00:00Z" },
      { id: "upcoming-task", due_date: "2026-11-28T15:00:00Z" },
      { id: "no-date", due_date: null },
    ];
    const groups = groupTasksBySchedule(tasks);
    expect(groups.overdue.map((t) => t.id)).toEqual(["overdue-task"]);
    expect(groups.today.map((t) => t.id)).toEqual(["today-task"]);
    expect(groups.week.map((t) => t.id)).toEqual(["week-early", "week-late"]);
    expect(groups.upcoming.map((t) => t.id)).toEqual(["upcoming-task"]);
    expect(groups.undated.map((t) => t.id)).toEqual(["no-date"]);
    // Completed task omitted from active buckets
    const allGroupedIds = Object.values(groups).flat().map((t) => t.id);
    expect(allGroupedIds).not.toContain("done");
  });

  it("formats metadata lines consistently in America/Lima timezone", () => {
    expect(
      formatTaskMetadataLine("2026-11-16T04:59:00Z", "today", "Laboratorio")
    ).toBe("Laboratorio · Hoy, 23:59");

    const weekLabel = formatTaskMetadataLine(
      "2026-11-19T04:59:00Z",
      "week",
      "Teoría"
    );
    expect(weekLabel).toMatch(/^Teoría · Mié 18 nov, 23:59$/i);

    const overdueLabel = formatTaskMetadataLine(
      "2026-11-13T04:59:00Z",
      "overdue",
      "Laboratorio"
    );
    expect(overdueLabel).toMatch(/^Venció .* · hace /);
  });
});
