import { describe, expect, it } from "vitest";
import { getTaskDetailLinks } from "./task-detail-links";

const moodleTask = "https://aulavirtual.unsa.edu.pe/2026B/mod/assign/view.php?id=354694";
const classroomTask = "https://classroom.google.com/u/1/c/course/a/task/details";

describe("getTaskDetailLinks", () => {
  it("promotes an institutional Moodle module URL and retains numbered resources", () => {
    const task = getTaskDetailLinks(
      "moodle",
      null,
      `Review the guide [2].\n\nLinks:\n------\n[1]\n${moodleTask}\n[2]\nhttps://example.com/guide`
    );
    expect(task.text).toBe("Review the guide [2].");
    expect(task.assignmentUrl).toBe(moodleTask);
    expect(task.resources.map(({ url, reference }) => [url.href, reference]))
      .toEqual([["https://example.com/guide", "2"]]);
  });

  it("prefers the provider-supplied Classroom link and extracts inline resources", () => {
    const task = getTaskDetailLinks("classroom", classroomTask, "Read https://example.com/guide.");
    expect(task.assignmentUrl).toBe(classroomTask);
    expect(task.text).toBe("Read example.com.");
    expect(task.resources[0].url.href).toBe("https://example.com/guide");
  });

  it("keeps ambiguous Moodle links as resources without picking a task URL", () => {
    const task = getTaskDetailLinks("dutic", null, `${moodleTask} ${moodleTask.replace("354694", "4321")}`);
    expect(task.assignmentUrl).toBeNull();
    expect(task.resources).toHaveLength(2);
  });

  it("excludes calendar export tokens and refuses unsafe or off-platform primary links", () => {
    const feed = "https://aulavirtual.unsa.edu.pe/2026B/calendar/export_execute.php?token=private";
    const spoof = "https://aulavirtual.unsa.edu.pe.example.com/mod/assign/view.php?id=354694";
    const task = getTaskDetailLinks("moodle", "javascript:alert(1)", `${feed} ${spoof}`);
    expect(task.assignmentUrl).toBeNull();
    expect(task.resources.map(({ url }) => url.href)).toEqual([spoof]);
    expect(task.text).not.toContain("private");
  });
  it("preserves prose when a long numbered references section is malformed", () => {
    const lines = Array.from({ length: 2000 }, (_, index) => `[${index}] https://example.com/guide`);
    const task = getTaskDetailLinks(
      "moodle", null, ["Instructions", "Links:", "------", ...lines, "Keep this note."].join("\n")
    );
    expect(task.text).toContain("Keep this note.");
    expect(task.resources).toHaveLength(1);
    expect(task.assignmentUrl).toBeNull();
  });

});
