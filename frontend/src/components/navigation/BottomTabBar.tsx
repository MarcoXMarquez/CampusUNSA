"use client";

import React from "react";
import { taskSyncMessages as syncMessages } from "@/lib/messages/task-board-messages";

export type AppTab = "tareas" | "horario" | "hugo" | "ajustes";

export interface BottomTabBarProps {
  activeTab: AppTab;
  onSelectTab: (tab: AppTab) => void;
  onOpenNewTask: () => void;
}

/**
 * Sticky 5-item iOS-style bottom navigation bar with central primary task action button.
 */
export function BottomTabBar({
  activeTab,
  onSelectTab,
  onOpenNewTask,
}: BottomTabBarProps): React.JSX.Element {
  return (
    <footer className="fixed bottom-0 inset-x-0 z-40 border-t backdrop-blur-xl pt-2 pb-4 px-4 safe-areas bg-surface-sheet/95 border-subtle">
      <nav
        aria-label="Navegación principal"
        className="w-full max-w-md mx-auto grid grid-cols-5 items-center"
      >
        {/* Tab 1: Tareas */}
        <button
          type="button"
          aria-label={syncMessages.nav.tareas}
          aria-current={activeTab === "tareas" ? "page" : undefined}
          onClick={() => onSelectTab("tareas")}
          className={`min-h-[44px] flex flex-col items-center justify-center cursor-pointer transition ${
            activeTab === "tareas"
              ? "text-brand-action"
              : "text-ink-secondary hover:text-ink-primary"
          }`}
        >
          <svg
            aria-hidden="true"
            className="w-6 h-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.9"
            />
          </svg>
          <span
            className={`text-ios-caption-2 mt-1 tracking-tight ${
              activeTab === "tareas" ? "font-semibold" : "font-medium"
            }`}
          >
            {syncMessages.nav.tareas}
          </span>
        </button>

        {/* Tab 2: Horario */}
        <button
          type="button"
          aria-label={syncMessages.nav.horario}
          aria-current={activeTab === "horario" ? "page" : undefined}
          onClick={() => onSelectTab("horario")}
          className={`min-h-[44px] flex flex-col items-center justify-center cursor-pointer transition ${
            activeTab === "horario"
              ? "text-brand-action"
              : "text-ink-secondary hover:text-ink-primary"
          }`}
        >
          <svg
            aria-hidden="true"
            className="w-6 h-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <rect height="18" rx="3" strokeWidth="1.8" width="18" x="3" y="4" />
            <line strokeLinecap="round" strokeWidth="1.8" x1="16" x2="16" y1="2" y2="6" />
            <line strokeLinecap="round" strokeWidth="1.8" x1="8" x2="8" y1="2" y2="6" />
            <line strokeWidth="1.8" x1="3" x2="21" y1="10" y2="10" />
          </svg>
          <span
            className={`text-ios-caption-2 mt-1 tracking-tight ${
              activeTab === "horario" ? "font-semibold" : "font-medium"
            }`}
          >
            {syncMessages.nav.horario}
          </span>
        </button>

        {/* Center Action Button: + */}
        <div className="flex justify-center">
          <button
            type="button"
            aria-label={syncMessages.nav.newTaskAria}
            onClick={onOpenNewTask}
            className="flex items-center justify-center w-12 h-12 rounded-full bg-brand-cta hover:bg-brand-cta-hover text-white shadow-2xl active:scale-95 transition -mt-6 border-2 border-surface-card ring-1 ring-subtle cursor-pointer"
          >
            <svg
              aria-hidden="true"
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                d="M12 4v16m8-8H4"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2.4"
              />
            </svg>
          </button>
        </div>

        {/* Tab 4: Hugo */}
        <button
          type="button"
          aria-label={syncMessages.nav.hugo}
          aria-current={activeTab === "hugo" ? "page" : undefined}
          onClick={() => onSelectTab("hugo")}
          className={`min-h-[44px] flex flex-col items-center justify-center cursor-pointer transition ${
            activeTab === "hugo"
              ? "text-brand-action"
              : "text-ink-secondary hover:text-ink-primary"
          }`}
        >
          <svg
            aria-hidden="true"
            className="w-6 h-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <rect height="12" rx="3" strokeWidth="1.8" width="16" x="4" y="8" />
            <path
              d="M12 4v4m-3 0h6"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.8"
            />
            <circle cx="9" cy="13" r="1.2" fill="currentColor" />
            <circle cx="15" cy="13" r="1.2" fill="currentColor" />
            <path
              d="M9.5 16.5c1 .6 4 .6 5 0"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.5"
            />
          </svg>
          <span
            className={`text-ios-caption-2 mt-1 tracking-tight ${
              activeTab === "hugo" ? "font-semibold" : "font-medium"
            }`}
          >
            {syncMessages.nav.hugo}
          </span>
        </button>

        {/* Tab 5: Ajustes */}
        <button
          type="button"
          aria-label={syncMessages.nav.ajustes}
          aria-current={activeTab === "ajustes" ? "page" : undefined}
          onClick={() => onSelectTab("ajustes")}
          className={`min-h-[44px] flex flex-col items-center justify-center cursor-pointer transition ${
            activeTab === "ajustes"
              ? "text-brand-action"
              : "text-ink-secondary hover:text-ink-primary"
          }`}
        >
          <svg
            aria-hidden="true"
            className="w-6 h-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.8"
            />
            <path
              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.8"
            />
          </svg>
          <span
            className={`text-ios-caption-2 mt-1 tracking-tight ${
              activeTab === "ajustes" ? "font-semibold" : "font-medium"
            }`}
          >
            {syncMessages.nav.ajustes}
          </span>
        </button>
      </nav>
    </footer>
  );
}
