"use client";

import React from "react";
import { ArrowUUpLeft } from "@phosphor-icons/react";
import { taskBoardMessages as messages } from "@/lib/messages/task-board-messages";
import { UndoToastState } from "./hoy-helpers";

export interface TaskUndoToastProps {
  toast: UndoToastState | null;
  onUndo: () => void;
}

/**
 * Floating snackbar allowing immediate reversal of optimistic task completion.
 */
export function TaskUndoToast({ toast, onUndo }: TaskUndoToastProps): React.JSX.Element | null {
  if (!toast) return null;

  return (
    <div className="fixed bottom-24 inset-x-0 z-40 px-4 pointer-events-none">
      <div
        role="status"
        className="w-full max-w-md mx-auto pointer-events-auto rounded-2xl bg-surface-elevated border border-control px-4 py-2.5 shadow-2xl flex items-center justify-between gap-3"
      >
        <div className="min-w-0">
          <p className="text-ios-caption-1 font-semibold text-ink-primary">
            {messages.completedToast}
          </p>
          <p className="text-ios-caption-2 text-ink-secondary truncate">
            {toast.title}
          </p>
        </div>
        <button
          type="button"
          onClick={onUndo}
          className="min-h-[44px] px-3 rounded-xl text-ios-caption-1 font-semibold text-brand-action hover:bg-surface-inset inline-flex items-center gap-1.5 shrink-0 cursor-pointer"
        >
          <ArrowUUpLeft aria-hidden="true" className="w-4 h-4" weight="bold" />
          <span>{messages.undoAction}</span>
        </button>
      </div>
    </div>
  );
}
