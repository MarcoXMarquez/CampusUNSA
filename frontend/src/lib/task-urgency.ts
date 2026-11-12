import { isValid, parseISO } from "date-fns";

export type TaskUrgency = "overdue" | "urgent" | "soon" | "later" | "undated";
export type TaskGroup = TaskUrgency | "completed";

interface TaskDeadline {
  due_date?: string | null;
  is_completed?: boolean;
}

const HOUR_MS = 60 * 60 * 1000;

export function getTaskUrgency(deadline?: string | null, now = new Date()): TaskUrgency {
  if (!deadline) return "undated";
  const due = parseISO(deadline);
  if (!isValid(due)) return "undated";
  const remaining = due.getTime() - now.getTime();
  if (remaining < 0) return "overdue";
  if (remaining < 24 * HOUR_MS) return "urgent";
  if (remaining <= 72 * HOUR_MS) return "soon";
  return "later";
}

export function groupTasksByUrgency<T extends TaskDeadline>(
  tasks: readonly T[], now = new Date(),
): Record<TaskGroup, T[]> {
  const groups: Record<TaskGroup, T[]> = {
    overdue: [], urgent: [], soon: [], later: [], undated: [], completed: [],
  };
  const sorted = [...tasks].sort((left, right) => {
    const leftTime = left.due_date ? parseISO(left.due_date).getTime() : NaN;
    const rightTime = right.due_date ? parseISO(right.due_date).getTime() : NaN;
    return (Number.isFinite(leftTime) ? leftTime : Infinity) -
      (Number.isFinite(rightTime) ? rightTime : Infinity);
  });
  for (const task of sorted) {
    groups[task.is_completed ? "completed" : getTaskUrgency(task.due_date, now)].push(task);
  }
  return groups;
}
