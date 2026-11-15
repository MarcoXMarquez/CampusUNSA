import type { AcademicCourse } from "../hooks/useAcademicBoard";
import type { CourseScheduleBlock } from "./api-client";
import { horarioMessages as messages } from "./messages/task-board-messages";

export const COURSE_COLORS = [
  "#3b82f6",
  "#d946ef",
  "#f59e0b",
  "#10b981",
  "#06b6d4",
  "#f43f5e",
  "#8b5cf6",
] as const;

const WEEKDAY_MAP: Record<string, number> = {
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
  Sun: 7,
};

export type NextClassStatus = "IN_PROGRESS" | "UPCOMING_TODAY" | "NEXT_DAY";

export interface NextClassSummary {
  status: NextClassStatus;
  subLabel: string;
  widgetStatusLabel: string;
  locationLabel: string | null;
  minutesRemaining: number;
  isTomorrow: boolean;
  course: AcademicCourse;
  block: CourseScheduleBlock;
}

export interface WeeklyScheduleSession {
  course: AcademicCourse;
  block: CourseScheduleBlock;
  color: string;
  startMin: number;
  endMin: number;
}

export interface WeeklyScheduleDay {
  dayOfWeek: number;
  sessions: WeeklyScheduleSession[];
}

export function getCourseColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) % 100_003;
  }
  return COURSE_COLORS[Math.abs(hash) % COURSE_COLORS.length];
}

export function getLimaClock(date: Date): { dayOfWeek: number; minutesOfDay: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Lima",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const weekdayText = parts.find((p) => p.type === "weekday")?.value ?? "Mon";
  const rawHour = Number.parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10);
  const minute = Number.parseInt(parts.find((p) => p.type === "minute")?.value ?? "0", 10);
  const hour = rawHour === 24 ? 0 : rawHour;

  return {
    dayOfWeek: WEEKDAY_MAP[weekdayText] ?? 1,
    minutesOfDay: hour * 60 + minute,
  };
}

export function parseMinutes(hhmm: string): number {
  const [hh, mm] = hhmm.split(":").map((part) => Number.parseInt(part, 10));
  if (Number.isNaN(hh) || Number.isNaN(mm)) {
    return 0;
  }
  return hh * 60 + mm;
}

export function formatDuration(minutes: number): string {
  const safe = Math.max(1, minutes);
  if (safe < 60) {
    return `${safe} min`;
  }
  const hours = Math.floor(safe / 60);
  const rem = safe % 60;
  return rem === 0 ? `${hours} h` : `${hours} h ${rem} min`;
}

