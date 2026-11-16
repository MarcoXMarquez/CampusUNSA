import type { AcademicCourse } from "../hooks/useAcademicBoard";
import type { CourseScheduleBlock } from "./api-client";
import { horarioMessages as messages } from "./messages/task-board-messages";
import { formatAcademicTitle } from "./text-format";

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

const LIMA_SHORT_DAYS: Record<number, string> = {
  1: "Lun",
  2: "Mar",
  3: "Mié",
  4: "Jue",
  5: "Vie",
  6: "Sáb",
  7: "Dom",
};

const LIMA_SHORT_MONTHS = [
  "ene",
  "feb",
  "mar",
  "abr",
  "may",
  "jun",
  "jul",
  "ago",
  "sep",
  "oct",
  "nov",
  "dic",
] as const;

export interface LimaDateParts {
  year: number;
  month: number;
  day: number;
  dayOfWeek: number;
  hour: number;
  minute: number;
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

export function getLimaDateParts(date: Date): LimaDateParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const lookup = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? "";

  const rawHour = Number.parseInt(lookup("hour") || "0", 10);
  return {
    year: Number.parseInt(lookup("year") || "2026", 10),
    month: Number.parseInt(lookup("month") || "1", 10),
    day: Number.parseInt(lookup("day") || "1", 10),
    dayOfWeek: WEEKDAY_MAP[lookup("weekday") || "Mon"] ?? 1,
    hour: rawHour === 24 ? 0 : rawHour,
    minute: Number.parseInt(lookup("minute") || "0", 10),
  };
}

function addDaysToLimaCalendar(
  year: number,
  month: number,
  day: number,
  deltaDays: number
): { year: number; month: number; day: number } {
  const utc = new Date(Date.UTC(year, month - 1, day + deltaDays));
  return {
    year: utc.getUTCFullYear(),
    month: utc.getUTCMonth() + 1,
    day: utc.getUTCDate(),
  };
}

export function buildLimaDueDateIso(
  year: number,
  month: number,
  day: number,
  hour = 23,
  minute = 59
): string {
  return `${year}-${pad2(month)}-${pad2(day)}T${pad2(hour)}:${pad2(minute)}:00-05:00`;
}

export function getLimaQuickDueDate(preset: "today" | "tomorrow", now = new Date()): string {
  const current = getLimaDateParts(now);
  const target = addDaysToLimaCalendar(
    current.year,
    current.month,
    current.day,
    preset === "tomorrow" ? 1 : 0
  );
  return buildLimaDueDateIso(target.year, target.month, target.day, 23, 59);
}

export function resolveNextCourseSessionIso(
  course: AcademicCourse | null | undefined,
  componentType: "TEORIA" | "LABORATORIO",
  now = new Date()
): string | null {
  if (!course) {
    return null;
  }
  const allBlocks = course.schedule_blocks ?? [];
  if (allBlocks.length === 0) {
    return null;
  }

  const typedBlocks = allBlocks.filter(
    (block) => (block.component_type || "TEORIA").toUpperCase() === componentType
  );
  const candidates = typedBlocks.length > 0 ? typedBlocks : allBlocks;
  const lima = getLimaDateParts(now);
  const minutesOfDay = lima.hour * 60 + lima.minute;

  const ranked = candidates
    .map((block) => {
      const startMin = parseMinutes(block.start_time);
      const rawDelta = (block.day_of_week - lima.dayOfWeek + 7) % 7;
      const dayDelta = rawDelta === 0 && startMin <= minutesOfDay ? 7 : rawDelta;
      return {
        block,
        startMin,
        dayDelta,
        minutesAway: dayDelta * 1440 + (startMin - minutesOfDay),
      };
    })
    .sort((a, b) => a.minutesAway - b.minutesAway || a.startMin - b.startMin);

  const next = ranked[0];
  if (!next) {
    return null;
  }

  const targetDate = addDaysToLimaCalendar(lima.year, lima.month, lima.day, next.dayDelta);
  const hour = Math.floor(next.startMin / 60);
  const minute = next.startMin % 60;
  return buildLimaDueDateIso(targetDate.year, targetDate.month, targetDate.day, hour, minute);
}

