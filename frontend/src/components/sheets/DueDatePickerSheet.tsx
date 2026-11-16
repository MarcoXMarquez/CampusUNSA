"use client";

import React, { useEffect, useId, useMemo, useState } from "react";
import { CaretLeft, CaretRight } from "@phosphor-icons/react";
import type { AcademicCourse } from "@/hooks/useAcademicBoard";
import { dueDatePickerMessages as messages } from "@/lib/messages/task-board-messages";
import {
  buildCalendarMonthGrid,
  buildLimaDueDateIso,
  formatLimaDueDisplay,
  formatRelativeDueSummary,
  formatShortWeekdayDay,
  getLimaDateParts,
  getLimaQuickDueDate,
  resolveNextCourseSessionIso,
} from "@/lib/schedule-calculator";

interface DueDatePickerSheetProps {
  opened: boolean;
  value: string | null;
  selectedCourse: AcademicCourse | null;
  courses: AcademicCourse[];
  componentType: "TEORIA" | "LABORATORIO";
  onConfirm: (nextIso: string | null) => void;
  onClose: () => void;
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

export function DueDatePickerSheet({
  opened,
  value,
  selectedCourse,
  courses,
  componentType,
  onConfirm,
  onClose,
}: DueDatePickerSheetProps): React.ReactElement | null {
  const titleId = useId();
  const [draftIso, setDraftIso] = useState<string | null>(value);
  const [visibleYear, setVisibleYear] = useState<number>(() => getLimaDateParts(new Date()).year);
  const [visibleMonth, setVisibleMonth] = useState<number>(
    () => getLimaDateParts(new Date()).month
  );

  useEffect(() => {
    if (!opened) {
      return;
    }
    setDraftIso(value);
    const reference = value ? new Date(value) : new Date();
    const parts = getLimaDateParts(Number.isNaN(reference.getTime()) ? new Date() : reference);
    setVisibleYear(parts.year);
    setVisibleMonth(parts.month);
  }, [opened, value]);

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

  const nowDate = useMemo(() => (opened ? new Date() : new Date()), [opened]);
  const todayParts = useMemo(() => getLimaDateParts(nowDate), [nowDate]);
  const todayQuickIso = useMemo(() => getLimaQuickDueDate("today", nowDate), [nowDate]);
  const tomorrowQuickIso = useMemo(() => getLimaQuickDueDate("tomorrow", nowDate), [nowDate]);
  const nextClassIso = useMemo(
    () => resolveNextCourseSessionIso(selectedCourse, componentType, nowDate),
    [selectedCourse, componentType, nowDate]
  );
  const nextClassShortLabel = useMemo(
    () => formatShortWeekdayDay(nextClassIso),
    [nextClassIso]
  );

  const classDaysOfWeek = useMemo(() => {
    const sourceCourses = selectedCourse ? [selectedCourse] : courses;
    const days = new Set<number>();
    for (const course of sourceCourses) {
      for (const block of course.schedule_blocks ?? []) {
        days.add(block.day_of_week);
      }
    }
    return days;
  }, [selectedCourse, courses]);

  const calendarCells = useMemo(
    () => buildCalendarMonthGrid(visibleYear, visibleMonth, nowDate),
    [visibleYear, visibleMonth, nowDate]
  );

  if (!opened) {
    return null;
  }

  const parsedDraft = draftIso ? new Date(draftIso) : null;
  const draftParts =
    parsedDraft && !Number.isNaN(parsedDraft.getTime()) ? getLimaDateParts(parsedDraft) : null;
  const selectedDateKey = draftParts
    ? `${draftParts.year}-${pad2(draftParts.month)}-${pad2(draftParts.day)}`
    : null;
  const timeInputValue = draftParts ? `${pad2(draftParts.hour)}:${pad2(draftParts.minute)}` : "23:59";

  const canGoPrevMonth =
    visibleYear > todayParts.year ||
    (visibleYear === todayParts.year && visibleMonth > todayParts.month);

  const shiftMonth = (delta: -1 | 1) => {
    if (delta === -1 && !canGoPrevMonth) {
      return;
    }
    const utc = new Date(Date.UTC(visibleYear, visibleMonth - 1 + delta, 1));
    setVisibleYear(utc.getUTCFullYear());
    setVisibleMonth(utc.getUTCMonth() + 1);
  };

  const syncVisibleMonthToIso = (iso: string) => {
    const parts = getLimaDateParts(new Date(iso));
    setVisibleYear(parts.year);
    setVisibleMonth(parts.month);
  };

  const handleSelectDay = (day: number) => {
    const hour = draftParts ? draftParts.hour : 23;
    const minute = draftParts ? draftParts.minute : 59;
    setDraftIso(buildLimaDueDateIso(visibleYear, visibleMonth, day, hour, minute));
  };

  const handleTimeChange = (timeValue: string) => {
    const match = /^(\d{2}):(\d{2})$/.exec(timeValue.trim());
    if (!match) {
      return;
    }
    const hour = Number.parseInt(match[1], 10);
    const minute = Number.parseInt(match[2], 10);
    const base = draftParts ?? todayParts;
    setDraftIso(buildLimaDueDateIso(base.year, base.month, base.day, hour, minute));
  };

  const monthHeading = `${messages.months[visibleMonth - 1] ?? "Enero"} ${visibleYear}`;
  const headlineDate = draftIso
    ? formatLimaDueDisplay(draftIso, messages.emptyDateTitle)
    : messages.emptyDateTitle;
  const relativeSummary = formatRelativeDueSummary(
    draftIso,
    nowDate,
    messages.emptyDateSubtitle
  );

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
        className="w-full max-w-[430px] max-h-[93dvh] bg-[#f2f2f7] dark:bg-[#17171a] rounded-t-[34px] sm:rounded-[34px] flex flex-col shadow-2xl overflow-hidden border border-black/10 dark:border-[#2e2e33] pb-[calc(env(safe-area-inset-bottom)+0.75rem)]"
      >
        <div className="w-full pt-3 pb-1 flex justify-center items-center" aria-hidden="true">
          <div className="w-9 h-[5px] bg-black/20 dark:bg-[#444448] rounded-full" />
        </div>

        <header className="px-5 py-2 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] px-1 text-[17px] tracking-tight font-normal text-[#ea4345] hover:opacity-80 active:opacity-60 transition"
          >
            {messages.cancelAction}
          </button>
          <h2
            id={titleId}
            className="text-[17px] font-semibold text-black dark:text-white tracking-tight"
          >
            {messages.sheetTitle}
          </h2>
          <button
            type="button"
            onClick={() => {
              onConfirm(draftIso);
              onClose();
            }}
            className="min-h-[44px] px-1 text-[17px] tracking-tight font-medium text-[#ea4345] hover:opacity-80 active:opacity-60 transition"
          >
            {messages.doneAction}
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 pt-1 pb-4 space-y-4">
          <div className="space-y-0.5">
            <p className="text-[26px] leading-tight font-bold tracking-tight text-black dark:text-white">
              {headlineDate}
            </p>
            <p className="text-[14px] text-black/55 dark:text-[#8e8e93] font-normal">
              {relativeSummary}
            </p>
          </div>

          <div className="flex items-center gap-2 overflow-x-auto py-1">
            <button
              type="button"
              onClick={() => {
                setDraftIso(todayQuickIso);
                syncVisibleMonthToIso(todayQuickIso);
              }}
              className={`min-h-[44px] px-4 py-2 text-[14px] font-medium rounded-full transition whitespace-nowrap ${
                draftIso === todayQuickIso
                  ? "bg-[#ea4345] text-white"
                  : "bg-white dark:bg-[#26262b] text-black dark:text-white"
              }`}
            >
              {messages.quickToday}
            </button>
            <button
              type="button"
              onClick={() => {
                setDraftIso(tomorrowQuickIso);
                syncVisibleMonthToIso(tomorrowQuickIso);
              }}
              className={`min-h-[44px] px-4 py-2 text-[14px] font-medium rounded-full transition whitespace-nowrap ${
                draftIso === tomorrowQuickIso
                  ? "bg-[#ea4345] text-white"
                  : "bg-white dark:bg-[#26262b] text-black dark:text-white"
              }`}
            >
              {messages.quickTomorrow}
            </button>
            <button
              type="button"
              disabled={!nextClassIso}
              onClick={() => {
                if (!nextClassIso) {
                  return;
                }
                setDraftIso(nextClassIso);
                syncVisibleMonthToIso(nextClassIso);
              }}
              className={`min-h-[44px] px-4 py-2 text-[14px] font-medium rounded-full transition whitespace-nowrap flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed ${
                nextClassIso && draftIso === nextClassIso
                  ? "bg-[#ea4345] text-white"
                  : "bg-white dark:bg-[#26262b] text-black/85 dark:text-[#dededf]"
              }`}
            >
              <span>{messages.quickNextClass}</span>
              {nextClassShortLabel && (
                <span
                  className={
                    nextClassIso && draftIso === nextClassIso
                      ? "text-white/85"
                      : "text-black/50 dark:text-[#8e8e93]"
                  }
                >
                  · {nextClassShortLabel}
                </span>
              )}
            </button>
          </div>

          <div className="bg-white dark:bg-[#1f1f23] rounded-2xl p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[17px] font-semibold text-black dark:text-white tracking-tight">
                {monthHeading}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  aria-label={messages.prevMonthAria}
                  disabled={!canGoPrevMonth}
                  onClick={() => shiftMonth(-1)}
                  className="min-h-[44px] min-w-[44px] flex items-center justify-center text-[#ea4345] disabled:opacity-30 disabled:cursor-not-allowed transition"
                >
                  <CaretLeft size={18} weight="bold" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  aria-label={messages.nextMonthAria}
                  onClick={() => shiftMonth(1)}
                  className="min-h-[44px] min-w-[44px] flex items-center justify-center text-[#ea4345] hover:opacity-75 transition"
                >
                  <CaretRight size={18} weight="bold" aria-hidden="true" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-7 text-center text-[13px] font-medium text-black/45 dark:text-[#7c7c82] mb-2">
              {messages.weekdayInitials.map((label, idx) => (
                <div key={idx}>{label}</div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-y-1 text-center text-[15px] items-center">
              {calendarCells.map((cell, idx) => {
                if (cell.day === null || !cell.dateKey) {
                  return <div key={`blank-${idx}`} className="min-h-[44px]" />;
                }

                const isSelected = selectedDateKey === cell.dateKey;
                const hasClass = !cell.isPast && classDaysOfWeek.has(cell.dayOfWeek);

                return (
                  <button
                    key={cell.dateKey}
                    type="button"
                    aria-label={cell.dateKey}
                    aria-pressed={isSelected}
                    disabled={cell.isPast}
                    onClick={() => handleSelectDay(cell.day as number)}
                    className={`min-h-[44px] w-full flex flex-col items-center justify-center relative rounded-lg transition ${
                      cell.isPast
                        ? "text-black/25 dark:text-[#55555a] cursor-not-allowed"
                        : "cursor-pointer"
                    }`}
                  >
                    <span
                      className={`w-8 h-8 rounded-full flex items-center justify-center ${
                        isSelected
                          ? "bg-[#ea4345] text-white font-semibold shadow-md"
                          : cell.isToday
                            ? "text-[#ea4345] font-semibold"
                            : cell.isPast
                              ? ""
                              : "text-black dark:text-white"
                      }`}
                    >
                      {cell.day}
                    </span>
                    {hasClass && (
                      <span
                        data-testid={`calendar-class-dot-${cell.dateKey}`}
                        aria-hidden="true"
                        className={`w-[3.5px] h-[3.5px] rounded-full mt-0.5 ${
                          isSelected ? "bg-white/80" : "bg-[#9ca3af]"
                        }`}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="bg-white dark:bg-[#1f1f23] rounded-2xl px-4 py-2 flex items-center justify-between min-h-[56px]">
            <span className="text-[17px] text-black/85 dark:text-[#dededf] font-normal">
              {messages.timeLabel}
            </span>
            <input
              type="time"
              aria-label={messages.timeInputAria}
              value={timeInputValue}
              onChange={(event) => handleTimeChange(event.target.value)}
              className="min-h-[44px] bg-black/5 dark:bg-[#2c2c31] hover:bg-black/10 dark:hover:bg-[#38383f] px-3.5 py-1.5 rounded-lg text-black dark:text-white font-medium text-[16px] tracking-tight outline-none"
            />
          </div>

          <div className="pt-1 text-center">
            <button
              type="button"
              onClick={() => {
                onConfirm(null);
                onClose();
              }}
              className="min-h-[44px] px-4 text-[17px] font-normal text-[#ea4345] hover:opacity-80 active:opacity-60 transition"
            >
              {messages.clearDateAction}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
