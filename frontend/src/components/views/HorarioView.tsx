"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { ArrowClockwise } from "@phosphor-icons/react";
import type { AcademicAssignment } from "@/components/sheets/TaskDetailSheet";
import type { AcademicCourse } from "@/hooks/useAcademicBoard";
import type {
  CourseCatalogItem,
  CourseScheduleBlock,
  CourseScheduleBlockInput,
} from "@/lib/api-client";
import { resolveNextClass } from "@/lib/schedule-calculator";
import { formatAcademicTitle } from "@/lib/text-format";
import { horarioMessages as messages, taskBoardMessages } from "@/lib/messages/task-board-messages";
import { NextClassHeroCard } from "./horario/NextClassHeroCard";
import { CourseListSection } from "./horario/CourseListSection";
import { CourseScheduleEditModal } from "./horario/CourseScheduleEditModal";
import { LinkCourseSourceModal } from "./horario/LinkCourseSourceModal";

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

/**
 * Primary schedule view ("Horario") showing the upcoming class hero card, enrolled courses, and editing modals.
 */
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
  const [editingCourse, setEditingCourse] = useState<AcademicCourse | null>(null);
  const [linkingCourse, setLinkingCourse] = useState<AcademicCourse | null>(null);

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
    setPullDistance(delta > 0 ? Math.min(88, Math.round(delta * 0.5)) : 0);
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
      className="w-full min-h-dvh bg-canvas text-ink-primary safe-areas pb-dock-content overflow-x-hidden"
    >
      <div className="w-full max-w-md mx-auto px-5 pt-8">
        {(pullDistance > 12 || syncing) && (
          <div
            role="status"
            className="mb-3 flex items-center justify-center gap-2 text-ios-caption-1 text-ink-secondary"
          >
            <ArrowClockwise
              aria-hidden="true"
              className={`w-3.5 h-3.5 ${syncing ? "animate-spin text-brand-action" : ""}`}
            />
            <span>
              {syncing ? taskBoardMessages.updating : taskBoardMessages.pullToRefreshHint}
            </span>
          </div>
        )}

        <header className="mb-5">
          <h1 className="text-ios-large-title font-extrabold tracking-tight text-ink-primary">
            {messages.title}
          </h1>
        </header>

        {/* Mandatory State Notices */}
        {!isOnline && (
          <p
            role="status"
            className="mb-4 rounded-2xl bg-surface-card border border-subtle px-4 py-3 text-ios-subhead text-ink-secondary"
          >
            {taskBoardMessages.offline}
          </p>
        )}
        {moodleSessionExpired && (
          <button
            type="button"
            onClick={onReconnectMoodle}
            className="mb-4 min-h-[44px] w-full rounded-2xl bg-surface-urgent border border-urgent-edge px-4 py-3 text-left text-ios-subhead text-status-urgent cursor-pointer"
          >
            {taskBoardMessages.expired}
          </button>
        )}
        {syncError && (
          <div
            role="alert"
            className="mb-4 rounded-2xl bg-surface-card border border-subtle p-4 text-ios-subhead text-ink-primary flex items-center justify-between gap-3"
          >
            <p className="text-ink-secondary">{taskBoardMessages.syncError}</p>
            <button
              type="button"
              onClick={onRefresh}
              disabled={syncing}
              className="min-h-[44px] px-3 rounded-xl bg-brand-cta hover:bg-brand-cta-hover text-ios-caption-1 font-semibold text-white shrink-0 cursor-pointer"
            >
              {taskBoardMessages.retry}
            </button>
          </div>
        )}

        <NextClassHeroCard
          nextClass={nextClass}
          courseTitle={nextClassCourseTitle}
          verAulaOpen={verAulaOpen}
          onOpenVerAula={() => setVerAulaOpen(true)}
          onCloseVerAula={() => setVerAulaOpen(false)}
        />

        {loading && courses.length === 0 ? (
          <div
            role="status"
            aria-label={messages.loading}
            className="animate-pulse space-y-4"
          >
            {[0, 1, 2].map((index) => (
              <div
                key={index}
                className="rounded-2xl bg-surface-card border border-subtle p-4 space-y-2.5"
              >
                <div className="h-5 w-3/4 rounded bg-surface-elevated" />
                <div className="h-4 w-1/3 rounded bg-surface-inset" />
                <div className="h-4 w-2/3 rounded bg-surface-inset" />
              </div>
            ))}
          </div>
        ) : (
          <CourseListSection
            linkedCourses={linkedCourses}
            pendingCourses={pendingCourses}
            onOpenNewTask={onOpenNewTask}
            onEditSchedule={setEditingCourse}
            onOpenPendingLinker={setLinkingCourse}
          />
        )}
      </div>

      {editingCourse && (
        <CourseScheduleEditModal
          key={editingCourse.id}
          course={editingCourse}
          isOnline={isOnline}
          onClose={() => setEditingCourse(null)}
          onSaveSchedule={onSaveSchedule}
          onLoadGroupSchedule={onLoadGroupSchedule}
        />
      )}

      {linkingCourse && (
        <LinkCourseSourceModal
          key={linkingCourse.id}
          course={linkingCourse}
          catalogCourses={catalogCourses}
          isOnline={isOnline}
          onClose={() => setLinkingCourse(null)}
          onLoadCatalog={onLoadCatalog}
          onLinkPendingSource={onLinkPendingSource}
        />
      )}
    </div>
  );
}
