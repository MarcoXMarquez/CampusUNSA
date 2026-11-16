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
        className="w-full max-w-[430px] max-h-[88dvh] flex flex-col bg-[#f2f2f7] dark:bg-[#18181a] rounded-t-[24px] sm:rounded-[24px] pt-2.5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] px-4 text-black dark:text-white shadow-2xl border border-black/10 dark:border-white/10"
      >
        <div
          aria-hidden="true"
          className="w-9 h-1.5 bg-black/20 dark:bg-[#444448] rounded-full mx-auto mb-2.5"
        />

        <header className="relative flex items-center justify-between min-h-[44px] mb-3 px-1">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] px-1 text-[#d34545] active:opacity-60 text-[17px] font-normal leading-tight transition-opacity"
          >
            {messages.cancelAction}
          </button>
          <h2
            id={titleId}
            className="absolute left-1/2 -translate-x-1/2 text-[17px] font-semibold text-black dark:text-white tracking-tight"
          >
            {messages.sheetTitle}
          </h2>
          <div aria-hidden="true" className="w-[65px]" />
        </header>

        <div className="relative mb-3.5">
          <label htmlFor={searchInputId} className="sr-only">
            {messages.searchAria}
          </label>
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-black/40 dark:text-[#7c7c82]">
            <MagnifyingGlass size={16} weight="bold" aria-hidden="true" />
          </div>
          <input
            id={searchInputId}
            type="search"
            aria-label={messages.searchAria}
            placeholder={searchPlaceholder}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="w-full min-h-[44px] bg-white dark:bg-[#252528] text-black dark:text-white placeholder:text-black/40 dark:placeholder:text-[#68686d] text-[15px] rounded-xl pl-9 pr-4 py-2.5 outline-none focus:ring-1 focus:ring-[#5e5e63]"
          />
        </div>

        <div className="overflow-y-auto space-y-3 pb-1">
          {!query.trim() && (
            <div className="bg-white dark:bg-[#242426] rounded-2xl overflow-hidden">
              <button
                type="button"
                aria-pressed={selectedCourseCode === ""}
                onClick={() => {
                  onSelect("");
                  onClose();
                }}
                className="w-full min-h-[56px] px-4 py-2.5 flex items-center justify-between text-left active:bg-black/5 dark:active:bg-[#2d2d31] transition-colors"
              >
                <div className="flex items-center min-w-0 flex-1">
                  <span
                    aria-hidden="true"
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0 mr-3.5"
                    style={{ backgroundColor: getCourseColor("personal") }}
                  />
                  <div className="min-w-0 pr-2">
                    <p className="text-[16px] font-medium text-black dark:text-white leading-snug truncate">
                      {messages.noCourseTitle}
                    </p>
                    <p className="text-[13px] text-black/55 dark:text-[#8e8e93] leading-tight mt-0.5">
                      {messages.noCourseSubtitle}
                    </p>
                  </div>
                </div>
                {selectedCourseCode === "" && (
                  <span aria-label={messages.selectedAria} className="pl-2 flex-shrink-0">
                    <Check size={18} weight="bold" className="text-[#d34545]" aria-hidden="true" />
                  </span>
                )}
              </button>
            </div>
          )}

          <div>
            <p className="px-1.5 pb-2 text-[13px] font-normal text-black/55 dark:text-[#7c7c82]">
              {messages.sectionTitle}
            </p>
            {filteredItems.length === 0 ? (
              <p className="bg-white dark:bg-[#242426] rounded-2xl px-4 py-4 text-[14px] text-black/60 dark:text-[#8e8e93] text-center">
                {messages.emptySearch}
              </p>
            ) : (
              <ul
                role="list"
                className="bg-white dark:bg-[#242426] rounded-2xl overflow-hidden divide-y divide-black/10 dark:divide-[#323236]"
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
                        className="w-full min-h-[60px] px-4 py-3 flex items-center justify-between text-left active:bg-black/5 dark:active:bg-[#2d2d31] transition-colors"
                      >
                        <div className="flex items-center min-w-0 flex-1">
                          <span
                            aria-hidden="true"
                            className="w-2.5 h-2.5 rounded-full flex-shrink-0 mr-3.5"
                            style={{ backgroundColor: item.color }}
                          />
                          <div className="min-w-0 pr-2">
                            <p className="text-[16px] font-medium text-black dark:text-white tracking-tight leading-snug">
                              {item.displayName}
                            </p>
                            {item.subtitle && (
                              <p className="text-[13px] text-black/55 dark:text-[#8e8e93] font-normal leading-tight mt-0.5">
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
                              className="text-[#d34545]"
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
