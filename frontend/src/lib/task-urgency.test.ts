import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getTaskUrgency, groupTasksByUrgency } from "./task-urgency";

describe("task urgency windows", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-03T12:00:00Z"));
  });
  afterEach(() => { vi.useRealTimers(); });

  it.each([
    ["2026-11-03T12:00:00.000Z", "urgent"],
    ["2026-11-04T11:59:59.999Z", "urgent"],
    ["2026-11-04T12:00:00.000Z", "soon"],
    ["2026-11-06T12:00:00.000Z", "soon"],
    ["2026-11-06T12:00:00.001Z", "later"],
    ["2026-11-03T11:59:59.999Z", "overdue"],
    ["2026-11-04T07:00:00-05:00", "soon"],
    ["invalid", "undated"],
    [null, "undated"],
    [undefined, "undated"],
  ])("classifies %s as %s", (deadline, expected) => {
    expect(getTaskUrgency(deadline)).toBe(expected);
  });

  it("accepts an explicit reference clock and respects elapsed time", () => {
    expect(getTaskUrgency("2026-11-04T12:00:00Z", new Date("2026-11-04T11:00:00Z"))).toBe("urgent");
    vi.advanceTimersByTime(1);
    expect(getTaskUrgency("2026-11-04T12:00:00Z")).toBe("urgent");
  });

  it("sorts deadlines without mutating input and separates completed tasks", () => {
    const tasks = [
      { id: "late", due_date: "2026-11-04T10:00:00Z" },
      { id: "done", due_date: "2026-11-03T13:00:00Z", is_completed: true },
      { id: "early", due_date: "2026-11-03T15:00:00Z" },
      { id: "unknown", due_date: null },
    ];
    const groups = groupTasksByUrgency(tasks);
    expect(groups.urgent.map((task) => task.id)).toEqual(["early", "late"]);
    expect(groups.completed.map((task) => task.id)).toEqual(["done"]);
    expect(groups.undated.map((task) => task.id)).toEqual(["unknown"]);
    expect(tasks.map((task) => task.id)).toEqual(["late", "done", "early", "unknown"]);
  });
});
