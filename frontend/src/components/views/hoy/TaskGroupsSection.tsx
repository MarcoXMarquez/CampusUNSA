"use client";

import React from "react";
import type { AcademicAssignment } from "@/components/sheets/TaskDetailSheet";
import type { TaskGroup } from "@/lib/task-urgency";
import { taskBoardMessages as messages } from "@/lib/messages/task-board-messages";
import type { ResolvedTaskMeta } from "./hoy-helpers";
import { TaskCardRow } from "./TaskCardRow";

const GROUP_ORDER: TaskGroup[] = ["overdue", "today", "week", "upcoming", "undated"];

export interface TaskGroupsSectionProps {
  loading: boolean;
  hasActiveTasks: boolean;
  hasAnyPendingAssignments: boolean;
  groups: Record<TaskGroup, AcademicAssignment[]>;
  metadataById: Map<string, ResolvedTaskMeta>;
  now: Date;
  onToggleComplete: (task: AcademicAssignment) => void;
  onSelectTask: (task: AcademicAssignment) => void;
}

/**
 * Renders loading skeletons, empty guidance, or urgency-grouped task card sections.
 */
export function TaskGroupsSection({
  loading,
  hasActiveTasks,
  hasAnyPendingAssignments,
  groups,
  metadataById,
  now,
  onToggleComplete,
  onSelectTask,
}: TaskGroupsSectionProps): React.JSX.Element {
  if (loading && !hasActiveTasks) {
    return (
      <div role="status" aria-label={messages.loading} className="space-y-4 pt-3">
        {[0, 1, 2].map((idx) => (
          <div
            key={idx}
            className="animate-pulse rounded-xl bg-surface-card border border-subtle p-3.5 space-y-2.5"
          >
            <div className="h-4 w-3/5 rounded bg-surface-elevated" />
            <div className="h-3 w-2/5 rounded bg-surface-elevated" />
            <div className="h-3 w-1/3 rounded bg-surface-elevated" />
          </div>
        ))}
      </div>
    );
  }

  if (!hasActiveTasks) {
    return (
      <div className="mt-6 rounded-2xl bg-surface-card border border-subtle px-5 py-10 text-center">
        <p className="text-ios-subhead text-ink-secondary">
          {hasAnyPendingAssignments ? messages.emptyFiltered : messages.empty}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col space-y-4 pt-3">
      {GROUP_ORDER.map((group) => {
        const items = groups[group];
        if (items.length === 0) return null;
        const heading = messages.groups[group];
        const isOverdue = group === "overdue";

        return (
          <section key={group} aria-label={heading} className="flex flex-col">
            <div className="flex justify-between items-center text-ios-caption-1 mb-1.5 px-1">
              <span
                className={`font-semibold text-ios-subhead ${
                  isOverdue ? "text-status-urgent" : "text-ink-primary"
                }`}
              >
                {heading}
              </span>
              <span className="text-ink-muted font-medium text-ios-caption-1">
                {messages.countLabel(items.length)}
              </span>
            </div>

            <div
              className={
                isOverdue
                  ? "flex flex-col space-y-2.5"
                  : "bg-surface-card border border-subtle rounded-xl flex flex-col divide-y divide-subtle shadow-sm overflow-hidden"
              }
            >
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
                    onToggleComplete={onToggleComplete}
                    onSelect={onSelectTask}
                  />
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
