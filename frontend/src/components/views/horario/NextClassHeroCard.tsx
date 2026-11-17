"use client";

import React from "react";
import { BookOpen, Flask } from "@phosphor-icons/react";
import type { NextClassSummary } from "@/lib/schedule-calculator";
import { horarioMessages as messages, taskBoardMessages } from "@/lib/messages/task-board-messages";

export interface NextClassHeroCardProps {
  nextClass: NextClassSummary | null;
  courseTitle: string | null;
  verAulaOpen: boolean;
  onOpenVerAula: () => void;
  onCloseVerAula: () => void;
}

/**
 * Prominent hero card showing the active or upcoming class session and campus room sheet.
 */
export function NextClassHeroCard({
  nextClass,
  courseTitle,
  verAulaOpen,
  onOpenVerAula,
  onCloseVerAula,
}: NextClassHeroCardProps): React.JSX.Element {
  return (
    <>
      <section
        data-purpose="next-class-card"
        aria-label={messages.nextLabel}
        className="rounded-3xl p-5 mb-7 border border-urgent-edge bg-surface-hero"
      >
        {nextClass ? (
          <>
            <p className="text-brand-tint text-ios-caption-1 font-semibold tracking-wide mb-2">
              {nextClass.subLabel}
            </p>
            <div className="flex items-baseline space-x-2">
              <span className="text-ios-large-title tracking-tight text-ink-primary leading-none">
                {nextClass.block.start_time}
              </span>
              <span className="text-ios-headline font-medium text-ink-secondary">
                – {nextClass.block.end_time}
              </span>
            </div>
            <h2 className="text-ios-title-3 font-bold text-ink-primary leading-snug mt-3 mb-3 tracking-tight line-clamp-2">
              {courseTitle}
            </h2>
            <div className="flex items-end justify-between gap-3">
              <div className="space-y-0.5 text-ios-caption-1 min-w-0">
                <div className="flex items-center gap-1.5 text-ink-primary font-semibold">
                  {nextClass.block.component_type === "LABORATORIO" ? (
                    <Flask
                      aria-hidden="true"
                      className="w-3.5 h-3.5 text-ink-secondary shrink-0"
                    />
                  ) : (
                    <BookOpen
                      aria-hidden="true"
                      className="w-3.5 h-3.5 text-ink-secondary shrink-0"
                    />
                  )}
                  <span className="truncate">
                    {nextClass.block.component_type === "LABORATORIO"
                      ? taskBoardMessages.components.lab
                      : taskBoardMessages.components.theory}
                  </span>
                </div>
                {nextClass.block.room && (
                  <p className="text-ink-secondary truncate">{nextClass.block.room}</p>
                )}
                {nextClass.block.pavilion && (
                  <p className="text-ink-muted truncate">{nextClass.block.pavilion}</p>
                )}
              </div>

              <button
                type="button"
                onClick={onOpenVerAula}
                className="min-h-[44px] bg-brand-cta interactive-cta text-white text-ios-caption-1 font-semibold rounded-full px-5 py-2.5 shrink-0 transition-colors cursor-pointer"
              >
                {messages.verAulaButton}
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="text-brand-tint text-ios-caption-1 font-semibold tracking-wide mb-2">
              {messages.nextLabel}
            </p>
            <h2 className="text-ios-title-3 font-bold text-ink-primary leading-tight mt-1 mb-1">
              {messages.emptySchedules}
            </h2>
            <p className="text-ios-subhead text-ink-secondary">
              {messages.emptySchedulesHint}
            </p>
          </>
        )}
      </section>

      {verAulaOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/50 dark:bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
          onClick={onCloseVerAula}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="ver-aula-placeholder-title"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl bg-surface-sheet border border-subtle p-5 text-ink-primary shadow-layer-overlay space-y-4"
          >
            <div>
              <h2
                id="ver-aula-placeholder-title"
                className="text-ios-headline font-bold text-ink-primary"
              >
                {messages.verAulaTitle}
              </h2>
              <p className="text-ios-subhead text-ink-secondary mt-2 leading-relaxed">
                {messages.verAulaPlaceholder}
              </p>
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={onCloseVerAula}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-brand-cta interactive-cta text-ios-caption-1 font-semibold text-white cursor-pointer"
              >
                {messages.verAulaCloseButton}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
