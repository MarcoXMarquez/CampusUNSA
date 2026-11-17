"use client";

import React from "react";
import { BookOpen, CaretDown, Flask, MagnifyingGlass, X } from "@phosphor-icons/react";
import { taskBoardMessages as messages } from "@/lib/messages/task-board-messages";
import { ComponentFilter } from "./hoy-helpers";

export interface CourseFilterOption {
  id: string;
  name: string;
}

export interface TaskFilterBarProps {
  componentFilter: ComponentFilter;
  selectedCourseId: string;
  courseOptions: CourseFilterOption[];
  searchOpen: boolean;
  searchQuery: string;
  onComponentFilterChange: (filter: ComponentFilter) => void;
  onCourseChange: (courseId: string) => void;
  onToggleSearch: () => void;
  onSearchQueryChange: (query: string) => void;
}

/**
 * Header filter bar containing component type pills, course selector, and search field.
 */
export function TaskFilterBar({
  componentFilter,
  selectedCourseId,
  courseOptions,
  searchOpen,
  searchQuery,
  onComponentFilterChange,
  onCourseChange,
  onToggleSearch,
  onSearchQueryChange,
}: TaskFilterBarProps): React.JSX.Element {
  return (
    <header className="flex flex-col gap-3 pb-2">
      <h1 className="text-ios-large-title font-extrabold tracking-tight text-ink-primary">
        {messages.title}
      </h1>

      {/* Segmented Pill Filter: Todas | Teoria | Lab */}
      <nav
        aria-label="Filtrar por tipo"
        className="w-full bg-surface-inset p-1 rounded-xl flex items-center justify-between text-ios-caption-1"
      >
        <button
          type="button"
          aria-pressed={componentFilter === "all"}
          onClick={() => onComponentFilterChange("all")}
          className={`flex-1 min-h-[38px] py-1.5 rounded-lg font-medium transition-all cursor-pointer ${
            componentFilter === "all"
              ? "bg-surface-card text-ink-primary shadow-layer-segment"
              : "text-ink-secondary hover:text-ink-primary"
          }`}
        >
          {messages.filters.all}
        </button>

        <button
          type="button"
          aria-pressed={componentFilter === "theory"}
          onClick={() => onComponentFilterChange("theory")}
          className={`flex-1 min-h-[38px] py-1.5 rounded-lg font-medium flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
            componentFilter === "theory"
              ? "bg-surface-card text-ink-primary shadow-layer-segment"
              : "text-ink-secondary hover:text-ink-primary"
          }`}
        >
          <BookOpen aria-hidden="true" className="w-3.5 h-3.5" weight="regular" />
          <span>{messages.filters.theory}</span>
        </button>

        <button
          type="button"
          aria-pressed={componentFilter === "lab"}
          onClick={() => onComponentFilterChange("lab")}
          className={`flex-1 min-h-[38px] py-1.5 rounded-lg font-medium flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
            componentFilter === "lab"
              ? "bg-surface-card text-ink-primary shadow-layer-segment"
              : "text-ink-secondary hover:text-ink-primary"
          }`}
        >
          <Flask aria-hidden="true" className="w-3.5 h-3.5" weight="regular" />
          <span>{messages.filters.lab}</span>
        </button>
      </nav>

      {/* Sub-header: Course dropdown + Search toggle */}
      <div className="flex justify-between items-center text-ios-subhead pt-1">
        <div className="relative inline-flex items-center min-h-[44px]">
          <select
            aria-label={messages.filters.courseFilterAria}
            value={selectedCourseId}
            onChange={(event) => onCourseChange(event.target.value)}
            className="appearance-none bg-transparent pr-5 py-2 text-ios-subhead font-normal text-brand-action focus:outline-none cursor-pointer max-w-[230px] truncate"
          >
            <option value="all" className="bg-surface-card text-ink-primary">
              {messages.filters.allCourses}
            </option>
            {courseOptions.map((course) => (
              <option
                key={course.id}
                value={course.id}
                className="bg-surface-card text-ink-primary"
              >
                {course.name}
              </option>
            ))}
          </select>
          <CaretDown
            aria-hidden="true"
            className="w-3.5 h-3.5 text-brand-action pointer-events-none absolute right-0"
            weight="bold"
          />
        </div>

        <button
          type="button"
          aria-label={messages.filters.searchAria}
          aria-expanded={searchOpen}
          onClick={onToggleSearch}
          className="min-w-[44px] min-h-[44px] flex items-center justify-end text-brand-action hover:opacity-80 transition-opacity cursor-pointer"
        >
          {searchOpen ? (
            <X aria-hidden="true" className="w-4 h-4" weight="bold" />
          ) : (
            <MagnifyingGlass aria-hidden="true" className="w-4 h-4" weight="bold" />
          )}
        </button>
      </div>

      {searchOpen && (
        <div className="pb-1">
          <input
            type="search"
            value={searchQuery}
            onChange={(event) => onSearchQueryChange(event.target.value)}
            placeholder={messages.filters.searchPlaceholder}
            className="w-full min-h-[44px] rounded-xl bg-surface-card border border-subtle px-3.5 py-2 text-ios-subhead text-ink-primary placeholder:text-ink-muted focus:outline-none focus:border-brand-action"
          />
        </div>
      )}
    </header>
  );
}
