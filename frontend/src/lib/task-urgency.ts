import { formatDistanceStrict, isValid, parseISO } from "date-fns";
import { es } from "date-fns/locale";

export type TaskGroup = "overdue" | "today" | "week" | "upcoming" | "undated";

interface TaskDeadline {
  due_date?: string | null;
  is_completed?: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const LIMA_TIMEZONE = "America/Lima";

function getLimaCalendarDayIndex(date: Date): number {
  const isoDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: LIMA_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
  const [year, month, day] = isoDate.split("-").map((part) => Number.parseInt(part, 10));
  return Math.floor(Date.UTC(year, month - 1, day) / DAY_MS);
}

function getLimaFormattedParts(date: Date): {
  weekday: string;
  day: string;
  month: string;
  hhmm: string;
} {
  const parts = new Intl.DateTimeFormat("es-PE", {
    timeZone: LIMA_TIMEZONE,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const clean = (raw: string) => raw.replace(/\.$/, "").trim();
  const weekday = clean(parts.find((p) => p.type === "weekday")?.value ?? "");
  const day = parts.find((p) => p.type === "day")?.value ?? "";
  const month = clean(parts.find((p) => p.type === "month")?.value ?? "");
  const rawHour = parts.find((p) => p.type === "hour")?.value ?? "00";
  const hour = rawHour === "24" ? "00" : rawHour.padStart(2, "0");
  const minute = (parts.find((p) => p.type === "minute")?.value ?? "00").padStart(2, "0");

  return { weekday, day, month, hhmm: `${hour}:${minute}` };
}

function capitalizeFirst(value: string): string {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function getTaskScheduleGroup(deadline?: string | null, now = new Date()): TaskGroup {
  if (!deadline) return "undated";
  const due = parseISO(deadline);
  if (!isValid(due)) return "undated";

  if (due.getTime() < now.getTime()) {
    return "overdue";
  }

  const dayDiff = getLimaCalendarDayIndex(due) - getLimaCalendarDayIndex(now);
  if (dayDiff <= 0) return "today";
  if (dayDiff <= 7) return "week";
  return "upcoming";
}

export function groupTasksBySchedule<T extends TaskDeadline>(
  tasks: readonly T[],
  now = new Date()
): Record<TaskGroup, T[]> {
  const groups: Record<TaskGroup, T[]> = {
    overdue: [],
    today: [],
    week: [],
    upcoming: [],
    undated: [],
  };

  const pending = tasks.filter((task) => !task.is_completed);
  const sorted = [...pending].sort((left, right) => {
    const leftTime = left.due_date ? parseISO(left.due_date).getTime() : NaN;
    const rightTime = right.due_date ? parseISO(right.due_date).getTime() : NaN;
    return (
      (Number.isFinite(leftTime) ? leftTime : Infinity) -
      (Number.isFinite(rightTime) ? rightTime : Infinity)
    );
  });

  for (const task of sorted) {
    groups[getTaskScheduleGroup(task.due_date, now)].push(task);
  }
  return groups;
}

export function formatTaskMetadataLine(
  dueDate: string | null | undefined,
  group: TaskGroup,
  componentLabel: string,
  now = new Date()
): string {
  if (!dueDate) {
    return `${componentLabel} · Sin fecha`;
  }
  const due = parseISO(dueDate);
  if (!isValid(due)) {
    return `${componentLabel} · Sin fecha`;
  }

  const { weekday, day, month, hhmm } = getLimaFormattedParts(due);

  if (group === "overdue") {
    const elapsed = formatDistanceStrict(due, now, { locale: es });
    return `Venció ${weekday.toLowerCase()} ${day} ${month.toLowerCase()}, ${hhmm} · hace ${elapsed}`;
  }

  if (group === "today") {
    return `${componentLabel} · Hoy, ${hhmm}`;
  }

  return `${componentLabel} · ${capitalizeFirst(weekday)} ${day} ${month.toLowerCase()}, ${hhmm}`;
}
