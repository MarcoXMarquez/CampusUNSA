"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowClockwise } from "@phosphor-icons/react";
import { TaskDetailSheet, type AcademicAssignment } from "@/components/sheets/TaskDetailSheet";
import type { AcademicCourse } from "@/hooks/useAcademicBoard";
import { groupTasksBySchedule } from "@/lib/task-urgency";
import { formatAcademicTitle } from "@/lib/text-format";
import { taskBoardMessages as messages } from "@/lib/messages/task-board-messages";
import {
  ComponentFilter,
  ResolvedTaskMeta,
  resolveTaskMetadata,
  UndoToastState,
} from "./hoy/hoy-helpers";
import { TaskFilterBar } from "./hoy/TaskFilterBar";
import { TaskGroupsSection } from "./hoy/TaskGroupsSection";
import { TaskUndoToast } from "./hoy/TaskUndoToast";

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

const PULL_THRESHOLD_PX = 48;
const UNDO_TIMEOUT_MS = 5000;

/**
 * Primary tasks view ("Hoy") grouping pending deliverables by urgency and academic source.
 */
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
  completionPending = false,
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

  const detailAssignment = detailModalTask
    ? assignments.find(({ id }) => id === detailModalTask.id) ?? detailModalTask
    : null;

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

  return (
    <div
      data-testid="tareas-board"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      className="w-full min-h-dvh bg-canvas text-ink-primary safe-areas pb-dock-content overflow-x-hidden"
    >
      <div className="w-full max-w-md mx-auto px-5 pt-6">
        {(pullDistance > 12 || syncing) && (
          <div
            role="status"
            className="mb-3 flex items-center justify-center gap-2 text-ios-caption-1 text-ink-secondary"
          >
            <ArrowClockwise
              aria-hidden="true"
              className={`w-3.5 h-3.5 ${syncing ? "animate-spin text-brand-action" : ""}`}
            />
            <span>{syncing ? messages.updating : messages.pullToRefreshHint}</span>
          </div>
        )}

        <TaskFilterBar
          componentFilter={componentFilter}
          selectedCourseId={selectedCourseId}
          courseOptions={courseOptions}
          searchOpen={searchOpen}
          searchQuery={searchQuery}
          onComponentFilterChange={setComponentFilter}
          onCourseChange={setSelectedCourseId}
          onToggleSearch={() => {
            setSearchOpen((prev) => {
              const next = !prev;
              if (!next) setSearchQuery("");
              return next;
            });
          }}
          onSearchQueryChange={setSearchQuery}
        />

        {/* Mandatory Functional States */}
        <div className="space-y-2.5 mt-2">
          {!isOnline && (
            <p
              role="status"
              className="rounded-2xl bg-surface-card border border-subtle px-4 py-3 text-ios-caption-1 text-ink-secondary"
            >
              {messages.offline}
            </p>
          )}
          {offlineCompletionNotice && (
            <p
              role="status"
              className="rounded-2xl bg-surface-elevated border border-subtle px-4 py-2.5 text-ios-caption-1 text-ink-primary"
            >
              {messages.offlineCompletion}
            </p>
          )}
          {completionError && (
            <p
              role="alert"
              className="rounded-2xl bg-surface-urgent border border-urgent-edge px-4 py-3 text-ios-caption-1 text-status-urgent"
            >
              {messages.completionError}
            </p>
          )}
          {moodleSessionExpired && (
            <button
              type="button"
              onClick={onReconnectMoodle}
              className="min-h-[44px] w-full rounded-2xl bg-surface-urgent border border-urgent-edge px-4 py-3 text-left text-ios-caption-1 text-status-urgent cursor-pointer"
            >
              {messages.expired}
            </button>
          )}
          {syncError && (
            <div
              role="alert"
              className="rounded-2xl bg-surface-card border border-subtle p-3.5 text-ios-caption-1 text-ink-primary flex items-center justify-between gap-3"
            >
              <p className="text-ink-secondary">{messages.syncError}</p>
              <button
                type="button"
                onClick={onRefresh}
                disabled={syncing}
                className="min-h-[44px] px-3 rounded-xl bg-brand-cta hover:bg-brand-cta-hover text-ios-caption-1 font-semibold text-white shrink-0 cursor-pointer"
              >
                {messages.retry}
              </button>
            </div>
          )}
        </div>

        <TaskGroupsSection
          loading={loading}
          hasActiveTasks={hasActiveTasks}
          hasAnyPendingAssignments={hasAnyPendingAssignments}
          groups={groups}
          metadataById={metadataById}
          now={now}
          onToggleComplete={handleCompleteInline}
          onSelectTask={setDetailModalTask}
        />
      </div>

      <TaskUndoToast toast={undoToast} onUndo={handleUndoComplete} />

      {detailAssignment && (
        <TaskDetailSheet
          assignment={{
            ...detailAssignment,
            courseName: metadataById.get(detailAssignment.id)?.courseLabel,
          }}
          opened
          onClose={() => setDetailModalTask(null)}
          onCompletionChange={onCompletionChange && ((id, completed) => {
            if (completed) {
              handleCompleteInline(detailAssignment);
              setDetailModalTask(null);
            } else {
              onCompletionChange(id, false);
            }
          })}
          completionPending={completionPending}
          completionError={completionError ? messages.completionError : null}
          isOnline={isOnline}
        />
      )}
    </div>
  );
}
