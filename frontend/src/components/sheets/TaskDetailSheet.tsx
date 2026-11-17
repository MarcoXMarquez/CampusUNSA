"use client";

import React, { useEffect, useId, useRef } from "react";
import { Sheet } from "konsta/react";
import { ArrowSquareOut, Clock, BookOpen } from "@phosphor-icons/react";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { formatAcademicTitle } from "@/lib/text-format";
import { taskBoardMessages as messages } from "@/lib/messages/task-board-messages";

export interface AcademicAssignment {
  id: string;
  course_id?: string | null;
  source_id?: string | null;
  course_code?: string | null;
  classroom_assignment_id: string;
  title: string;
  description?: string | null;
  due_date?: string | null;
  max_points?: number | null;
  state: string;
  is_completed?: boolean;
  priority?: string | null;
  component_type?: string | null;
  group_code?: string | null;
  alternate_link?: string | null;
  origin: string;
  created_at: string;
  courseName?: string;
}

interface TaskDetailSheetProps {
  assignment: AcademicAssignment | null;
  opened: boolean;
  onClose: () => void;
  onCompletionChange?: (id: string, completed: boolean) => void;
  completionPending?: boolean;
  completionError?: string | null;
  isOnline?: boolean;
}

export function TaskDetailSheet({
  assignment,
  opened,
  onClose,
  onCompletionChange,
  completionPending = false,
  completionError = null,
  isOnline = true,
}: TaskDetailSheetProps): React.JSX.Element {
  const titleId = useId();
  const closeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!opened || !assignment?.id) return;
    const previousFocus = document.activeElement;
    closeButton.current?.focus();
    return () => {
      if (previousFocus instanceof HTMLElement) previousFocus.focus();
    };
  }, [opened, assignment?.id]);
  if (!opened || !assignment) return <Sheet opened={false} />;

  const isDutic = assignment.origin === "dutic" || assignment.origin === "moodle";
  const sourceLabel = isDutic
    ? messages.detail.moodle
    : assignment.origin === "manual" ? messages.detail.personal : messages.detail.classroom;

  let formattedDate: string = messages.noDeadline;
  if (assignment.due_date) {
    try {
      const d = parseISO(assignment.due_date);
      formattedDate = format(d, "EEEE d 'de' MMMM, HH:mm", { locale: es });
    } catch {
      formattedDate = assignment.due_date;
    }
  }



  return (
    <Sheet
      opened={opened}
      onBackdropClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onClose();
        }
        if (event.key !== "Tab") return;
        const controls = event.currentTarget.querySelectorAll<HTMLElement>("button:not([disabled]), a[href]");
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }}
      className="!z-50 !bg-surface-sheet rounded-t-2xl max-h-[90dvh] overflow-y-auto pb-safe shadow-layer-overlay"
    >
      {/* Top Grabber */}
      <div className="w-10 h-1 bg-control rounded-full mx-auto my-3" />

      {/* Header */}
      <div className="flex items-center justify-between px-4 pb-3 border-b border-subtle">
        <button
          type="button"
          ref={closeButton}
          onClick={onClose}
          className="min-h-[44px] px-2 text-brand-primary-tint text-ios-headline font-normal"
        >
          {messages.detail.close}
        </button>
        <span className="text-ios-headline font-semibold text-ink-primary truncate max-w-[200px]">
          {messages.detail.title}
        </span>
        <div className="w-12" />
      </div>

      <div className="p-6">
        {/* Source Badge */}
        <div className="flex items-center gap-2 mb-3">
          <span className="text-ios-footnote font-medium text-ink-secondary">
            {sourceLabel}
          </span>
        </div>

        {/* Title */}
        <h2 id={titleId} className="text-ios-title-2 font-bold text-ink-primary mb-2 leading-snug break-words line-clamp-2">
          {formatAcademicTitle(assignment.title) || assignment.title}
        </h2>

        {/* Course */}
        {assignment.courseName && (
          <div className="flex items-center gap-2 text-ios-subhead text-ink-secondary mb-4">
            <BookOpen size={18} weight="regular" />
            <span className="truncate">{assignment.courseName}</span>
          </div>
        )}

        {/* Deadline */}
        <div className="flex items-center gap-2 text-ios-subhead font-medium text-ink-primary mb-6 p-3 rounded-xl bg-surface-inset/70">
          <Clock size={18} weight="regular" className="text-brand-primary-tint" />
          <span className="capitalize">{formattedDate}</span>
        </div>

        {onCompletionChange && (
          <div className="mb-6">
            <p className="mb-3 text-ios-subhead text-ink-secondary" aria-live="polite">
              {assignment.is_completed ? messages.completed : messages.pending}
            </p>
            <button
              type="button"
              className="interactive-surface min-h-[44px] w-full rounded-xl border border-control px-4 text-ios-subhead font-semibold text-brand-action disabled:text-ink-disabled"
              disabled={completionPending || !isOnline}
              onClick={() => onCompletionChange(assignment.id, !assignment.is_completed)}
            >
              {assignment.is_completed ? messages.reopen : messages.complete}
            </button>
            {completionPending && <p role="status" className="mt-2 text-ios-footnote text-ink-secondary">{messages.saving}</p>}
            {completionError && <p role="alert" className="mt-2 text-ios-subhead text-ink-primary">{completionError}</p>}
            <p className="mt-3 text-ios-footnote text-ink-secondary">
              {isOnline ? messages.completionNote : messages.offlineCompletion}
            </p>
          </div>
        )}

        {/* Description */}
        {assignment.description && (
          <div className="mb-6">
            <h3 className="text-ios-footnote font-semibold uppercase tracking-wider text-ink-muted mb-1.5">
              {messages.detail.instructions}
            </h3>
            <p className="text-ios-subhead text-ink-primary/85 leading-relaxed max-h-48 overflow-y-auto whitespace-pre-wrap">
              {assignment.description}
            </p>
          </div>
        )}

        {/* Primary Action Button */}
        <div className="pt-2">
          {assignment.alternate_link ? (
            <a
              href={assignment.alternate_link}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full flex items-center justify-center gap-2 py-3.5 px-4 rounded-xl bg-brand-cta interactive-cta text-white font-semibold text-ios-headline active:opacity-80 transition-opacity"
            >
              <span>{isDutic ? messages.detail.openMoodle : messages.detail.openClassroom}</span>
              <ArrowSquareOut size={18} weight="regular" />
            </a>
          ) : (
            <p className="text-center text-ios-footnote text-ink-muted">
              {messages.detail.noLink}
            </p>
          )}
        </div>
      </div>
    </Sheet>
  );
}
