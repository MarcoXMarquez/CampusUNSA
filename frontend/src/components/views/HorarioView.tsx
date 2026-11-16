"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { ArrowClockwise, BookOpen, Flask } from "@phosphor-icons/react";
import type { AcademicAssignment } from "@/components/sheets/TaskDetailSheet";
import type { AcademicCourse } from "@/hooks/useAcademicBoard";
import type {
  CourseCatalogItem,
  CourseScheduleBlock,
  CourseScheduleBlockInput,
} from "@/lib/api-client";
import {
  formatBlockLocation,
  getCourseColor,
  resolveNextClass,
} from "@/lib/schedule-calculator";
import { formatAcademicTitle } from "@/lib/text-format";
import { horarioMessages as messages, taskBoardMessages } from "@/lib/messages/task-board-messages";

const GROUP_OPTIONS = ["A", "B", "C", "D", "E", "F"] as const;
const DAY_OPTIONS = [1, 2, 3, 4, 5, 6, 7] as const;
const PULL_THRESHOLD_PX = 48;

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
  pavilion: string;
}

function toEditableBlocks(blocks: CourseScheduleBlock[] | undefined): EditableBlock[] {
  return (blocks ?? []).map((b, idx) => ({
    key: b.id || `block-${idx}`,
    component_type: b.component_type === "LABORATORIO" ? "LABORATORIO" : "TEORIA",
    day_of_week: b.day_of_week,
    start_time: b.start_time,
    end_time: b.end_time,
    room: b.room ?? "",
    pavilion: b.pavilion ?? "",
  }));
}