export function formatBlockLocation(block: CourseScheduleBlock): string | null {
  const parts: string[] = [];
  if (block.room) {
    parts.push(block.room);
  }
  if (block.pavilion) {
    parts.push(block.pavilion);
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

export function formatBlockComponentLabel(block: CourseScheduleBlock): string {
  const base = block.component_type === "LABORATORIO" ? "Lab" : "Teoría";
  const location = formatBlockLocation(block);
  return `${base} ${block.group_code}${location ? ` · ${location}` : ""}`;
}

interface IndexedEntry {
  course: AcademicCourse;
  block: CourseScheduleBlock;
  startMin: number;
  endMin: number;
}

function collectLinkedEntries(courses: AcademicCourse[]): IndexedEntry[] {
  const entries: IndexedEntry[] = [];
  for (const course of courses) {
    if (course.mapping_status === "PENDING_LINK") {
      continue;
    }
    for (const block of course.schedule_blocks ?? []) {
      const startMin = parseMinutes(block.start_time);
      const endMin = parseMinutes(block.end_time);
      if (endMin <= startMin) {
        continue;
      }
      entries.push({
        course,
        block,
        startMin,
        endMin,
      });
    }
  }
  return entries;
}

export function resolveNextClass(courses: AcademicCourse[], now: Date): NextClassSummary | null {
  const entries = collectLinkedEntries(courses);
  if (entries.length === 0) {
    return null;
  }

  const { dayOfWeek, minutesOfDay } = getLimaClock(now);

  // Priority 1: Active class right now
  const active = entries
    .filter((e) => e.block.day_of_week === dayOfWeek && e.startMin <= minutesOfDay && minutesOfDay < e.endMin)
    .sort((a, b) => a.endMin - b.endMin || a.startMin - b.startMin || a.course.name.localeCompare(b.course.name));
  if (active.length > 0) {
    const first = active[0];
    const remaining = Math.max(1, first.endMin - minutesOfDay);
    const label = `${messages.inProgressLabel} · ${messages.endsInPrefix} ${formatDuration(remaining)}`;
    return {
      status: "IN_PROGRESS",
      subLabel: label,
      widgetStatusLabel: label,
      locationLabel: formatBlockLocation(first.block),
      minutesRemaining: remaining,
      isTomorrow: false,
      course: first.course,
      block: first.block,
    };
  }

  // Priority 2: Upcoming later today
  const laterToday = entries
    .filter((e) => e.block.day_of_week === dayOfWeek && e.startMin > minutesOfDay)
    .sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin || a.course.name.localeCompare(b.course.name));
  if (laterToday.length > 0) {
    const first = laterToday[0];
    const remaining = Math.max(1, first.startMin - minutesOfDay);
    const duration = formatDuration(remaining);
    return {
      status: "UPCOMING_TODAY",
      subLabel: `${messages.nextLabel} · ${messages.startsInPrefix} ${duration}`,
      widgetStatusLabel: `${messages.widgetUpcomingPrefix} ${duration}`,
      locationLabel: formatBlockLocation(first.block),
      minutesRemaining: remaining,
      isTomorrow: false,
      course: first.course,
      block: first.block,
    };
  }

  // Priority 3: Upcoming class on a subsequent day of the week
  const upcomingWeek = entries
    .map((e) => {
      const rawDelta = (e.block.day_of_week - dayOfWeek + 7) % 7;
      const dayDelta = rawDelta === 0 ? 7 : rawDelta;
      return {
        ...e,
        dayDelta,
        minutesAway: dayDelta * 1440 + (e.startMin - minutesOfDay),
      };
    })
    .sort((a, b) => a.minutesAway - b.minutesAway || a.endMin - b.endMin || a.course.name.localeCompare(b.course.name));

  const next = upcomingWeek[0];
  const isTomorrow = next.dayDelta === 1;
  const dayLabel = isTomorrow
    ? messages.tomorrowLabel
    : messages.dayAbbreviations[next.block.day_of_week] ?? "Lun";

  return {
    status: "NEXT_DAY",
    subLabel: `${messages.nextLabel} · ${dayLabel} ${next.block.start_time}`,
    widgetStatusLabel: `${messages.widgetNoMoreTodayPrefix} ${dayLabel} ${next.block.start_time}`,
    locationLabel: formatBlockLocation(next.block),
    minutesRemaining: Math.max(1, next.minutesAway),
    isTomorrow,
    course: next.course,
    block: next.block,
  };
}

export function buildWeeklySchedule(courses: AcademicCourse[]): WeeklyScheduleDay[] {
  const entries = collectLinkedEntries(courses);
  const byDay = new Map<number, WeeklyScheduleSession[]>();
  for (let day = 1; day <= 7; day += 1) {
    byDay.set(day, []);
  }

  for (const entry of entries) {
    const list = byDay.get(entry.block.day_of_week);
    if (!list) {
      continue;
    }
    list.push({
      course: entry.course,
      block: entry.block,
      color: getCourseColor(entry.course.course_code ?? entry.course.id),
      startMin: entry.startMin,
      endMin: entry.endMin,
    });
  }

  const days: WeeklyScheduleDay[] = [];
  for (let day = 1; day <= 7; day += 1) {
    const sessions = (byDay.get(day) ?? []).sort(
      (a, b) => a.startMin - b.startMin || a.endMin - b.endMin || a.course.name.localeCompare(b.course.name)
    );
    days.push({ dayOfWeek: day, sessions });
  }
  return days;
}
