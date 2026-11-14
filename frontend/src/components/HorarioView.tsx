"use client";

import React, { useEffect, useMemo, useState } from "react";
import type { AcademicAssignment } from "./TaskDetailSheet";
import type { AcademicCourse } from "../hooks/useAcademicBoard";
import type {
  CourseCatalogItem,
  CourseScheduleBlock,
  CourseScheduleBlockInput,
} from "../lib/api-client";
import { horarioMessages as messages, taskBoardMessages } from "../lib/task-board-messages";

const COURSE_COLORS = [
  "#3b82f6",
  "#d946ef",
  "#f59e0b",
  "#10b981",
  "#06b6d4",
  "#f43f5e",
  "#8b5cf6",
] as const;

const GROUP_OPTIONS = ["A", "B", "C", "D", "E", "F"] as const;
const DAY_OPTIONS = [1, 2, 3, 4, 5, 6, 7] as const;

const WEEKDAY_MAP: Record<string, number> = {
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
  Sun: 7,
};

export interface HorarioViewProps {
  courses: AcademicCourse[];
  assignments: AcademicAssignment[];
  catalogCourses?: CourseCatalogItem[];
  loading: boolean;
  syncing: boolean;
  isOnline: boolean;
  moodleSessionExpired: boolean;
  syncError: string | null;
  currentTime?: Date;
  onRefresh: () => void;
  onReconnectMoodle: () => void;
  onOpenNewTask: (course?: AcademicCourse) => void;
  onSaveSchedule?: (
    courseCode: string,
    payload: {
      theory_group: string | null;
      lab_group: string | null;
      blocks: CourseScheduleBlockInput[];
    }
  ) => Promise<void>;
  onLoadCatalog?: (query?: string) => Promise<CourseCatalogItem[]>;
  onLoadGroupSchedule?: (
    courseCode: string,
    theoryGroup: string | null,
    labGroup: string | null
  ) => Promise<CourseScheduleBlock[]>;
  onLinkPendingSource?: (
    sourceId: string,
    payload: {
      course_code: string;
      component_type: "TEORIA" | "LABORATORIO" | "UNICO";
      group_code: string | null;
    }
  ) => Promise<void>;
}

interface EditableBlock {
  key: string;
  component_type: "TEORIA" | "LABORATORIO";
  day_of_week: number;
  start_time: string;
  end_time: string;
  room: string;
}

interface NextClassSummary {
  subLabel: string;
  course: AcademicCourse;
  block: CourseScheduleBlock;
}

function getCourseColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) % 100_003;
  }
  return COURSE_COLORS[Math.abs(hash) % COURSE_COLORS.length];
}

