"use client";

import React from "react";
import { BookOpen, Flask } from "@phosphor-icons/react";
import type { AcademicCourse } from "@/hooks/useAcademicBoard";
import { formatBlockLocation, getCourseColor } from "@/lib/schedule-calculator";
import { formatAcademicTitle } from "@/lib/text-format";
import { horarioMessages as messages } from "@/lib/messages/task-board-messages";

export interface CourseListSectionProps {
  linkedCourses: AcademicCourse[];
  pendingCourses: AcademicCourse[];
  onOpenNewTask: (course?: AcademicCourse) => void;
  onEditSchedule: (course: AcademicCourse) => void;
  onOpenPendingLinker: (course: AcademicCourse) => void;
}

/**
 * Grouped enrolled course cards with session blocks and pending catalog-link actions.
 */
export function CourseListSection({
  linkedCourses,
  pendingCourses,
  onOpenNewTask,
  onEditSchedule,
  onOpenPendingLinker,
}: CourseListSectionProps): React.JSX.Element {
  if (linkedCourses.length === 0 && pendingCourses.length === 0) {
    return (
      <p className="py-12 text-center text-ios-callout text-ink-secondary">
        {messages.emptyCourses}
      </p>
    );
  }

  return (
    <>
      <section
        aria-label={messages.sectionTitle}
        data-purpose="enrolled-courses-list"
        className="space-y-5"
      >
        {linkedCourses.length > 0 && (
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-ios-title-2 font-bold tracking-tight text-ink-primary">
              {messages.sectionTitle}
            </h2>
            <span className="text-ios-subhead font-medium text-ink-muted">
              {messages.courseCountLabel(linkedCourses.length)}
            </span>
          </div>
        )}

        {linkedCourses.map((course) => {
          const color = getCourseColor(course.course_code ?? course.id);
          const displayCourseName =
            formatAcademicTitle(course.name) || course.name;
          const blocks = course.schedule_blocks ?? [];

          return (
            <article key={course.id} className="space-y-2">
              <div className="flex items-center justify-between gap-2 px-1">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span
                    aria-hidden="true"
                    className="w-2.5 h-2.5 rounded-sm inline-block shrink-0"
                    style={{ backgroundColor: color }}
                  />
                  <h3 className="text-ios-subhead font-bold text-ink-primary tracking-tight leading-snug line-clamp-2">
                    {displayCourseName}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => onOpenNewTask(course)}
                  className="min-h-[44px] px-2 text-ios-caption-1 font-semibold text-brand-action hover:opacity-80 transition-opacity shrink-0 cursor-pointer"
                >
                  {messages.addTaskButton}
                </button>
              </div>

              <button
                type="button"
                onClick={() => onEditSchedule(course)}
                aria-label={messages.editScheduleAria(displayCourseName)}
                className="w-full min-h-[44px] text-left bg-surface-card hover:bg-surface-elevated border border-subtle rounded-2xl p-3 space-y-3 transition-colors cursor-pointer"
              >
                {blocks.length > 0 ? (
                  blocks.map((block) => {
                    const location = formatBlockLocation(block);
                    const compName =
                      block.component_type === "LABORATORIO"
                        ? "Laboratorio"
                        : "Teoría";
                    const subtitle = `${messages.dayFullNames[block.day_of_week] ?? "Lunes"} ${block.start_time}–${block.end_time}${location ? ` · ${location}` : ""}`;

                    return (
                      <div key={block.id} className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-xl bg-surface-elevated flex items-center justify-center shrink-0 text-ink-primary">
                          {block.component_type === "LABORATORIO" ? (
                            <Flask aria-hidden="true" className="w-4 h-4" />
                          ) : (
                            <BookOpen aria-hidden="true" className="w-4 h-4" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-ios-subhead font-semibold text-ink-primary truncate">
                            {compName}
                            {block.group_code ? ` · Grupo ${block.group_code}` : ""}
                          </p>
                          <p className="text-ios-caption-1 text-ink-secondary truncate">
                            {subtitle}
                          </p>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <p className="text-ios-caption-1 text-ink-secondary py-1">
                    {messages.courseNoSessionsHint}
                  </p>
                )}
              </button>
            </article>
          );
        })}
      </section>

      {pendingCourses.length > 0 && (
        <section
          aria-label={messages.pendingSectionTitle}
          className="mt-8 pt-6 border-t border-subtle space-y-3"
        >
          <div>
            <h2 className="text-ios-subhead font-bold text-ink-primary">
              {messages.pendingSectionTitle}
            </h2>
            <p className="text-ios-caption-1 text-ink-secondary mt-0.5">
              {messages.pendingSectionDescription}
            </p>
          </div>
          <div className="space-y-2.5">
            {pendingCourses.map((pending) => (
              <div
                key={pending.id}
                className="rounded-2xl bg-surface-card border border-subtle p-3.5 flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <p className="text-ios-subhead font-semibold text-ink-primary truncate">
                    {pending.name}
                  </p>
                  <p className="text-ios-caption-1 text-ink-secondary mt-0.5">
                    {pending.origin === "moodle" ? "Moodle" : "Classroom"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onOpenPendingLinker(pending)}
                  className="min-h-[44px] px-3 rounded-xl bg-brand-cta interactive-cta text-ios-caption-1 font-semibold text-white shrink-0 cursor-pointer"
                >
                  {messages.linkCourseButton}
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