export function formatLimaDueDateTimeInput(iso: string | null): string {
  if (!iso) {
    return "";
  }
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }
  const parts = getLimaDateParts(parsed);
  return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}T${pad2(parts.hour)}:${pad2(parts.minute)}`;
}

export function parseLimaDateTimeInput(value: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value.trim());
  if (!match) {
    return null;
  }
  const year = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);
  const day = Number.parseInt(match[3], 10);
  const hour = Number.parseInt(match[4], 10);
  const minute = Number.parseInt(match[5], 10);
  return buildLimaDueDateIso(year, month, day, hour, minute);
}

export function formatLimaDueDisplay(iso: string | null, emptyLabel = "Sin fecha"): string {
  if (!iso) {
    return emptyLabel;
  }
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    return emptyLabel;
  }
  const parts = getLimaDateParts(parsed);
  const dayName = LIMA_SHORT_DAYS[parts.dayOfWeek] ?? "Lun";
  const monthName = LIMA_SHORT_MONTHS[parts.month - 1] ?? "ene";
  return `${dayName} ${parts.day} ${monthName}, ${pad2(parts.hour)}:${pad2(parts.minute)}`;
}

export function formatShortWeekdayDay(iso: string | null): string | null {
  if (!iso) {
    return null;
  }
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  const parts = getLimaDateParts(parsed);
  const dayName = LIMA_SHORT_DAYS[parts.dayOfWeek] ?? "Lun";
  return `${dayName} ${parts.day}`;
}

export function formatRelativeDueSummary(
  targetIso: string | null,
  now = new Date(),
  emptySummary = "Sin fecha de entrega"
): string {
  if (!targetIso) {
    return emptySummary;
  }
  const parsed = new Date(targetIso);
  if (Number.isNaN(parsed.getTime())) {
    return emptySummary;
  }
  const target = getLimaDateParts(parsed);
  const today = getLimaDateParts(now);
  const targetUtc = Date.UTC(target.year, target.month - 1, target.day);
  const todayUtc = Date.UTC(today.year, today.month - 1, today.day);
  const diffDays = Math.round((targetUtc - todayUtc) / 86_400_000);

  if (diffDays === 0) {
    return "Hoy";
  }
  if (diffDays === 1) {
    return "Mañana";
  }
  if (diffDays > 1) {
    return `En ${diffDays} días`;
  }
  if (diffDays === -1) {
    return "Ayer";
  }
  return `Hace ${Math.abs(diffDays)} días`;
}

export interface CalendarDayCell {
  day: number | null;
  dayOfWeek: number;
  isPast: boolean;
  isToday: boolean;
  dateKey: string | null;
}

export function buildCalendarMonthGrid(
  year: number,
  month: number,
  now = new Date()
): CalendarDayCell[] {
  const firstUtcDay = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const leadingBlanks = (firstUtcDay + 6) % 7;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const today = getLimaDateParts(now);
  const todayKeyNum = today.year * 10000 + today.month * 100 + today.day;

  const cells: CalendarDayCell[] = [];
  for (let i = 0; i < leadingBlanks; i += 1) {
    cells.push({
      day: null,
      dayOfWeek: (i % 7) + 1,
      isPast: false,
      isToday: false,
      dateKey: null,
    });
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const colIndex = (leadingBlanks + day - 1) % 7;
    const cellKeyNum = year * 10000 + month * 100 + day;
    cells.push({
      day,
      dayOfWeek: colIndex + 1,
      isPast: cellKeyNum < todayKeyNum,
      isToday: cellKeyNum === todayKeyNum,
      dateKey: `${year}-${pad2(month)}-${pad2(day)}`,
    });
  }

  return cells;
}

export function formatCourseDisplayName(course: AcademicCourse): string {
  const formatted = formatAcademicTitle(course.name) || course.name;
  const primaryGroup =
    course.theory_group?.trim() ||
    course.lab_group?.trim() ||
    course.section?.trim() ||
    "";
  if (!primaryGroup) {
    return formatted;
  }
  const escaped = primaryGroup.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const endsWithGroup = new RegExp(`(?:\\(|\\b)${escaped}\\)?$`, "i");
  return endsWithGroup.test(formatted) ? formatted : `${formatted} ${primaryGroup}`;
}

export function formatCourseGroupSubtitle(course: AcademicCourse): string {
  const theory = course.theory_group?.trim() ?? "";
  const lab = course.lab_group?.trim() ?? "";
  const section = course.section?.trim() ?? "";

  if (theory && lab) {
    return `Teoría ${theory} · Lab ${lab}`;
  }
  if (theory) {
    return `Grupo ${theory}`;
  }
  if (lab) {
    return `Lab ${lab}`;
  }
  if (section) {
    return `Grupo ${section}`;
  }
  return course.course_code ?? "";
}
