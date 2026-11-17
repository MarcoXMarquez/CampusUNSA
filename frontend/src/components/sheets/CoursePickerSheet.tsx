"use client";

import React, { useEffect, useId, useMemo, useState } from "react";
import { Check, MagnifyingGlass } from "@phosphor-icons/react";
import type { AcademicCourse } from "@/hooks/useAcademicBoard";
import { coursePickerMessages as messages } from "@/lib/messages/task-board-messages";
import {
  formatCourseDisplayName,
  formatCourseGroupSubtitle,
  getCourseColor,
} from "@/lib/schedule-calculator";

interface CoursePickerSheetProps {
  opened: boolean;
  courses: AcademicCourse[];
  selectedCourseCode: string;
  onSelect: (courseCode: string) => void;
  onClose: () => void;
}

export function CoursePickerSheet({
  opened,
  courses,
  selectedCourseCode,
  onSelect,
  onClose,
}: CoursePickerSheetProps): React.ReactElement | null {
  const titleId = useId();
  const searchInputId = useId();
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (opened) {
      setQuery("");
    }
  }, [opened]);

  useEffect(() => {
    if (!opened) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", handleKeyDown, { capture: true });
  }, [opened, onClose]);

  const enrolledItems = useMemo(() => {
    return courses
      .filter((course) => Boolean(course.course_code))
      .map((course) => {
        const code = course.course_code ?? "";
        const displayName = formatCourseDisplayName(course);
        const subtitle = formatCourseGroupSubtitle(course);
        return {
          course,
          code,
          displayName,
          subtitle,
          color: getCourseColor(code || course.id),
        };
      })
      .sort((a, b) => a.displayName.localeCompare(b.displayName, "es"));
  }, [courses]);

  const filteredItems = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return enrolledItems;
    }
    return enrolledItems.filter(
      (item) =>
        item.displayName.toLowerCase().includes(normalized) ||
        item.code.toLowerCase().includes(normalized) ||
        item.subtitle.toLowerCase().includes(normalized)
    );
  }, [enrolledItems, query]);

  if (!opened) {
    return null;
  }

  const searchPlaceholder =
    enrolledItems.length === 1
      ? messages.searchPlaceholderOne
      : messages.searchPlaceholderMany(enrolledItems.length);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 backdrop-blur-[2px] sm:items-center sm:p-4"
      onClick={(event) => {
        event.stopPropagation();
        onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-[430px] max-h-[88dvh] flex flex-col bg-surface-sheet rounded-t-[24px] sm:rounded-[24px] pt-2.5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] px-4 text-ink-primary shadow-layer-overlay border border-subtle"
      >
        <div
          aria-hidden="true"
          className="w-9 h-1.5 bg-control rounded-full mx-auto mb-2.5"
        />

        <header className="relative flex items-center justify-between min-h-[44px] mb-3 px-1">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] px-1 text-brand-action active:opacity-60 text-ios-headline font-normal transition-opacity"
          >
            {messages.cancelAction}
          </button>
          <h2
            id={titleId}
            className="absolute left-1/2 -translate-x-1/2 text-ios-headline font-semibold text-ink-primary"
          >
            {messages.sheetTitle}
          </h2>
          <div aria-hidden="true" className="w-[65px]" />
        </header>

        <div className="relative mb-3.5">
          <label htmlFor={searchInputId} className="sr-only">
            {messages.searchAria}
          </label>
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-ink-muted">
            <MagnifyingGlass size={16} weight="bold" aria-hidden="true" />
          </div>
          <input
            id={searchInputId}
            type="search"
            aria-label={messages.searchAria}
            placeholder={searchPlaceholder}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="w-full min-h-[44px] bg-surface-card border border-subtle text-ink-primary placeholder:text-ink-muted text-ios-subhead rounded-xl pl-9 pr-4 py-2.5 outline-none focus:ring-1 focus:ring-brand-action/60"
          />
        </div>

        <div className="overflow-y-auto space-y-3 pb-1">
          {!query.trim() && (
            <div className="bg-surface-card border border-subtle rounded-2xl overflow-hidden">
              <button
                type="button"
                aria-pressed={selectedCourseCode === ""}
                onClick={() => {
                  onSelect("");
                  onClose();
                }}
                className="w-full min-h-[56px] px-4 py-2.5 flex items-center justify-between text-left active:bg-surface-elevated transition-colors"
              >
                <div className="flex items-center min-w-0 flex-1">
                  <span
                    aria-hidden="true"
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0 mr-3.5"
                    style={{ backgroundColor: getCourseColor("personal") }}
                  />
                  <div className="min-w-0 pr-2">
                    <p className="text-ios-callout font-medium text-ink-primary leading-snug truncate">
                      {messages.noCourseTitle}
                    </p>
                    <p className="text-ios-footnote text-ink-secondary leading-tight mt-0.5">
                      {messages.noCourseSubtitle}
                    </p>
                  </div>
                </div>
                {selectedCourseCode === "" && (
                  <span aria-label={messages.selectedAria} className="pl-2 flex-shrink-0">
                    <Check size={18} weight="bold" className="text-brand-action" aria-hidden="true" />
                  </span>
                )}
              </button>
            </div>
          )}

          <div>
            <p className="px-1.5 pb-2 text-ios-footnote font-normal text-ink-muted">
              {messages.sectionTitle}
            </p>
            {filteredItems.length === 0 ? (
              <p className="bg-surface-card border border-subtle rounded-2xl px-4 py-4 text-ios-subhead text-ink-secondary text-center">
                {messages.emptySearch}
              </p>
            ) : (
              <ul
                role="list"
                className="bg-surface-card border border-subtle rounded-2xl overflow-hidden divide-y divide-subtle"
              >
                {filteredItems.map((item) => {
                  const isSelected = selectedCourseCode === item.code;
                  return (
                    <li key={item.code}>
                      <button
                        type="button"
                        aria-pressed={isSelected}
                        onClick={() => {
                          onSelect(item.code);
                          onClose();
                        }}
                        className="w-full min-h-[60px] px-4 py-3 flex items-center justify-between text-left active:bg-surface-elevated transition-colors"
                      >
                        <div className="flex items-center min-w-0 flex-1">
                          <span
                            aria-hidden="true"
                            className="w-2.5 h-2.5 rounded-full flex-shrink-0 mr-3.5"
                            style={{ backgroundColor: item.color }}
                          />
                          <div className="min-w-0 pr-2">
                            <p className="text-ios-callout font-medium text-ink-primary tracking-tight leading-snug">
                              {item.displayName}
                            </p>
                            {item.subtitle && (
                              <p className="text-ios-footnote text-ink-secondary font-normal leading-tight mt-0.5">
                                {item.subtitle}
                              </p>
                            )}
                          </div>
                        </div>
                        {isSelected && (
                          <span aria-label={messages.selectedAria} className="pl-2 flex-shrink-0">
                            <Check
                              size={18}
                              weight="bold"
                              className="text-brand-action"
                              aria-hidden="true"
                            />
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
