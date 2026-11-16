"use client";

import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowClockwise,
  ArrowUUpLeft,
  BookOpen,
  CaretDown,
  Flask,
  MagnifyingGlass,
  X,
} from "@phosphor-icons/react";
import type { AcademicAssignment } from "@/components/sheets/TaskDetailSheet";
import type { AcademicCourse } from "@/hooks/useAcademicBoard";
import { getCourseColor } from "@/lib/schedule-calculator";
import {
  formatTaskMetadataLine,
  groupTasksBySchedule,
  TaskGroup,
} from "@/lib/task-urgency";
import { formatAcademicTitle } from "@/lib/text-format";
import { taskBoardMessages as messages } from "@/lib/messages/task-board-messages";

interface HoyViewProps {
  assignments: AcademicAssignment[];
  courses: AcademicCourse[];
  loading: boolean;
  syncing: boolean;
  isOnline: boolean;
  moodleSessionExpired: boolean;
  syncError: string | null;
  onRefresh: () => void;
  onOpenSettings?: () => void;
  onOpenSchedule?: () => void;
  onReconnectMoodle: () => void;
  onCompletionChange?: (id: string, completed: boolean) => void;
  completionPending?: boolean;
  completionError?: string | null;
}

type ComponentFilter = "all" | "theory" | "lab";

interface UndoToastState {
  id: string;
  title: string;
}

interface ResolvedTaskMeta {
  componentType: "TEORIA" | "LABORATORIO" | "UNICO";
  componentLabel: string;
  courseLabel: string;
  dotColor: string;
}

const GROUP_ORDER: TaskGroup[] = ["overdue", "today", "week", "upcoming", "undated"];
const PULL_THRESHOLD_PX = 48;
const UNDO_TIMEOUT_MS = 5000;

function resolvePriorityLabel(priority?: string | null): string | null {
  if (!priority) return null;
  const upper = priority.toUpperCase();
  if (upper === "ALTA") return messages.priorities.ALTA;
  if (upper === "MEDIA") return messages.priorities.MEDIA;
  if (upper === "BAJA") return messages.priorities.BAJA;
  return null;
}

function normalizeComponentType(
  raw?: string | null
): "TEORIA" | "LABORATORIO" | "UNICO" {
  const upper = raw?.toUpperCase();
  if (upper === "LABORATORIO") return "LABORATORIO";
  if (upper === "TEORIA") return "TEORIA";
  return "UNICO";
}

function resolveTaskMetadata(
  item: AcademicAssignment,
  coursesById: Map<string, AcademicCourse>,
  coursesByCode: Map<string, AcademicCourse>
): ResolvedTaskMeta {
  const course =
    (item.course_id ? coursesById.get(item.course_id) : undefined) ??
    (item.course_code ? coursesByCode.get(item.course_code) : undefined);

  const matchedSource =
    item.source_id && course?.sources
      ? course.sources.find((src) => src.source_id === item.source_id)
      : undefined;

  const componentType = normalizeComponentType(
    item.component_type ?? matchedSource?.component_type
  );
  const componentLabel =
    componentType === "LABORATORIO"
      ? messages.components.lab
      : messages.components.theory;

  const baseName =
    formatAcademicTitle(item.courseName ?? course?.name) ||
    (!item.course_id && !item.course_code ? "Personal" : "Curso UNSA");
  const groupCode =
    item.group_code ??
    (componentType === "LABORATORIO" ? course?.lab_group : course?.theory_group) ??
    null;
  const courseLabel = groupCode ? `${baseName} ${groupCode}` : baseName;

  const colorSeed =
    course?.course_code ?? item.course_code ?? course?.id ?? item.course_id ?? "personal";

  return {
    componentType,
    componentLabel,
    courseLabel,
    dotColor: getCourseColor(colorSeed),
  };
}

