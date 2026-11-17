"use client";

import React, { useEffect, useId, useMemo, useState } from "react";
import { CaretRight } from "@phosphor-icons/react";
import type { AcademicCourse } from "@/hooks/useAcademicBoard";
import type { CreateManualAssignmentPayload } from "@/lib/api-client";
import { newTaskMessages } from "@/lib/messages/task-board-messages";
import {
  formatCourseDisplayName,
  formatLimaDueDisplay,
  getCourseColor,
  getLimaQuickDueDate,
  resolveNextCourseSessionIso,
} from "@/lib/schedule-calculator";
import { CoursePickerSheet } from "./CoursePickerSheet";
import { DueDatePickerSheet } from "./DueDatePickerSheet";

interface NewTaskSheetProps {
  opened: boolean;
  courses: AcademicCourse[];
  initialCourse?: AcademicCourse | null;
  allSourcesSynced: boolean;
  isOnline: boolean;
  submitting?: boolean;
  onClose: () => void;
  onSubmit: (payload: CreateManualAssignmentPayload) => Promise<unknown>;
}

type ComponentChoice = "TEORIA" | "LABORATORIO";

export function NewTaskSheet({
  opened,
  courses,
  initialCourse = null,
  allSourcesSynced,
  isOnline,
  submitting = false,
  onClose,
  onSubmit,
}: NewTaskSheetProps): React.ReactElement | null {
  const titleId = useId();
  const [title, setTitle] = useState("");
  const [selectedCourseCode, setSelectedCourseCode] = useState<string>("");
  const [componentType, setComponentType] = useState<ComponentChoice>("TEORIA");
  const [dueDateIso, setDueDateIso] = useState<string | null>(() =>
    getLimaQuickDueDate("today")
  );
  const [isHighPriority, setIsHighPriority] = useState(false);
  const [notes, setNotes] = useState("");
  const [localSubmitting, setLocalSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [coursePickerOpened, setCoursePickerOpened] = useState(false);
  const [dueDatePickerOpened, setDueDatePickerOpened] = useState(false);

  useEffect(() => {
    if (!opened) {
      setCoursePickerOpened(false);
      setDueDatePickerOpened(false);
      return;
    }
    setTitle("");
    setSelectedCourseCode(initialCourse?.course_code ?? "");
    setComponentType("TEORIA");
    setDueDateIso(getLimaQuickDueDate("today"));
    setIsHighPriority(false);
    setNotes("");
    setSubmitError(null);
    setCoursePickerOpened(false);
    setDueDatePickerOpened(false);
  }, [opened, initialCourse]);

  useEffect(() => {
    if (!opened) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.key === "Escape" &&
        !submitting &&
        !localSubmitting &&
        !coursePickerOpened &&
        !dueDatePickerOpened
      ) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [opened, submitting, localSubmitting, coursePickerOpened, dueDatePickerOpened, onClose]);

  const selectedCourse = useMemo(
    () =>
      selectedCourseCode
        ? courses.find((course) => course.course_code === selectedCourseCode) ?? null
        : null,
    [courses, selectedCourseCode]
  );

  const selectedCourseLabel = useMemo(
    () => (selectedCourse ? formatCourseDisplayName(selectedCourse) : newTaskMessages.noCourseLabel),
    [selectedCourse]
  );

  const todayQuickIso = useMemo(
    () => (opened ? getLimaQuickDueDate("today") : ""),
    [opened]
  );
  const tomorrowQuickIso = useMemo(
    () => (opened ? getLimaQuickDueDate("tomorrow") : ""),
    [opened]
  );
  const nextClassIso = useMemo(
    () => (opened ? resolveNextCourseSessionIso(selectedCourse, componentType) : null),
    [opened, selectedCourse, componentType]
  );

  if (!opened) {
    return null;
  }

  const isBusy = submitting || localSubmitting;
  const hasNoCourses = courses.length === 0;
  const canSubmit = Boolean(title.trim()) && isOnline && !isBusy;
  const dotColor = getCourseColor(selectedCourseCode || "personal");
  const dueDateDisplay = formatLimaDueDisplay(dueDateIso, newTaskMessages.noDueDateLabel);

  const handleFormSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit) {
      return;
    }

    const trimmedNotes = notes.trim();
    const payload: CreateManualAssignmentPayload = {
      title: title.trim(),
      course_code: selectedCourseCode || null,
      component_type: componentType,
      due_date: dueDateIso,
      priority: isHighPriority ? "ALTA" : null,
      notes: trimmedNotes ? trimmedNotes : null,
    };

    setLocalSubmitting(true);
    setSubmitError(null);
    try {
      await onSubmit(payload);
      onClose();
    } catch (error) {
      setSubmitError(
        error instanceof Error && error.message.trim()
          ? error.message
          : newTaskMessages.submitErrorFallback
      );
    } finally {
      setLocalSubmitting(false);
    }
  };

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-[2px] sm:items-center sm:p-4"
        onClick={() => {
          if (!isBusy) {
            onClose();
          }
        }}
      >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-md max-h-[90dvh] overflow-y-auto rounded-t-[28px] sm:rounded-[28px] bg-surface-sheet text-ink-primary shadow-layer-overlay border border-subtle pb-[calc(env(safe-area-inset-bottom)+1.25rem)]"
      >
        <div
          aria-hidden="true"
          className="w-10 h-1.5 bg-control rounded-full mx-auto mt-3 mb-1"
        />

        <form onSubmit={handleFormSubmit} className="px-4 pt-1 space-y-3">
          <div className="flex items-center justify-between">
            <button
              type="button"
              disabled={isBusy}
              onClick={onClose}
              className="min-h-[44px] px-2 text-ios-subhead font-normal text-brand-action disabled:opacity-40"
            >
              {newTaskMessages.cancelAction}
            </button>
            <h2 id={titleId} className="text-ios-headline font-semibold text-ink-primary">
              {newTaskMessages.sheetTitle}
            </h2>
            <button
              type="submit"
              disabled={!canSubmit}
              className="min-h-[44px] px-2 text-ios-subhead font-semibold text-brand-action disabled:opacity-40"
            >
              {isBusy ? newTaskMessages.submittingAction : newTaskMessages.submitAction}
            </button>
          </div>

          {!isOnline && (
            <p
              role="status"
              className="rounded-xl bg-amber-500/15 border border-amber-500/30 px-3 py-2 text-ios-footnote text-amber-900 dark:text-amber-200"
            >
              {newTaskMessages.offlineNotice}
            </p>
          )}

          {(hasNoCourses || !allSourcesSynced) && (
            <p
              role="alert"
              className="rounded-xl bg-surface-card border border-subtle px-3 py-2 text-ios-footnote text-ink-secondary"
            >
              {hasNoCourses ? newTaskMessages.noCoursesNotice : newTaskMessages.syncRequiredNotice}
            </p>
          )}

          {submitError && (
            <p
              role="alert"
              className="rounded-xl bg-surface-urgent border border-urgent-edge px-3 py-2 text-ios-footnote text-brand-tint"
            >
              {submitError}
            </p>
          )}

          <input
            type="text"
            aria-label={newTaskMessages.titleLabel}
            placeholder={newTaskMessages.titlePlaceholder}
            value={title}
            maxLength={300}
            onChange={(event) => setTitle(event.target.value)}
            className="w-full min-h-[48px] bg-surface-card rounded-xl px-4 py-3.5 text-ios-subhead text-ink-primary placeholder:text-ink-muted outline-none focus:ring-1 focus:ring-brand-action/60"
          />

          <div className="bg-surface-card rounded-2xl p-3.5 space-y-3 border border-subtle">
            <button
              type="button"
              aria-label={newTaskMessages.courseSelectAria}
              onClick={() => setCoursePickerOpened(true)}
              className="w-full flex items-center justify-between gap-3 min-h-[44px] text-left"
            >
              <span className="text-ios-subhead font-medium text-ink-primary shrink-0">
                {newTaskMessages.courseLabel}
              </span>
              <span className="flex items-center gap-2 min-w-0">
                <span
                  aria-hidden="true"
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: dotColor }}
                />
                <span
                  data-testid="selected-course-display"
                  className="max-w-[210px] truncate text-right text-ios-subhead text-ink-secondary"
                >
                  {selectedCourseLabel}
                </span>
                <CaretRight
                  size={16}
                  weight="bold"
                  aria-hidden="true"
                  className="text-ink-muted shrink-0"
                />
              </span>
            </button>

            <div className="h-px bg-subtle" />

            <div className="flex items-center justify-between gap-3 min-h-[44px]">
              <span className="text-ios-subhead font-medium text-ink-primary">
                {newTaskMessages.typeLabel}
              </span>
              <div className="bg-surface-inset p-1 rounded-xl flex items-center gap-1">
                <button
                  type="button"
                  aria-pressed={componentType === "TEORIA"}
                  onClick={() => setComponentType("TEORIA")}
                  className={`min-h-[44px] px-3.5 rounded-lg text-ios-footnote font-medium transition-colors ${
                    componentType === "TEORIA"
                      ? "bg-surface-elevated text-ink-primary shadow-layer-segment"
                      : "text-ink-secondary"
                  }`}
                >
                  {newTaskMessages.typeTheory}
                </button>
                <button
                  type="button"
                  aria-pressed={componentType === "LABORATORIO"}
                  onClick={() => setComponentType("LABORATORIO")}
                  className={`min-h-[44px] px-3.5 rounded-lg text-ios-footnote font-medium transition-colors ${
                    componentType === "LABORATORIO"
                      ? "bg-surface-elevated text-ink-primary shadow-layer-segment"
                      : "text-ink-secondary"
                  }`}
                >
                  {newTaskMessages.typeLab}
                </button>
              </div>
            </div>
          </div>

          <div className="bg-surface-card rounded-2xl p-3.5 space-y-3 border border-subtle">
            <button
              type="button"
              aria-label={newTaskMessages.dueDateInputAria}
              onClick={() => setDueDatePickerOpened(true)}
              className="w-full flex items-center justify-between gap-2 min-h-[44px] text-left"
            >
              <span className="text-ios-subhead font-medium text-ink-primary shrink-0">
                {newTaskMessages.dueLabel}
              </span>
              <span className="flex items-center gap-1.5">
                <span
                  data-testid="due-date-display"
                  className="text-ios-subhead text-ink-secondary"
                >
                  {dueDateDisplay}
                </span>
                <CaretRight
                  size={16}
                  weight="bold"
                  aria-hidden="true"
                  className="text-ink-muted shrink-0"
                />
              </span>
            </button>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setDueDateIso(getLimaQuickDueDate("today"))}
                className={`min-h-[44px] rounded-full text-ios-footnote px-3.5 py-1.5 font-medium transition-colors ${
                  dueDateIso === todayQuickIso
                    ? "bg-brand-action/20 text-ink-primary border border-brand-action/50"
                    : "bg-surface-elevated text-ink-secondary border border-subtle"
                }`}
              >
                {newTaskMessages.quickToday}
              </button>
              <button
                type="button"
                onClick={() => setDueDateIso(getLimaQuickDueDate("tomorrow"))}
                className={`min-h-[44px] rounded-full text-ios-footnote px-3.5 py-1.5 font-medium transition-colors ${
                  dueDateIso === tomorrowQuickIso
                    ? "bg-brand-action/20 text-ink-primary border border-brand-action/50"
                    : "bg-surface-elevated text-ink-secondary border border-subtle"
                }`}
              >
                {newTaskMessages.quickTomorrow}
              </button>
              <button
                type="button"
                disabled={!nextClassIso}
                onClick={() => {
                  if (nextClassIso) {
                    setDueDateIso(nextClassIso);
                  }
                }}
                className={`min-h-[44px] rounded-full text-ios-footnote px-3.5 py-1.5 font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                  nextClassIso && dueDateIso === nextClassIso
                    ? "bg-brand-action/20 text-ink-primary border border-brand-action/50"
                    : "bg-surface-elevated text-ink-secondary border border-subtle"
                }`}
              >
                {newTaskMessages.quickNextClass}
              </button>
            </div>

            <div className="h-px bg-subtle" />

            <div className="flex items-center justify-between min-h-[44px]">
              <span className="text-ios-subhead font-medium text-ink-primary">
                {newTaskMessages.highPriorityLabel}
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={isHighPriority}
                aria-label={newTaskMessages.highPriorityLabel}
                onClick={() => setIsHighPriority((prev) => !prev)}
                className={`relative inline-flex h-8 w-[52px] shrink-0 items-center rounded-full transition-colors p-0.5 ${
                  isHighPriority ? "bg-brand-action" : "bg-control"
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`inline-block h-7 w-7 rounded-full bg-white shadow-layer-segment transition-transform ${
                    isHighPriority ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>
          </div>

          <textarea
            aria-label={newTaskMessages.notesLabel}
            placeholder={newTaskMessages.notesPlaceholder}
            value={notes}
            maxLength={2000}
            onChange={(event) => setNotes(event.target.value)}
            className="w-full bg-surface-card border border-subtle rounded-2xl p-3.5 min-h-[95px] text-ios-subhead text-ink-primary placeholder:text-ink-muted outline-none resize-none focus:ring-1 focus:ring-brand-action/60"
          />
        </form>
      </div>
    </div>

      <CoursePickerSheet
        opened={coursePickerOpened}
        courses={courses}
        selectedCourseCode={selectedCourseCode}
        onSelect={(code) => setSelectedCourseCode(code)}
        onClose={() => setCoursePickerOpened(false)}
      />

      <DueDatePickerSheet
        opened={dueDatePickerOpened}
        value={dueDateIso}
        selectedCourse={selectedCourse}
        courses={courses}
        componentType={componentType}
        onConfirm={(nextIso) => setDueDateIso(nextIso)}
        onClose={() => setDueDatePickerOpened(false)}
      />
    </>
  );
}
