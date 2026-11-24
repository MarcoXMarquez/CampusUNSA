"use client";

import React, { useEffect, useId, useRef } from "react";
import { Sheet } from "konsta/react";
import { ArrowSquareOut, Clock, BookOpen } from "@phosphor-icons/react";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { getTaskDetailLinks } from "@/lib/task-detail-links";
import { formatAcademicTitle } from "@/lib/text-format";
import { taskBoardMessages as messages } from "@/lib/messages/task-board-messages";

export interface AcademicAssignment {
  id: string;
  course_id?: string | null;
  source_id?: string | null;
  course_code?: string | null;
  classroom_assignment_id: string;
  reported_course?: string | null;
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
  if (!opened || !assignment) return <></>;

  const isDutic = assignment.origin === "dutic" || assignment.origin === "moodle";
  const isWhatsApp = assignment.origin === "whatsapp";
  const completionNote = isWhatsApp ? messages.localCompletionNote : messages.completionNote;
  const providers: Partial<Record<string, string>> = {
    manual: messages.detail.personal,
    whatsapp: messages.detail.whatsapp,
    classroom: messages.detail.classroom,
  };
  const sourceLabel = isDutic
    ? messages.detail.moodle
    : providers[assignment.origin];

  const { text, assignmentUrl, resources } = getTaskDetailLinks(
    assignment.origin, assignment.alternate_link, assignment.description
  );

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
      className="!z-50 !top-auto bottom-0 right-0 !translate-y-0 mx-auto w-full max-w-md !flex min-w-0 flex-col !overflow-hidden !bg-surface-sheet rounded-t-2xl max-h-[calc(100dvh_-_max(env(safe-area-inset-top),0.75rem))] shadow-layer-overlay"
    >
      {/* Top Grabber */}
      <div className="w-10 h-1 bg-control rounded-full mx-auto my-2 shrink-0" />

      {/* Header */}
      <div className="grid grid-cols-[1fr_minmax(0,auto)_1fr] shrink-0 items-center gap-2 px-3 pb-1 border-b border-subtle">
        <button
          type="button"
          ref={closeButton}
          onClick={onClose}
          className="min-h-[44px] justify-self-start px-2 text-brand-action text-ios-headline font-normal"
        >
          {messages.detail.close}
        </button>
        <span className="text-ios-headline font-semibold text-ink-primary text-center leading-tight">
          {messages.detail.title}
        </span>
        <span aria-hidden="true" />
      </div>

      <div className="min-h-0 min-w-0 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6 [overflow-wrap:anywhere]">
        {/* Source Badge */}
        <div className="flex items-center gap-2 mb-3">
          <span className="text-ios-footnote font-medium text-ink-secondary">
            {sourceLabel}
          </span>
        </div>

        {/* Title */}
        <h2 id={titleId} className="text-ios-title-2 font-bold text-ink-primary mb-2 leading-snug">
          {formatAcademicTitle(assignment.title) || assignment.title}
        </h2>

        {/* Course */}
        {assignment.courseName && (
          <div className="flex items-center gap-2 text-ios-subhead text-ink-secondary mb-4">
            <BookOpen size={18} weight="regular" />
            <span className="min-w-0">{assignment.courseName}</span>
          </div>
        )}

        {/* Deadline */}
        <div className="flex items-center gap-2 text-ios-subhead font-medium text-ink-primary mb-6 p-3 rounded-xl bg-surface-inset/70">
          <Clock size={18} weight="regular" className="shrink-0 text-brand-primary-tint" />
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
              {isOnline ? completionNote : messages.offlineCompletion}
            </p>
          </div>
        )}

        {text && (
          <section className="space-y-1.5">
            <h3 className="text-ios-footnote font-semibold uppercase tracking-wider text-ink-muted">
              {messages.detail.instructions}
            </h3>
            <p className="whitespace-pre-wrap text-ios-subhead leading-relaxed text-ink-primary">
              {text}
            </p>
          </section>
        )}

        {resources.length > 0 && (
          <section className="mt-4 space-y-2">
            <h3 className="text-ios-footnote font-semibold text-ink-secondary">{messages.detail.resources}</h3>
            <ul className="space-y-2">
              {resources.map(({ url, reference }) => (
                <li key={url.href}>
                  <a
                    href={url.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="interactive-surface flex min-h-[44px] items-center justify-between gap-2 rounded-xl border border-control px-3 py-2 text-ios-subhead font-semibold text-brand-action"
                  >
                    <span className="min-w-0">
                      {reference ? `[${reference}] ` : ""}{messages.detail.openResource(url.hostname)}
                    </span>
                    <ArrowSquareOut aria-hidden="true" size={18} className="shrink-0" />
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <footer className="shrink-0 border-t border-subtle px-4 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6">
        {assignmentUrl ? (
          <a
            href={assignmentUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="interactive-cta flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-brand-cta px-3 py-2 text-center text-ios-headline font-semibold text-white"
          >
            <span>{isDutic ? messages.detail.openMoodle : messages.detail.openClassroom}</span>
            <ArrowSquareOut aria-hidden="true" size={18} className="shrink-0" />
          </a>
        ) : (
          <p className="py-1 text-center text-ios-footnote text-ink-muted">{messages.detail.noLink}</p>
        )}
      </footer>
    </Sheet>
  );
}