const TaskCardRow = memo(function TaskCardRow({
  item,
  group,
  meta,
  now,
  onToggleComplete,
  onSelect,
}: {
  item: AcademicAssignment;
  group: TaskGroup;
  meta: ResolvedTaskMeta;
  now: Date;
  onToggleComplete: (task: AcademicAssignment) => void;
  onSelect: (task: AcademicAssignment) => void;
}) {
  const isOverdue = group === "overdue";
  const priorityText = resolvePriorityLabel(item.priority);
  const dueText = formatTaskMetadataLine(
    item.due_date,
    group,
    meta.componentLabel,
    now
  );

  const displayTitle = formatAcademicTitle(item.title) || item.title;

  return (
    <article
      className={
        isOverdue
          ? "bg-[#241717] border border-[#3e1f20]/60 rounded-xl p-3 flex gap-2.5 items-start shadow-sm"
          : "p-3 flex gap-2.5 items-start"
      }
    >
      <button
        type="button"
        aria-label={`${messages.complete}: ${displayTitle}`}
        onClick={(event) => {
          event.stopPropagation();
          onToggleComplete(item);
        }}
        className="min-w-[44px] min-h-[44px] -ml-2 -mt-2 flex items-center justify-center shrink-0 cursor-pointer group"
      >
        <span className="w-5 h-5 rounded-full border-2 border-neutral-500 group-hover:border-neutral-300 transition-colors" />
      </button>

      <button
        type="button"
        onClick={() => onSelect(item)}
        className="flex-1 min-w-0 min-h-[44px] text-left flex flex-col gap-0.5 cursor-pointer"
      >
        <div className="flex justify-between items-baseline gap-2">
          <h2 className="text-base font-semibold text-white tracking-tight line-clamp-2">
            {displayTitle}
          </h2>
          {priorityText && (
            <span className="text-[11px] text-neutral-400 font-normal shrink-0">
              {priorityText}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 text-xs text-neutral-300 min-w-0">
          <span
            aria-hidden="true"
            className="w-2 h-2 rounded-full shrink-0"
            style={{ backgroundColor: meta.dotColor }}
          />
          <span className="font-normal truncate">{meta.courseLabel}</span>
        </div>

        <div className="flex items-center gap-1.5 text-xs text-neutral-400 mt-0.5">
          {meta.componentType === "LABORATORIO" ? (
            <Flask aria-hidden="true" className="w-3.5 h-3.5 shrink-0" weight="regular" />
          ) : (
            <BookOpen aria-hidden="true" className="w-3.5 h-3.5 shrink-0" weight="regular" />
          )}
          <span>{isOverdue ? meta.componentLabel : dueText}</span>
        </div>

        {isOverdue && (
          <p className="text-xs text-[#eb5353] font-normal mt-1 leading-snug">
            {dueText}
          </p>
        )}
      </button>
    </article>
  );
});

export function HoyView({
  assignments,
  courses,
  loading,
  syncing,
  isOnline,
  moodleSessionExpired,
  syncError,
  onRefresh,
  onReconnectMoodle,
  onCompletionChange,
  completionError = null,
}: HoyViewProps): React.JSX.Element {
  const [componentFilter, setComponentFilter] = useState<ComponentFilter>("all");
  const [selectedCourseId, setSelectedCourseId] = useState<string>("all");
  const [searchOpen, setSearchOpen] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [detailModalTask, setDetailModalTask] = useState<AcademicAssignment | null>(null);
  const [optimisticHiddenIds, setOptimisticHiddenIds] = useState<Record<string, true>>({});
  const [undoToast, setUndoToast] = useState<UndoToastState | null>(null);
  const [offlineCompletionNotice, setOfflineCompletionNotice] = useState<boolean>(false);
  const [pullDistance, setPullDistance] = useState<number>(0);
  const [now, setNow] = useState<Date>(() => new Date());

  const pullStartYRef = useRef<number | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (completionError) {
      setOptimisticHiddenIds({});
      setUndoToast(null);
      if (undoTimerRef.current) {
        clearTimeout(undoTimerRef.current);
        undoTimerRef.current = null;
      }
    }
  }, [completionError]);

  useEffect(() => {
    if (isOnline) {
      setOfflineCompletionNotice(false);
    }
  }, [isOnline]);

  useEffect(() => {
    return () => {
      if (undoTimerRef.current) {
        clearTimeout(undoTimerRef.current);
      }
    };
  }, []);

  const coursesById = useMemo(
    () => new Map(courses.map((course) => [course.id, course])),
    [courses]
  );

  const coursesByCode = useMemo(() => {
    const map = new Map<string, AcademicCourse>();
    for (const course of courses) {
      if (course.course_code) {
        map.set(course.course_code, course);
      }
    }
    return map;
  }, [courses]);

  const courseOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const course of courses) {
      seen.set(course.id, formatAcademicTitle(course.name) || course.name);
    }
    for (const task of assignments) {
      if (task.course_id && !seen.has(task.course_id) && task.courseName) {
        seen.set(
          task.course_id,
          formatAcademicTitle(task.courseName) || task.courseName
        );
      }
    }
    return Array.from(seen.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, "es"));
  }, [courses, assignments]);

  const metadataById = useMemo(() => {
    const map = new Map<string, ResolvedTaskMeta>();
    for (const item of assignments) {
      map.set(item.id, resolveTaskMetadata(item, coursesById, coursesByCode));
    }
    return map;
  }, [assignments, coursesById, coursesByCode]);

  const visibleAssignments = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    return assignments.filter((item) => {
      if (item.is_completed || optimisticHiddenIds[item.id]) {
        return false;
      }

      const meta = metadataById.get(item.id);
      if (componentFilter === "lab" && meta?.componentType !== "LABORATORIO") {
        return false;
      }
      if (
        componentFilter === "theory" &&
        meta?.componentType !== "TEORIA" &&
        meta?.componentType !== "UNICO"
      ) {
        return false;
      }

      if (selectedCourseId !== "all") {
        const selectedCourse = coursesById.get(selectedCourseId);
        const matchesDirectId =
          Boolean(item.course_id) && item.course_id === selectedCourseId;
        const matchesCode =
          !(item.course_id && coursesById.has(item.course_id)) &&
          Boolean(selectedCourse?.course_code) &&
          item.course_code === selectedCourse?.course_code;
        if (!matchesDirectId && !matchesCode) {
          return false;
        }
      }

      if (normalizedQuery) {
        const titleHit = item.title.toLowerCase().includes(normalizedQuery);
        const courseHit = (meta?.courseLabel ?? "").toLowerCase().includes(normalizedQuery);
        if (!titleHit && !courseHit) {
          return false;
        }
      }

      return true;
    });
  }, [
    assignments,
    optimisticHiddenIds,
    metadataById,
    componentFilter,
    selectedCourseId,
    coursesById,
    searchQuery,
  ]);

  const groups = useMemo(
    () => groupTasksBySchedule(visibleAssignments, now),
    [visibleAssignments, now]
  );

  const hasActiveTasks = visibleAssignments.length > 0;
  const hasAnyPendingAssignments = useMemo(
    () => assignments.some((item) => !item.is_completed && !optimisticHiddenIds[item.id]),
    [assignments, optimisticHiddenIds]
  );

  const handleCompleteInline = useCallback(
    (task: AcademicAssignment) => {
      if (!isOnline) {
        setOfflineCompletionNotice(true);
        return;
      }

      setOfflineCompletionNotice(false);
      setOptimisticHiddenIds((prev) => ({ ...prev, [task.id]: true }));
      setUndoToast({
        id: task.id,
        title: formatAcademicTitle(task.title) || task.title,
      });

      if (undoTimerRef.current) {
        clearTimeout(undoTimerRef.current);
      }
      undoTimerRef.current = setTimeout(() => {
        setUndoToast(null);
        undoTimerRef.current = null;
      }, UNDO_TIMEOUT_MS);

      onCompletionChange?.(task.id, true);
    },
    [isOnline, onCompletionChange]
  );

  const handleUndoComplete = useCallback(() => {
    if (!undoToast) return;
    const targetId = undoToast.id;

    if (undoTimerRef.current) {
      clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }

    setUndoToast(null);
    setOptimisticHiddenIds((prev) => {
      const next = { ...prev };
      delete next[targetId];
      return next;
    });
    onCompletionChange?.(targetId, false);
  }, [undoToast, onCompletionChange]);

  const handleTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    if (syncing || loading) return;
    if (typeof window !== "undefined" && window.scrollY > 0) return;
    pullStartYRef.current = event.touches[0]?.clientY ?? null;
  };

  const handleTouchMove = (event: React.TouchEvent<HTMLDivElement>) => {
    if (pullStartYRef.current === null || syncing) return;
    if (typeof window !== "undefined" && window.scrollY > 0) {
      pullStartYRef.current = null;
      setPullDistance(0);
      return;
    }
    const currentY = event.touches[0]?.clientY ?? pullStartYRef.current;
    const delta = currentY - pullStartYRef.current;
    if (delta > 0) {
      setPullDistance(Math.min(88, Math.round(delta * 0.5)));
    } else {
      setPullDistance(0);
    }
  };

  const handleTouchEnd = () => {
    if (pullStartYRef.current === null) return;
    const shouldRefresh = pullDistance >= PULL_THRESHOLD_PX && !syncing;
    pullStartYRef.current = null;
    setPullDistance(0);
    if (shouldRefresh) {
      onRefresh();
    }
  };

  return (
    <div
      data-testid="tareas-board"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      className="w-full min-h-dvh bg-black text-white safe-areas pb-28 overflow-x-hidden"
    >
      <div className="w-full max-w-md mx-auto px-5 pt-6">
        {(pullDistance > 12 || syncing) && (
          <div
            role="status"
            className="mb-3 flex items-center justify-center gap-2 text-xs text-neutral-400"
          >
            <ArrowClockwise
              aria-hidden="true"
              className={`w-3.5 h-3.5 ${syncing ? "animate-spin text-[#d85858]" : ""}`}
            />
            <span>
              {syncing ? messages.updating : messages.pullToRefreshHint}
            </span>
          </div>
        )}

        <header className="flex flex-col gap-3 pb-2">
          <h1 className="text-3xl font-extrabold tracking-tight text-white">
            {messages.title}
          </h1>

          {/* Segmented Pill Filter: Todas | Teoria | Lab */}
          <nav
            aria-label="Filtrar por tipo"
            className="w-full bg-[#1c1c1e] p-1 rounded-xl flex items-center justify-between text-xs"
          >
            <button
              type="button"
              aria-pressed={componentFilter === "all"}
              onClick={() => setComponentFilter("all")}
              className={`flex-1 min-h-[38px] py-1.5 rounded-lg font-medium transition-all cursor-pointer ${
                componentFilter === "all"
                  ? "bg-[#3a3a3c] text-white shadow-sm"
                  : "text-neutral-400 hover:text-white"
              }`}
            >
              {messages.filters.all}
            </button>

            <button
              type="button"
              aria-pressed={componentFilter === "theory"}
              onClick={() => setComponentFilter("theory")}
              className={`flex-1 min-h-[38px] py-1.5 rounded-lg font-medium flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                componentFilter === "theory"
                  ? "bg-[#3a3a3c] text-white shadow-sm"
                  : "text-neutral-400 hover:text-white"
              }`}
            >
              <BookOpen aria-hidden="true" className="w-3.5 h-3.5" weight="regular" />
              <span>{messages.filters.theory}</span>
            </button>

            <button
              type="button"
              aria-pressed={componentFilter === "lab"}
              onClick={() => setComponentFilter("lab")}
              className={`flex-1 min-h-[38px] py-1.5 rounded-lg font-medium flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                componentFilter === "lab"
                  ? "bg-[#3a3a3c] text-white shadow-sm"
                  : "text-neutral-400 hover:text-white"
              }`}
            >
              <Flask aria-hidden="true" className="w-3.5 h-3.5" weight="regular" />
              <span>{messages.filters.lab}</span>
            </button>
          </nav>

          {/* Sub-header: Course dropdown + Search toggle */}
          <div className="flex justify-between items-center text-sm pt-1">
            <div className="relative inline-flex items-center min-h-[44px]">
              <select
                aria-label={messages.filters.courseFilterAria}
                value={selectedCourseId}
                onChange={(event) => setSelectedCourseId(event.target.value)}
                className="appearance-none bg-transparent pr-5 py-2 text-sm font-normal text-[#d85858] focus:outline-none cursor-pointer max-w-[230px] truncate"
              >
                <option value="all" className="bg-[#1c1c1e] text-white">
                  {messages.filters.allCourses}
                </option>
                {courseOptions.map((course) => (
                  <option
                    key={course.id}
                    value={course.id}
                    className="bg-[#1c1c1e] text-white"
                  >
                    {course.name}
                  </option>
                ))}
              </select>
              <CaretDown
                aria-hidden="true"
                className="w-3.5 h-3.5 text-[#d85858] pointer-events-none absolute right-0"
                weight="bold"
              />
            </div>

            <button
              type="button"
              aria-label={messages.filters.searchAria}
              aria-expanded={searchOpen}
              onClick={() => {
                setSearchOpen((prev) => {
                  const next = !prev;
                  if (!next) {
                    setSearchQuery("");
                  }
                  return next;
                });
              }}
              className="min-w-[44px] min-h-[44px] flex items-center justify-end text-[#d85858] hover:opacity-80 transition-opacity cursor-pointer"
            >
              {searchOpen ? (
                <X aria-hidden="true" className="w-4 h-4" weight="bold" />
              ) : (
                <MagnifyingGlass aria-hidden="true" className="w-4 h-4" weight="bold" />
              )}
            </button>
          </div>

          {searchOpen && (
            <div className="pb-1">
              <input
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder={messages.filters.searchPlaceholder}
                className="w-full min-h-[44px] rounded-xl bg-[#1c1c1e] border border-neutral-800 px-3.5 py-2 text-sm text-white placeholder:text-neutral-500 focus:outline-none focus:border-[#d85858]"
              />
            </div>
          )}
        </header>

        {/* Mandatory Functional States */}
        <div className="space-y-2.5 mt-2">
          {!isOnline && (
            <p
              role="status"
              className="rounded-2xl bg-[#141416] border border-neutral-800 px-4 py-3 text-xs text-neutral-300"
            >
              {messages.offline}
            </p>
          )}

          {offlineCompletionNotice && (
            <p
              role="status"
              className="rounded-2xl bg-[#1c1c1e] border border-neutral-700 px-4 py-2.5 text-xs text-neutral-200"
            >
              {messages.offlineCompletion}
            </p>
          )}

          {completionError && (
            <p
              role="alert"
              className="rounded-2xl bg-[#241717] border border-[#3e1f20] px-4 py-3 text-xs text-[#eb5353]"
            >
              {messages.completionError}
            </p>
          )}

          {moodleSessionExpired && (
            <button
              type="button"
              onClick={onReconnectMoodle}
              className="min-h-[44px] w-full rounded-2xl bg-[#1b080b] border border-[#4a1118] px-4 py-3 text-left text-xs text-[#f87171] cursor-pointer"
            >
              {messages.expired}
            </button>
          )}

          {syncError && (
            <div
              role="alert"
              className="rounded-2xl bg-[#141416] border border-neutral-800 p-3.5 text-xs text-white flex items-center justify-between gap-3"
            >
              <p className="text-neutral-300">{messages.syncError}</p>
              <button
                type="button"
                onClick={onRefresh}
                disabled={syncing}
                className="min-h-[44px] px-3 rounded-xl bg-[#8B0000] text-xs font-semibold text-white shrink-0 cursor-pointer"
              >
                {messages.retry}
              </button>
            </div>
          )}
        </div>

        {/* Main Content */}
        {loading && !hasActiveTasks ? (
          <div
            role="status"
            aria-label={messages.loading}
            className="space-y-4 pt-3"
          >
            {[0, 1, 2].map((idx) => (
              <div
                key={idx}
                className="animate-pulse rounded-xl bg-[#1c1c1e] border border-neutral-800/80 p-3.5 space-y-2.5"
              >
                <div className="h-4 w-3/5 rounded bg-neutral-800" />
                <div className="h-3 w-2/5 rounded bg-neutral-800" />
                <div className="h-3 w-1/3 rounded bg-neutral-800" />
              </div>
            ))}
          </div>
        ) : !hasActiveTasks ? (
          <div className="mt-6 rounded-2xl bg-[#141416] border border-neutral-800/80 px-5 py-10 text-center">
            <p className="text-sm text-neutral-400">
              {hasAnyPendingAssignments ? messages.emptyFiltered : messages.empty}
            </p>
          </div>
        ) : (
          <div className="flex flex-col space-y-4 pt-3">
            {GROUP_ORDER.map((group) => {
              const items = groups[group];
              if (items.length === 0) return null;
              const heading = messages.groups[group];
              const isOverdue = group === "overdue";

              return (
                <section
                  key={group}
                  aria-label={heading}
                  className="flex flex-col"
                >
                  <div className="flex justify-between items-center text-xs mb-1.5 px-1">
                    <span
                      className={`font-semibold text-sm ${
                        isOverdue ? "text-[#e25050]" : "text-white"
                      }`}
                    >
                      {heading}
                    </span>
                    <span className="text-neutral-500 font-medium text-xs">
                      {messages.countLabel(items.length)}
                    </span>
                  </div>

                  {isOverdue ? (
                    <div className="flex flex-col space-y-2.5">
                      {items.map((item) => {
                        const meta = metadataById.get(item.id);
                        if (!meta) return null;
                        return (
                          <TaskCardRow
                            key={item.id}
                            item={item}
                            group={group}
                            meta={meta}
                            now={now}
                            onToggleComplete={handleCompleteInline}
                            onSelect={setDetailModalTask}
                          />
                        );
                      })}
                    </div>
                  ) : (
                    <div className="bg-[#1c1c1e] border border-neutral-800/80 rounded-xl flex flex-col divide-y divide-neutral-800/80 shadow-sm overflow-hidden">
                      {items.map((item) => {
                        const meta = metadataById.get(item.id);
                        if (!meta) return null;
                        return (
                          <TaskCardRow
                            key={item.id}
                            item={item}
                            group={group}
                            meta={meta}
                            now={now}
                            onToggleComplete={handleCompleteInline}
                            onSelect={setDetailModalTask}
                          />
                        );
                      })}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        )}
      </div>

      {/* Undo Snackbar */}
      {undoToast && (
        <div className="fixed bottom-24 inset-x-0 z-40 px-4 pointer-events-none">
          <div
            role="status"
            className="w-full max-w-md mx-auto pointer-events-auto rounded-2xl bg-[#1c1c1e] border border-neutral-700/80 px-4 py-2.5 shadow-2xl flex items-center justify-between gap-3"
          >
            <div className="min-w-0">
              <p className="text-xs font-semibold text-white">
                {messages.completedToast}
              </p>
              <p className="text-[11px] text-neutral-400 truncate">
                {undoToast.title}
              </p>
            </div>
            <button
              type="button"
              onClick={handleUndoComplete}
              className="min-h-[44px] px-3 rounded-xl text-xs font-semibold text-[#ff6b72] hover:bg-white/5 inline-flex items-center gap-1.5 shrink-0 cursor-pointer"
            >
              <ArrowUUpLeft aria-hidden="true" className="w-4 h-4" weight="bold" />
              <span>{messages.undoAction}</span>
            </button>
          </div>
        </div>
      )}

      {/* Pending Detail Placeholder Modal */}
      {detailModalTask && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
          onClick={() => setDetailModalTask(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="task-detail-placeholder-title"
            onClick={(event) => event.stopPropagation()}
            className="w-full max-w-md rounded-2xl bg-[#121214] border border-neutral-800 p-5 text-white shadow-2xl space-y-4"
          >
            <div>
              <h2
                id="task-detail-placeholder-title"
                className="text-lg font-bold text-white line-clamp-2"
              >
                {formatAcademicTitle(detailModalTask.title) || detailModalTask.title}
              </h2>
              <p className="text-sm text-neutral-300 mt-2 leading-relaxed">
                {messages.detailPlaceholder.description}
              </p>
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setDetailModalTask(null)}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-[#8B0000] hover:bg-[#A51C30] text-xs font-semibold text-white cursor-pointer"
              >
                {messages.detailPlaceholder.close}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
