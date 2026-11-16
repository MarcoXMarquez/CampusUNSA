"use client";

import React, { useEffect } from "react";
import { taskSyncMessages as syncMessages } from "@/lib/messages/task-board-messages";
import {
  applyLiquidGlassIntensity,
  DEFAULT_LIQUID_GLASS_INTENSITY,
  loadLiquidGlassIntensity,
} from "@/lib/liquid-glass-tuning";
import { LiquidGlassDockFilter } from "./LiquidGlassDockFilter";

export type AppTab = "tareas" | "horario" | "hugo" | "ajustes";

export interface BottomTabBarProps {
  activeTab: AppTab;
  onSelectTab: (tab: AppTab) => void;
  onOpenNewTask: () => void;
}

/**
 * Floating iOS liquid-glass capsule bottom dock with elevated UNSA crimson task CTA.
 */
export function BottomTabBar({
  activeTab,
  onSelectTab,
  onOpenNewTask,
}: BottomTabBarProps): React.JSX.Element {
  useEffect(() => {
    const syncDockIntensity = () => {
      const saved = loadLiquidGlassIntensity();
      if (saved !== DEFAULT_LIQUID_GLASS_INTENSITY) {
        applyLiquidGlassIntensity(saved, false);
      }
    };

    syncDockIntensity();

    if (typeof window === "undefined" || !window.matchMedia) {
      return;
    }
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener?.("change", syncDockIntensity);
    return () => mq.removeEventListener?.("change", syncDockIntensity);
  }, []);
  const getTabButtonClass = (tab: AppTab): string => {
    const isActive = activeTab === tab;
    return `min-h-[44px] h-[52px] mx-0.5 flex flex-col items-center justify-center cursor-pointer transition-colors duration-200 ${
      isActive
        ? "text-brand-action"
        : "text-ink-secondary hover:text-ink-primary"
    }`;
  };

  const getTabLabelClass = (tab: AppTab): string =>
    `text-ios-caption-2 mt-0.5 tracking-tight transition-colors duration-200 ${
      activeTab === tab ? "font-semibold" : "font-medium"
    }`;

  return (
    <footer className="fixed bottom-0 inset-x-0 z-40 pointer-events-none px-4 pb-[calc(env(safe-area-inset-bottom)+10px)] flex justify-center safe-areas">
      <LiquidGlassDockFilter />

      <div className="relative pointer-events-auto w-full max-w-md h-[66px]">
        <div
          aria-hidden="true"
          className="liquid-glass-dock !absolute inset-0 rounded-full pointer-events-none"
        />

        <nav
          aria-label="Navegación principal"
          className="relative z-10 w-full h-full px-2 grid grid-cols-5 items-center"
        >
          {/* Tab 1: Tareas */}
          <button
            type="button"
            aria-label={syncMessages.nav.tareas}
            aria-current={activeTab === "tareas" ? "page" : undefined}
            onClick={() => onSelectTab("tareas")}
            className={getTabButtonClass("tareas")}
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
                strokeWidth="1.8"
              />
            </svg>
            <span className={getTabLabelClass("tareas")}>
              {syncMessages.nav.tareas}
            </span>
          </button>

          {/* Tab 2: Horario */}
          <button
            type="button"
            aria-label={syncMessages.nav.horario}
            aria-current={activeTab === "horario" ? "page" : undefined}
            onClick={() => onSelectTab("horario")}
            className={getTabButtonClass("horario")}
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
            <span className={getTabLabelClass("horario")}>
              {syncMessages.nav.horario}
            </span>
          </button>

          {/* Center Floating Action Button: + */}
          <div className="flex justify-center">
            <button
              type="button"
              aria-label={syncMessages.nav.newTaskAria}
              onClick={onOpenNewTask}
              className="-translate-y-4 flex items-center justify-center w-14 h-14 rounded-full bg-brand-cta hover:bg-brand-cta-hover text-white border border-white/25 ring-1 ring-black/10 dark:ring-white/15 shadow-lg shadow-black/25 dark:shadow-black/60 transition-transform duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)] active:scale-95 cursor-pointer"
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
            className={getTabButtonClass("hugo")}
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
                strokeWidth="1.6"
              />
            </svg>
            <span className={getTabLabelClass("hugo")}>
              {syncMessages.nav.hugo}
            </span>
          </button>

          {/* Tab 5: Ajustes */}
          <button
            type="button"
            aria-label={syncMessages.nav.ajustes}
            aria-current={activeTab === "ajustes" ? "page" : undefined}
            onClick={() => onSelectTab("ajustes")}
            className={getTabButtonClass("ajustes")}
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
            <span className={getTabLabelClass("ajustes")}>
              {syncMessages.nav.ajustes}
            </span>
          </button>
        </nav>
      </div>
    </footer>
  );
}
