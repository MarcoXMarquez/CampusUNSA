"use client";

import React from "react";
import { Sheet, Button } from "konsta/react";
import { ArrowSquareOut, Clock, BookOpen } from "@phosphor-icons/react";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { taskBoardMessages as messages } from "../lib/task-board-messages";

export interface AcademicAssignment {
  id: string;
  course_id: string;
  classroom_assignment_id: string;
  title: string;
  description?: string | null;
  due_date?: string | null;
  max_points?: number | null;
  state: string;
  is_completed?: boolean;
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
  if (!assignment) {
    return <Sheet opened={false} />;
  }

  const isDutic = assignment.origin === "dutic" || assignment.origin === "moodle";
  const sourceLabel = isDutic ? "Moodle (DUTIC)" : "Google Classroom";

  let formattedDate = "Sin fecha límite asignada";
  if (assignment.due_date) {
    try {
      const d = parseISO(assignment.due_date);
      formattedDate = format(d, "EEEE d 'de' MMMM, HH:mm", { locale: es });
    } catch {
      formattedDate = assignment.due_date;
    }
  }

  const externalUrl = assignment.alternate_link || "#";

  return (
    <Sheet
      opened={opened}
      onBackdropClick={onClose}
      className="rounded-t-2xl pb-safe"
    >
      {/* Top Grabber */}
      <div className="w-10 h-1 bg-slate-300 dark:bg-zinc-600 rounded-full mx-auto my-3" />

      {/* Header */}
      <div className="flex items-center justify-between px-4 pb-3 border-b border-black/10 dark:border-white/10">
        <button
          type="button"
          onClick={onClose}
          className="min-h-[44px] px-2 text-primary dark:text-primary-dark text-[17px] font-normal"
        >
          Cerrar
        </button>
        <span className="text-[17px] font-semibold text-black dark:text-white truncate max-w-[200px]">
          Detalle de Entrega
        </span>
        <div className="w-12" />
      </div>

      <div className="p-6">
        {/* Source Badge */}
        <div className="flex items-center gap-2 mb-3">
          <span className="text-[13px] font-medium text-black/60 dark:text-white/60">
            {sourceLabel}
          </span>
        </div>

        {/* Title */}
        <h2 className="text-[22px] font-bold text-black dark:text-white mb-2 leading-snug break-words line-clamp-2">
          {assignment.title}
        </h2>

        {/* Course */}
        {assignment.courseName && (
          <div className="flex items-center gap-2 text-[15px] text-black/70 dark:text-white/70 mb-4">
            <BookOpen size={18} weight="regular" />
            <span className="truncate">{assignment.courseName}</span>
          </div>
        )}

        {/* Deadline */}
        <div className="flex items-center gap-2 text-[15px] font-medium text-black dark:text-white mb-6 p-3 rounded-xl bg-black/5 dark:bg-white/5">
          <Clock size={18} weight="regular" className="text-primary dark:text-primary-dark" />
          <span className="capitalize">{formattedDate}</span>
        </div>

        {onCompletionChange && (
          <div className="mb-6">
            <p className="mb-3 text-[15px] text-black/60 dark:text-white/60" aria-live="polite">
              {assignment.is_completed ? messages.completed : messages.pending}
            </p>
            <Button
              large outline className="min-h-[44px]"
              disabled={completionPending || !isOnline}
              onClick={() => onCompletionChange(assignment.id, !assignment.is_completed)}
            >
              {assignment.is_completed ? messages.reopen : messages.complete}
            </Button>
            {completionPending && <p role="status" className="mt-2 text-[13px] text-black/60 dark:text-white/60">{messages.saving}</p>}
            {completionError && <p role="alert" className="mt-2 text-[15px] text-black dark:text-white">{completionError}</p>}
            <p className="mt-3 text-[13px] text-black/60 dark:text-white/60">
              {isOnline ? messages.completionNote : messages.offlineCompletion}
            </p>
          </div>
        )}

        {/* Description */}
        {assignment.description && (
          <div className="mb-6">
            <h3 className="text-[13px] font-semibold uppercase tracking-wider text-black/40 dark:text-white/40 mb-1.5">
              Instrucciones
            </h3>
            <p className="text-[15px] text-black/80 dark:text-white/80 leading-relaxed max-h-48 overflow-y-auto whitespace-pre-wrap">
              {assignment.description}
            </p>
          </div>
        )}

        {/* Primary Action Button */}
        <div className="pt-2">
          {assignment.alternate_link ? (
            <a
              href={externalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full flex items-center justify-center gap-2 py-3.5 px-4 rounded-xl bg-primary dark:bg-primary-dark text-white font-semibold text-[17px] active:opacity-80 transition-opacity"
            >
              <span>{isDutic ? "Abrir en Moodle" : "Abrir en Classroom"}</span>
              <ArrowSquareOut size={18} weight="regular" />
            </a>
          ) : (
            <p className="text-center text-[13px] text-black/40 dark:text-white/40">
              No hay enlace web disponible para esta actividad
            </p>
          )}
        </div>
      </div>
    </Sheet>
  );
}
