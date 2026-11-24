"use client";

import React, { memo } from "react";
import { BookOpen, Flask } from "@phosphor-icons/react";
import type { AcademicAssignment } from "@/components/sheets/TaskDetailSheet";
import { formatTaskMetadataLine, TaskGroup } from "@/lib/task-urgency";
import { formatAcademicTitle } from "@/lib/text-format";
import { taskBoardMessages as messages } from "@/lib/messages/task-board-messages";
import { ResolvedTaskMeta, resolvePriorityLabel } from "./hoy-helpers";

export interface TaskCardRowProps {
  item: AcademicAssignment;
  group: TaskGroup;
  meta: ResolvedTaskMeta;
  now: Date;
  onToggleComplete: (task: AcademicAssignment) => void;
  onSelect: (task: AcademicAssignment) => void;
}

/**
 * Memoized row displaying an individual pending or overdue assignment card.
 */
export const TaskCardRow = memo(function TaskCardRow({
  item,
  group,
  meta,
  now,
  onToggleComplete,
  onSelect,
}: TaskCardRowProps): React.JSX.Element {
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
    <article className="p-3 flex gap-2.5 items-start">
      <button
        type="button"
        aria-label={`${messages.complete}: ${displayTitle}`}
        onClick={(event) => {
          event.stopPropagation();
          onToggleComplete(item);
        }}
        className="min-w-[44px] min-h-[44px] -ml-2 -mt-2 flex items-center justify-center shrink-0 cursor-pointer group interactive-surface rounded-lg"
      >
        <span className="w-5 h-5 rounded-full border-2 border-control group-hover:border-ink-secondary transition-colors" />
      </button>

      <button
        type="button"
        onClick={() => onSelect(item)}
        className="flex-1 min-w-0 min-h-[44px] interactive-surface rounded-lg text-left flex flex-col gap-0.5 cursor-pointer"
      >
        <div className="flex justify-between items-baseline gap-2">
          <h2 className="text-ios-callout font-semibold text-ink-primary tracking-tight line-clamp-2">
            {displayTitle}
          </h2>
          {priorityText && (
            <span className="text-ios-caption-2 text-ink-secondary font-normal shrink-0">
              {priorityText}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 text-ios-caption-1 text-ink-secondary min-w-0">
          <span
            aria-hidden="true"
            className="w-2 h-2 rounded-full shrink-0"
            style={{ backgroundColor: meta.dotColor }}
          />
          <span className="font-normal truncate">{meta.courseLabel}</span>
          {item.origin === "whatsapp" && (
            <span className="shrink-0">
              <span aria-hidden="true">· </span><span>{messages.detail.whatsapp}</span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 text-ios-caption-1 text-ink-muted mt-0.5">
          {meta.componentType === "LABORATORIO" ? (
            <Flask aria-hidden="true" className="w-3.5 h-3.5 shrink-0" weight="regular" />
          ) : (
            <BookOpen aria-hidden="true" className="w-3.5 h-3.5 shrink-0" weight="regular" />
          )}
          <span>{isOverdue ? meta.componentLabel : dueText}</span>
        </div>

        {isOverdue && (
          <p className="text-ios-caption-1 text-ink-secondary font-normal mt-1 leading-snug">
            {dueText}
          </p>
        )}
      </button>
    </article>
  );
});