export function HorarioView({
  courses,
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

  const [verAulaOpen, setVerAulaOpen] = useState<boolean>(false);
  const [pullDistance, setPullDistance] = useState<number>(0);
  const pullStartYRef = useRef<number | null>(null);

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
        pavilion: "",
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
        pavilion: block.pavilion.trim() || null,
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

  const nextClassCourseTitle = nextClass
    ? formatAcademicTitle(nextClass.course.name) || nextClass.course.name
    : null;

  return (
    <div
      data-testid="horario-board"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      className="w-full min-h-dvh bg-black text-white safe-areas pb-28 overflow-x-hidden"
    >
      <div className="w-full max-w-md mx-auto px-5 pt-8">
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
              {syncing ? taskBoardMessages.updating : taskBoardMessages.pullToRefreshHint}
            </span>
          </div>
        )}

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

        {/* Prominent "Siguiente clase" Card matching Stitch reference */}
        <section
          data-purpose="next-class-card"
          aria-label={messages.nextLabel}
          className="rounded-3xl p-5 mb-7 border border-[#2d1417] bg-[#1d0f12]"
        >
          {nextClass ? (
            <>
              <p className="text-[#e05258] text-xs font-semibold tracking-wide mb-2">
                {nextClass.subLabel}
              </p>
              <div className="flex items-baseline space-x-2">
                <span className="text-5xl font-extrabold tracking-tight text-neutral-100 leading-none">
                  {nextClass.block.start_time}
                </span>
                <span className="text-lg font-medium text-neutral-400">
                  – {nextClass.block.end_time}
                </span>
              </div>
              <h2 className="text-xl font-bold text-neutral-100 leading-snug mt-3 mb-3 tracking-tight line-clamp-2">
                {nextClassCourseTitle}
              </h2>
              <div className="flex items-end justify-between gap-3">
                <div className="space-y-0.5 text-xs min-w-0">
                  <div className="flex items-center gap-1.5 text-neutral-200 font-semibold">
                    {nextClass.block.component_type === "LABORATORIO" ? (
                      <Flask aria-hidden="true" className="w-3.5 h-3.5 text-neutral-300 shrink-0" />
                    ) : (
                      <BookOpen aria-hidden="true" className="w-3.5 h-3.5 text-neutral-300 shrink-0" />
                    )}
                    <span className="truncate">
                      {nextClass.block.component_type === "LABORATORIO" ? "Laboratorio" : "Teoría"}
                    </span>
                  </div>
                  {nextClass.block.room && (
                    <p className="text-neutral-300 truncate">{nextClass.block.room}</p>
                  )}
                  {nextClass.block.pavilion && (
                    <p className="text-neutral-400 truncate">{nextClass.block.pavilion}</p>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setVerAulaOpen(true)}
                  className="min-h-[44px] bg-[#83121a] hover:bg-[#991b22] text-white text-xs font-semibold rounded-full px-5 py-2.5 shrink-0 transition-colors cursor-pointer"
                >
                  {messages.verAulaButton}
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="text-[#e05258] text-xs font-semibold tracking-wide mb-2">
                {messages.nextLabel}
              </p>
              <h2 className="text-xl font-bold text-neutral-100 leading-tight mt-1 mb-1">
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
                className="rounded-2xl bg-[#1c1c1e] p-4 space-y-2.5"
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
                className="space-y-5"
              >
                {linkedCourses.length > 0 && (
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-2xl font-bold tracking-tight text-white">
                      {messages.sectionTitle}
                    </h2>
                    <span className="text-sm font-medium text-neutral-500">
                      {messages.courseCountLabel(linkedCourses.length)}
                    </span>
                  </div>
                )}

                {linkedCourses.map((course) => {
                  const color = getCourseColor(course.course_code ?? course.id);
                  const displayCourseName =
                    formatAcademicTitle(course.name) || course.name;
                  const blocks = course.schedule_blocks ?? [];

                  return (
                    <article key={course.id} className="space-y-2">
                      <div className="flex items-center justify-between gap-2 px-1">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span
                            aria-hidden="true"
                            className="w-2.5 h-2.5 rounded-sm inline-block shrink-0"
                            style={{ backgroundColor: color }}
                          />
                          <h3 className="text-[15px] font-bold text-white tracking-tight leading-snug line-clamp-2">
                            {displayCourseName}
                          </h3>
                        </div>
                        <button
                          type="button"
                          onClick={() => onOpenNewTask(course)}
                          className="min-h-[44px] px-2 text-xs font-semibold text-[#f87171] hover:text-white transition-colors shrink-0 cursor-pointer"
                        >
                          {messages.addTaskButton}
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => openScheduleEditor(course)}
                        aria-label={messages.editScheduleAria(displayCourseName)}
                        className="w-full min-h-[44px] text-left bg-[#1c1c1e] hover:bg-[#232326] border border-white/5 rounded-2xl p-3 space-y-3 transition-colors cursor-pointer"
                      >
                        {blocks.length > 0 ? (
                          blocks.map((block) => {
                            const location = formatBlockLocation(block);
                            const compName =
                              block.component_type === "LABORATORIO"
                                ? "Laboratorio"
                                : "Teoría";
                            const subtitle = `${messages.dayFullNames[block.day_of_week] ?? "Lunes"} ${block.start_time}–${block.end_time}${location ? ` · ${location}` : ""}`;

                            return (
                              <div
                                key={block.id}
                                className="flex items-center gap-3 min-w-0"
                              >
                                <div className="w-9 h-9 rounded-xl bg-[#2c2c2e] flex items-center justify-center shrink-0 text-neutral-200">
                                  {block.component_type === "LABORATORIO" ? (
                                    <Flask aria-hidden="true" className="w-4 h-4" />
                                  ) : (
                                    <BookOpen aria-hidden="true" className="w-4 h-4" />
                                  )}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm font-semibold text-white truncate">
                                    {compName}
                                    {block.group_code ? ` · Grupo ${block.group_code}` : ""}
                                  </p>
                                  <p className="text-xs text-neutral-400 truncate">
                                    {subtitle}
                                  </p>
                                </div>
                              </div>
                            );
                          })
                        ) : (
                          <p className="text-xs text-neutral-400 py-1">
                            {messages.courseNoSessionsHint}
                          </p>
                        )}
                      </button>
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

      {/* Ver Aula Pending Placeholder Modal */}
      {verAulaOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
          onClick={() => setVerAulaOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="ver-aula-placeholder-title"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl bg-[#121214] border border-neutral-800 p-5 text-white shadow-2xl space-y-4"
          >
            <div>
              <h2
                id="ver-aula-placeholder-title"
                className="text-lg font-bold text-white"
              >
                {messages.verAulaTitle}
              </h2>
              <p className="text-sm text-neutral-300 mt-2 leading-relaxed">
                {messages.verAulaPlaceholder}
              </p>
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setVerAulaOpen(false)}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-[#8B0000] hover:bg-[#A51C30] text-xs font-semibold text-white cursor-pointer"
              >
                {messages.verAulaCloseButton}
              </button>
            </div>
          </div>
        </div>
      )}

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
                {formatAcademicTitle(editingCourse.name) || editingCourse.name}
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

                    <div className="space-y-2">
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
                      <input
                        type="text"
                        aria-label={messages.sessionPavilionLabel}
                        placeholder={messages.sessionPavilionPlaceholder}
                        value={block.pavilion}
                        onChange={(e) =>
                          handleUpdateDraftBlock(block.key, {
                            pavilion: e.target.value,
                          })
                        }
                        className="w-full min-h-[44px] rounded-lg bg-[#141416] border border-neutral-700 px-2.5 text-xs text-white"
                      />
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
                        <span className="font-mono">{item.code}</span> ·{" "}
                        {formatAcademicTitle(item.official_name) || item.official_name} (
                        {item.curriculum_year})
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