function getLimaClock(date: Date): { dayOfWeek: number; minutesOfDay: number } {
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

function parseMinutes(hhmm: string): number {
  const [hh, mm] = hhmm.split(":").map((part) => Number.parseInt(part, 10));
  if (Number.isNaN(hh) || Number.isNaN(mm)) {
    return 0;
  }
  return hh * 60 + mm;
}

function formatDuration(minutes: number): string {
  const safe = Math.max(1, minutes);
  if (safe < 60) {
    return `${safe} min`;
  }
  const hours = Math.floor(safe / 60);
  const rem = safe % 60;
  return rem === 0 ? `${hours} h` : `${hours} h ${rem} min`;
}

function formatBlockComponentLabel(block: CourseScheduleBlock): string {
  const base = block.component_type === "LABORATORIO" ? "Lab" : "Teoría";
  return `${base} ${block.group_code}${block.room ? ` · ${block.room}` : ""}`;
}

function formatGroupSubtitle(course: AcademicCourse): string | null {
  const parts: string[] = [];
  if (course.theory_group) {
    parts.push(`Teoría ${course.theory_group}`);
  }
  if (course.lab_group) {
    parts.push(`Lab ${course.lab_group}`);
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

function resolveNextClass(courses: AcademicCourse[], now: Date): NextClassSummary | null {
  const entries: Array<{ course: AcademicCourse; block: CourseScheduleBlock; startMin: number; endMin: number }> = [];
  for (const course of courses) {
    for (const block of course.schedule_blocks ?? []) {
      entries.push({
        course,
        block,
        startMin: parseMinutes(block.start_time),
        endMin: parseMinutes(block.end_time),
      });
    }
  }
  if (entries.length === 0) {
    return null;
  }

  const { dayOfWeek, minutesOfDay } = getLimaClock(now);

  // Priority 1: Active class right now
  const active = entries
    .filter((e) => e.block.day_of_week === dayOfWeek && e.startMin <= minutesOfDay && minutesOfDay < e.endMin)
    .sort((a, b) => a.endMin - b.endMin);
  if (active.length > 0) {
    const first = active[0];
    return {
      subLabel: `${messages.inProgressLabel} · ${messages.endsInPrefix} ${formatDuration(first.endMin - minutesOfDay)}`,
      course: first.course,
      block: first.block,
    };
  }

  // Priority 2: Upcoming later today
  const laterToday = entries
    .filter((e) => e.block.day_of_week === dayOfWeek && e.startMin > minutesOfDay)
    .sort((a, b) => a.startMin - b.startMin);
  if (laterToday.length > 0) {
    const first = laterToday[0];
    return {
      subLabel: `${messages.nextLabel} · ${messages.startsInPrefix} ${formatDuration(first.startMin - minutesOfDay)}`,
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
        minutesAway: dayDelta * 1440 + (e.startMin - minutesOfDay),
      };
    })
    .sort((a, b) => a.minutesAway - b.minutesAway);

  const next = upcomingWeek[0];
  const dayLabel = messages.dayAbbreviations[next.block.day_of_week] ?? "Lun";
  return {
    subLabel: `${messages.nextLabel} · ${dayLabel} ${next.block.start_time}`,
    course: next.course,
    block: next.block,
  };
}

function toEditableBlocks(blocks: CourseScheduleBlock[] | undefined): EditableBlock[] {
  return (blocks ?? []).map((b, idx) => ({
    key: b.id || `block-${idx}`,
    component_type: b.component_type === "LABORATORIO" ? "LABORATORIO" : "TEORIA",
    day_of_week: b.day_of_week,
    start_time: b.start_time,
    end_time: b.end_time,
    room: b.room ?? "",
  }));
}

export function HorarioView({
  courses,
  assignments,
  catalogCourses = [],
  loading,
  syncing,
  isOnline,
  moodleSessionExpired,
  syncError,
  currentTime,
  onRefresh,
  onReconnectMoodle,
  onOpenNewTask,
  onSaveSchedule,
  onLoadCatalog,
  onLoadGroupSchedule,
  onLinkPendingSource,
}: HorarioViewProps): React.JSX.Element {
  const [liveClock, setLiveClock] = useState<Date>(() => currentTime ?? new Date());
  useEffect(() => {
    if (currentTime) {
      return;
    }
    const timer = window.setInterval(() => setLiveClock(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, [currentTime]);

  const effectiveNow = currentTime ?? liveClock;

  const linkedCourses = useMemo(
    () => courses.filter((course) => course.mapping_status !== "PENDING_LINK"),
    [courses]
  );
  const pendingCourses = useMemo(
    () => courses.filter((course) => course.mapping_status === "PENDING_LINK"),
    [courses]
  );

  const nextClass = useMemo(
    () => resolveNextClass(linkedCourses, effectiveNow),
    [linkedCourses, effectiveNow]
  );

  const termLabel = useMemo(() => {
    const firstBlock = linkedCourses.find((c) => (c.schedule_blocks ?? []).length > 0)?.schedule_blocks?.[0];
    return firstBlock?.term ?? "2026B";
  }, [linkedCourses]);

  // Schedule editor modal state
  const [editingCourse, setEditingCourse] = useState<AcademicCourse | null>(null);
  const [editTheoryGroup, setEditTheoryGroup] = useState<string>("");
  const [editLabGroup, setEditLabGroup] = useState<string>("");
  const [editBlocks, setEditBlocks] = useState<EditableBlock[]>([]);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [editorSaving, setEditorSaving] = useState<boolean>(false);

  // PENDING_LINK linking modal state
  const [linkingCourse, setLinkingCourse] = useState<AcademicCourse | null>(null);
  const [catalogItems, setCatalogItems] = useState<CourseCatalogItem[]>(catalogCourses);
  const [catalogLoading, setCatalogLoading] = useState<boolean>(false);
  const [catalogQuery, setCatalogQuery] = useState<string>("");
  const [selectedCatalogCode, setSelectedCatalogCode] = useState<string>("");
  const [linkComponentType, setLinkComponentType] = useState<"TEORIA" | "LABORATORIO" | "UNICO">("TEORIA");
  const [linkGroupCode, setLinkGroupCode] = useState<string>("A");
  const [linkError, setLinkError] = useState<string | null>(null);
  const [linkSaving, setLinkSaving] = useState<boolean>(false);

  useEffect(() => {
    if (catalogCourses.length > 0) {
      setCatalogItems(catalogCourses);
    }
  }, [catalogCourses]);

  const openScheduleEditor = (course: AcademicCourse): void => {
    setEditingCourse(course);
    setEditTheoryGroup(course.theory_group ?? "");
    setEditLabGroup(course.lab_group ?? "");
    setEditBlocks(toEditableBlocks(course.schedule_blocks));
    setEditorError(null);
  };

  const handleGroupSelectionChange = async (
    nextTheory: string,
    nextLab: string
  ): Promise<void> => {
    setEditTheoryGroup(nextTheory);
    setEditLabGroup(nextLab);
    if (!editingCourse?.course_code || !onLoadGroupSchedule || !isOnline) {
      return;
    }
    try {
      const shared = await onLoadGroupSchedule(
        editingCourse.course_code,
        nextTheory || null,
        nextLab || null
      );
      if (shared.length > 0) {
        setEditBlocks(toEditableBlocks(shared));
      }
    } catch {
      // Preserve existing draft blocks if shared lookup fails.
    }
  };

  const handleAddSession = (): void => {
    const defaultComp: "TEORIA" | "LABORATORIO" =
      editTheoryGroup || !editLabGroup ? "TEORIA" : "LABORATORIO";
    if (defaultComp === "TEORIA" && !editTheoryGroup) {
      setEditTheoryGroup("A");
    } else if (defaultComp === "LABORATORIO" && !editLabGroup) {
      setEditLabGroup("A");
    }
    setEditBlocks((prev) => [
      ...prev,
      {
        key: `draft-${Date.now()}-${prev.length}`,
        component_type: defaultComp,
        day_of_week: 1,
        start_time: "08:40",
        end_time: "10:20",
        room: "",
      },
    ]);
    setEditorError(null);
  };

  const handleUpdateDraftBlock = (
    key: string,
    patch: Partial<EditableBlock>
  ): void => {
    setEditBlocks((prev) =>
      prev.map((item) => (item.key === key ? { ...item, ...patch } : item))
    );
  };

  const handleRemoveDraftBlock = (key: string): void => {
    setEditBlocks((prev) => prev.filter((item) => item.key !== key));
  };

  const handleSaveScheduleSubmit = async (
    e: React.FormEvent<HTMLFormElement>
  ): Promise<void> => {
    e.preventDefault();
    if (!editingCourse?.course_code || !onSaveSchedule) {
      return;
    }
    if (!isOnline) {
      setEditorError(messages.offlineSaveBlocked);
      return;
    }

    const mappedBlocks: CourseScheduleBlockInput[] = [];
    for (const block of editBlocks) {
      const targetGroup =
        block.component_type === "TEORIA" ? editTheoryGroup : editLabGroup;
      if (!targetGroup) {
        setEditorError(messages.validationMissingGroup);
        return;
      }
      if (block.end_time <= block.start_time) {
        setEditorError(messages.validationInvalidTime);
        return;
      }
      mappedBlocks.push({
        component_type: block.component_type,
        group_code: targetGroup,
        day_of_week: block.day_of_week,
        start_time: block.start_time,
        end_time: block.end_time,
        room: block.room.trim() || null,
      });
    }

    setEditorSaving(true);
    setEditorError(null);
    try {
      await onSaveSchedule(editingCourse.course_code, {
        theory_group: editTheoryGroup || null,
        lab_group: editLabGroup || null,
        blocks: mappedBlocks,
      });
      setEditingCourse(null);
    } catch (err: unknown) {
      setEditorError(
        err instanceof Error ? err.message : taskBoardMessages.syncError
      );
    } finally {
      setEditorSaving(false);
    }
  };

  const openPendingLinker = async (course: AcademicCourse): Promise<void> => {
    const primarySource = course.sources?.[0];
    setLinkingCourse(course);
    setCatalogQuery("");
    setSelectedCatalogCode("");
    setLinkError(null);
    setLinkComponentType(
      primarySource?.component_type === "LABORATORIO"
        ? "LABORATORIO"
        : primarySource?.component_type === "UNICO"
          ? "UNICO"
          : "TEORIA"
    );
    setLinkGroupCode(course.theory_group ?? course.lab_group ?? "A");

    if (catalogItems.length === 0 && onLoadCatalog && isOnline) {
      setCatalogLoading(true);
      try {
        const fetched = await onLoadCatalog();
        setCatalogItems(fetched);
      } catch {
        // Empty state handles missing catalog.
      } finally {
        setCatalogLoading(false);
      }
    }
  };

  const filteredCatalog = useMemo(() => {
    const trimmed = catalogQuery.trim().toLowerCase();
    if (!trimmed) {
      return catalogItems.slice(0, 30);
    }
    return catalogItems
      .filter(
        (item) =>
          item.code.toLowerCase().includes(trimmed) ||
          item.official_name.toLowerCase().includes(trimmed) ||
          item.normalized_name.toLowerCase().includes(trimmed)
      )
      .slice(0, 30);
  }, [catalogItems, catalogQuery]);

  const handleConfirmLink = async (
    e: React.FormEvent<HTMLFormElement>
  ): Promise<void> => {
    e.preventDefault();
    if (!linkingCourse || !onLinkPendingSource) {
      return;
    }
    if (!selectedCatalogCode) {
      setLinkError(messages.selectCatalogError);
      return;
    }
    const sourceId = linkingCourse.sources?.[0]?.source_id ?? linkingCourse.id;
    setLinkSaving(true);
    setLinkError(null);
    try {
      await onLinkPendingSource(sourceId, {
        course_code: selectedCatalogCode,
        component_type: linkComponentType,
        group_code: linkGroupCode || null,
      });
      setLinkingCourse(null);
    } catch (err: unknown) {
      setLinkError(
        err instanceof Error ? err.message : taskBoardMessages.syncError
      );
    } finally {
      setLinkSaving(false);
    }
  };

  return (
    <div className="w-full min-h-dvh bg-black text-white safe-areas pb-28">
      <div className="w-full max-w-md mx-auto px-5 pt-8">
        <header className="mb-5">
          <h1 className="text-4xl font-extrabold tracking-tight text-white">
            {messages.title}
          </h1>
        </header>

        {/* Mandatory State Notices */}
        {!isOnline && (
          <p
            role="status"
            className="mb-4 rounded-2xl bg-[#141416] border border-neutral-800 px-4 py-3 text-sm text-neutral-300"
          >
            {taskBoardMessages.offline}
          </p>
        )}
        {moodleSessionExpired && (
          <button
            type="button"
            onClick={onReconnectMoodle}
            className="mb-4 min-h-[44px] w-full rounded-2xl bg-[#1b080b] border border-[#4a1118] px-4 py-3 text-left text-sm text-[#f87171] cursor-pointer"
          >
            {taskBoardMessages.expired}
          </button>
        )}
        {syncError && (
          <div
            role="alert"
            className="mb-4 rounded-2xl bg-[#141416] border border-neutral-800 p-4 text-sm text-white flex items-center justify-between gap-3"
          >
            <p className="text-neutral-300">{taskBoardMessages.syncError}</p>
            <button
              type="button"
              onClick={onRefresh}
              disabled={syncing}
              className="min-h-[44px] px-3 rounded-xl bg-[#8B0000] text-xs font-semibold text-white shrink-0 cursor-pointer"
            >
              {taskBoardMessages.retry}
            </button>
          </div>
        )}

        {/* Prominent "Siguiente" Card matching Stitch 1:1 */}
        <section
          data-purpose="next-class-card"
          aria-label={messages.nextLabel}
          className="rounded-3xl p-5 mb-8 border border-[#3e1117] bg-gradient-to-b from-[#1b080b] to-[#120507] shadow-lg shadow-black/80"
        >
          {nextClass ? (
            <>
              <div className="text-[#f26c6d] text-base font-medium tracking-wide mb-1">
                {nextClass.subLabel}
              </div>
              <div className="flex items-baseline space-x-2 my-1">
                <span className="text-5xl font-black tracking-tight text-white">
                  {nextClass.block.start_time}
                </span>
                <span className="text-2xl font-normal text-neutral-400">
                  – {nextClass.block.end_time}
                </span>
              </div>
              <h2 className="text-2xl font-bold text-white leading-tight mt-3 mb-2 tracking-tight line-clamp-2">
                {nextClass.course.name}
              </h2>
              <p className="text-sm text-neutral-300">
                {formatBlockComponentLabel(nextClass.block)}
              </p>
            </>
          ) : (
            <>
              <div className="text-[#f26c6d] text-base font-medium tracking-wide mb-1">
                {messages.nextLabel}
              </div>
              <h2 className="text-xl font-bold text-white leading-tight mt-2 mb-1">
                {messages.emptySchedules}
              </h2>
              <p className="text-sm text-neutral-400">
                {messages.emptySchedulesHint}
              </p>
            </>
          )}
        </section>

        {/* Loading Skeletons */}
        {loading && courses.length === 0 ? (
          <div
            role="status"
            aria-label={messages.loading}
            className="animate-pulse space-y-4"
          >
            {[0, 1, 2].map((index) => (
              <div
                key={index}
                className="border-t border-neutral-900 pt-5 space-y-2.5"
              >
                <div className="h-5 w-3/4 rounded bg-neutral-800" />
                <div className="h-4 w-1/3 rounded bg-neutral-900" />
                <div className="h-4 w-2/3 rounded bg-neutral-900" />
              </div>
            ))}
          </div>
        ) : (
          <>
            {/* Enrolled Linked Courses */}
            {linkedCourses.length === 0 && pendingCourses.length === 0 ? (
              <p className="py-12 text-center text-base text-neutral-400">
                {messages.emptyCourses}
              </p>
            ) : (
              <section
                aria-label={messages.sectionTitle}
                data-purpose="enrolled-courses-list"
                className="space-y-6"
              >
                {linkedCourses.length > 0 && (
                  <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
                    {messages.sectionTitle} · {termLabel}
                  </p>
                )}

                {linkedCourses.map((course) => {
                  const color = getCourseColor(course.course_code ?? course.id);
                  const groupSubtitle = formatGroupSubtitle(course);
                  const courseAssignments = assignments.filter(
                    (a) =>
                      a.course_id === course.id ||
                      (Boolean(course.course_code) && a.course_code === course.course_code)
                  );
                  const totalCount = courseAssignments.length;
                  const completedCount = courseAssignments.filter(
                    (a) => Boolean(a.is_completed)
                  ).length;
                  const pendingCount = totalCount - completedCount;

                  return (
                    <article
                      key={course.id}
                      className="border-t border-neutral-900 pt-5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start space-x-2.5 pt-1 min-w-0">
                          <span
                            aria-hidden="true"
                            className="w-3.5 h-3.5 rounded-sm inline-block shrink-0 mt-1"
                            style={{ backgroundColor: color }}
                          />
                          <h3 className="text-lg font-bold text-white tracking-tight leading-snug line-clamp-2">
                            {course.name}
                          </h3>
                        </div>
                        <button
                          type="button"
                          onClick={() => onOpenNewTask(course)}
                          className="min-h-[44px] px-2 text-sm font-bold text-neutral-200 hover:text-white transition-colors shrink-0 cursor-pointer"
                        >
                          {messages.addTaskButton}
                        </button>
                      </div>

                      <div className="pl-6 mt-0.5 mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                        {groupSubtitle ? (
                          <span className="text-neutral-400 text-sm font-normal">
                            {groupSubtitle}
                          </span>
                        ) : (
                          <span className="text-neutral-500 text-sm font-normal">
                            {messages.configureGroupsSubtitle}
                          </span>
                        )}
                        {course.course_code && onSaveSchedule && (
                          <button
                            type="button"
                            onClick={() => openScheduleEditor(course)}
                            className="min-h-[44px] text-xs font-semibold text-[#f26c6d] hover:text-white transition-colors cursor-pointer"
                          >
                            {messages.editScheduleButton}
                          </button>
                        )}
                      </div>

                      {(course.schedule_blocks ?? []).length > 0 ? (
                        <div className="pl-6 space-y-1 font-mono text-sm text-neutral-200">
                          {(course.schedule_blocks ?? []).map((block) => (
                            <div
                              key={block.id}
                              className="flex items-center min-w-0"
                            >
                              <span className="w-16 font-sans text-neutral-400 font-normal shrink-0">
                                {block.component_type === "LABORATORIO"
                                  ? "Lab"
                                  : "Teoría"}
                              </span>
                              <span className="tracking-tight truncate">
                                {messages.dayAbbreviations[block.day_of_week] ?? "Lun"}{" "}
                                {block.start_time}–{block.end_time}
                                {block.room ? ` · ${block.room}` : ""}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="pl-6 text-xs text-neutral-500">
                          {messages.courseNoSessionsHint}
                        </p>
                      )}

                      <p className="text-neutral-400 text-sm mt-2 pl-6 font-normal">
                        {completedCount}/{totalCount} entregas
                        {pendingCount > 0 && (
                          <>
                            {" "}
                            <span className="text-neutral-600">·</span>{" "}
                            <span className="text-[#f87171] font-medium">
                              {pendingCount}{" "}
                              {pendingCount === 1 ? "pendiente" : "pendientes"}
                            </span>
                          </>
                        )}
                      </p>
                    </article>
                  );
                })}
              </section>
            )}

            {/* Compact PENDING_LINK Section */}
            {pendingCourses.length > 0 && (
              <section
                aria-label={messages.pendingSectionTitle}
                className="mt-8 pt-6 border-t border-neutral-900 space-y-3"
              >
                <div>
                  <h2 className="text-sm font-bold text-white">
                    {messages.pendingSectionTitle}
                  </h2>
                  <p className="text-xs text-neutral-400 mt-0.5">
                    {messages.pendingSectionDescription}
                  </p>
                </div>
                <div className="space-y-2.5">
                  {pendingCourses.map((pending) => (
                    <div
                      key={pending.id}
                      className="rounded-2xl bg-[#141416] border border-neutral-800/80 p-3.5 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-white truncate">
                          {pending.name}
                        </p>
                        <p className="text-xs text-neutral-400 mt-0.5">
                          {pending.origin === "moodle" ? "Moodle" : "Classroom"}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          void openPendingLinker(pending);
                        }}
                        className="min-h-[44px] px-3 rounded-xl bg-[#8B0000] hover:bg-[#A51C30] text-xs font-semibold text-white shrink-0 cursor-pointer"
                      >
                        {messages.linkCourseButton}
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>

      {/* Group & Schedule Editor Modal */}
      {editingCourse && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
          onClick={() => !editorSaving && setEditingCourse(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="schedule-editor-title"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md max-h-[85dvh] overflow-y-auto rounded-2xl bg-[#121214] border border-neutral-800 p-5 text-white shadow-2xl space-y-4"
          >
            <div>
              <h2 id="schedule-editor-title" className="text-lg font-bold text-white">
                {messages.editorDialogTitle}
              </h2>
              <p className="text-xs text-neutral-400 mt-1 line-clamp-2">
                {editingCourse.name}
              </p>
            </div>

            <form onSubmit={handleSaveScheduleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-xs text-neutral-300 space-y-1">
                  <span>{messages.theoryGroupLabel}</span>
                  <select
                    aria-label={messages.theoryGroupLabel}
                    value={editTheoryGroup}
                    onChange={(e) => {
                      void handleGroupSelectionChange(e.target.value, editLabGroup);
                    }}
                    className="w-full min-h-[44px] rounded-xl bg-black border border-neutral-700 px-3 text-sm text-white"
                  >
                    <option value="">{messages.noGroupOption}</option>
                    {GROUP_OPTIONS.map((grp) => (
                      <option key={grp} value={grp}>
                        Grupo {grp}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block text-xs text-neutral-300 space-y-1">
                  <span>{messages.labGroupLabel}</span>
                  <select
                    aria-label={messages.labGroupLabel}
                    value={editLabGroup}
                    onChange={(e) => {
                      void handleGroupSelectionChange(editTheoryGroup, e.target.value);
                    }}
                    className="w-full min-h-[44px] rounded-xl bg-black border border-neutral-700 px-3 text-sm text-white"
                  >
                    <option value="">{messages.noGroupOption}</option>
                    {GROUP_OPTIONS.map((grp) => (
                      <option key={grp} value={grp}>
                        Grupo {grp}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="space-y-3">
                {editBlocks.map((block) => (
                  <div
                    key={block.key}
                    className="rounded-xl bg-black/70 border border-neutral-800 p-3 space-y-2.5"
                  >
                    <div className="grid grid-cols-2 gap-2">
                      <select
                        aria-label={messages.sessionComponentLabel}
                        value={block.component_type}
                        onChange={(e) =>
                          handleUpdateDraftBlock(block.key, {
                            component_type:
                              e.target.value === "LABORATORIO"
                                ? "LABORATORIO"
                                : "TEORIA",
                          })
                        }
                        className="min-h-[44px] rounded-lg bg-[#141416] border border-neutral-700 px-2.5 text-xs text-white"
                      >
                        <option value="TEORIA">Teoría</option>
                        <option value="LABORATORIO">Laboratorio</option>
                      </select>

                      <select
                        aria-label={messages.sessionDayLabel}
                        value={block.day_of_week}
                        onChange={(e) =>
                          handleUpdateDraftBlock(block.key, {
                            day_of_week: Number.parseInt(e.target.value, 10),
                          })
                        }
                        className="min-h-[44px] rounded-lg bg-[#141416] border border-neutral-700 px-2.5 text-xs text-white"
                      >
                        {DAY_OPTIONS.map((dayNum) => (
                          <option key={dayNum} value={dayNum}>
                            {messages.dayFullNames[dayNum]}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <label className="text-[11px] text-neutral-400 space-y-1">
                        <span>{messages.sessionStartLabel}</span>
                        <input
                          type="time"
                          aria-label={messages.sessionStartLabel}
                          value={block.start_time}
                          onChange={(e) =>
                            handleUpdateDraftBlock(block.key, {
                              start_time: e.target.value,
                            })
                          }
                          className="w-full min-h-[44px] rounded-lg bg-[#141416] border border-neutral-700 px-2.5 text-xs text-white"
                        />
                      </label>
                      <label className="text-[11px] text-neutral-400 space-y-1">
                        <span>{messages.sessionEndLabel}</span>
                        <input
                          type="time"
                          aria-label={messages.sessionEndLabel}
                          value={block.end_time}
                          onChange={(e) =>
                            handleUpdateDraftBlock(block.key, {
                              end_time: e.target.value,
                            })
                          }
                          className="w-full min-h-[44px] rounded-lg bg-[#141416] border border-neutral-700 px-2.5 text-xs text-white"
                        />
                      </label>
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        aria-label={messages.sessionRoomLabel}
                        placeholder={messages.sessionRoomPlaceholder}
                        value={block.room}
                        onChange={(e) =>
                          handleUpdateDraftBlock(block.key, {
                            room: e.target.value,
                          })
                        }
                        className="flex-1 min-h-[44px] rounded-lg bg-[#141416] border border-neutral-700 px-2.5 text-xs text-white"
                      />
                      <button
                        type="button"
                        onClick={() => handleRemoveDraftBlock(block.key)}
                        className="min-h-[44px] px-3 rounded-lg border border-neutral-700 text-xs text-neutral-300 hover:text-white cursor-pointer"
                      >
                        {messages.deleteSessionButton}
                      </button>
                    </div>
                  </div>
                ))}

                <button
                  type="button"
                  onClick={handleAddSession}
                  className="w-full min-h-[44px] rounded-xl border border-dashed border-neutral-700 text-xs font-semibold text-neutral-200 hover:border-neutral-500 cursor-pointer"
                >
                  {messages.addSessionButton}
                </button>
              </div>

              {editorError && (
                <p role="alert" className="text-xs text-[#f87171]">
                  {editorError}
                </p>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  disabled={editorSaving}
                  onClick={() => setEditingCourse(null)}
                  className="min-h-[44px] px-4 rounded-xl border border-neutral-700 text-xs font-semibold text-neutral-200 cursor-pointer"
                >
                  {messages.cancelButton}
                </button>
                <button
                  type="submit"
                  disabled={editorSaving}
                  className="min-h-[44px] px-4 rounded-xl bg-[#8B0000] hover:bg-[#A51C30] text-xs font-semibold text-white cursor-pointer disabled:opacity-60"
                >
                  {editorSaving
                    ? messages.savingScheduleButton
                    : messages.saveScheduleButton}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Pending Source Catalog Linker Modal */}
      {linkingCourse && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
          onClick={() => !linkSaving && setLinkingCourse(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="pending-link-title"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md max-h-[85dvh] overflow-y-auto rounded-2xl bg-[#121214] border border-neutral-800 p-5 text-white shadow-2xl space-y-4"
          >
            <div>
              <h2 id="pending-link-title" className="text-lg font-bold text-white">
                {messages.linkDialogTitle}
              </h2>
              <p className="text-xs text-neutral-400 mt-1">
                {linkingCourse.name}
              </p>
            </div>

            <form onSubmit={handleConfirmLink} className="space-y-3">
              <input
                type="search"
                value={catalogQuery}
                onChange={(e) => setCatalogQuery(e.target.value)}
                placeholder={messages.catalogSearchPlaceholder}
                className="w-full min-h-[44px] rounded-xl bg-black border border-neutral-700 px-3 text-sm text-white"
              />

              <div className="max-h-44 overflow-y-auto space-y-1.5 rounded-xl bg-black/60 border border-neutral-800 p-2">
                {catalogLoading ? (
                  <p className="text-xs text-neutral-400 p-2">
                    {messages.catalogLoading}
                  </p>
                ) : filteredCatalog.length === 0 ? (
                  <p className="text-xs text-neutral-400 p-2">
                    {messages.catalogEmpty}
                  </p>
                ) : (
                  filteredCatalog.map((item) => {
                    const selected = selectedCatalogCode === item.code;
                    return (
                      <button
                        key={item.code}
                        type="button"
                        onClick={() => setSelectedCatalogCode(item.code)}
                        className={`w-full min-h-[44px] px-3 py-2 rounded-lg text-left text-xs transition cursor-pointer ${
                          selected
                            ? "bg-[#8B0000] text-white font-semibold"
                            : "text-neutral-200 hover:bg-neutral-800"
                        }`}
                      >
                        <span className="font-mono">{item.code}</span> · {item.official_name} ({item.curriculum_year})
                      </button>
                    );
                  })
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <select
                  aria-label={messages.sessionComponentLabel}
                  value={linkComponentType}
                  onChange={(e) => {
                    const val = e.target.value;
                    setLinkComponentType(
                      val === "LABORATORIO"
                        ? "LABORATORIO"
                        : val === "UNICO"
                          ? "UNICO"
                          : "TEORIA"
                    );
                  }}
                  className="min-h-[44px] rounded-xl bg-black border border-neutral-700 px-3 text-xs text-white"
                >
                  <option value="TEORIA">Teoría</option>
                  <option value="LABORATORIO">Laboratorio</option>
                  <option value="UNICO">Único</option>
                </select>

                <select
                  aria-label="Grupo"
                  value={linkGroupCode}
                  onChange={(e) => setLinkGroupCode(e.target.value)}
                  className="min-h-[44px] rounded-xl bg-black border border-neutral-700 px-3 text-xs text-white"
                >
                  {GROUP_OPTIONS.map((grp) => (
                    <option key={grp} value={grp}>
                      Grupo {grp}
                    </option>
                  ))}
                </select>
              </div>

              {linkError && (
                <p role="alert" className="text-xs text-[#f87171]">
                  {linkError}
                </p>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  disabled={linkSaving}
                  onClick={() => setLinkingCourse(null)}
                  className="min-h-[44px] px-4 rounded-xl border border-neutral-700 text-xs font-semibold text-neutral-200 cursor-pointer"
                >
                  {messages.cancelButton}
                </button>
                <button
                  type="submit"
                  disabled={linkSaving}
                  className="min-h-[44px] px-4 rounded-xl bg-[#8B0000] hover:bg-[#A51C30] text-xs font-semibold text-white cursor-pointer disabled:opacity-60"
                >
                  {linkSaving
                    ? messages.linkingButton
                    : messages.confirmLinkButton}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
