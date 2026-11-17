"use client";

import React, { useEffect } from "react";
import { CalendarDots, CheckSquare, GearSix, Plus, Robot } from "@phosphor-icons/react";
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
    return `min-h-[44px] h-[52px] mx-0.5 flex flex-col items-center justify-center cursor-pointer interactive-surface rounded-full transition-colors duration-200 ${
      isActive
        ? "text-brand-action"
        : "text-ink-secondary"
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
            <CheckSquare aria-hidden="true" className="w-6 h-6" weight={activeTab === "tareas" ? "fill" : "regular"} />
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
            <CalendarDots aria-hidden="true" className="w-6 h-6" weight={activeTab === "horario" ? "fill" : "regular"} />
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
              className="-translate-y-4 flex items-center justify-center w-14 h-14 rounded-full bg-brand-cta interactive-cta text-white border border-white/25 ring-1 ring-black/10 dark:ring-white/15 shadow-layer-fab transition-transform duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)] active:scale-95 cursor-pointer"
            >
              <Plus aria-hidden="true" className="w-6 h-6" weight="bold" />
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
            <Robot aria-hidden="true" className="w-6 h-6" weight={activeTab === "hugo" ? "fill" : "regular"} />
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
            <GearSix aria-hidden="true" className="w-6 h-6" weight={activeTab === "ajustes" ? "fill" : "regular"} />
            <span className={getTabLabelClass("ajustes")}>
              {syncMessages.nav.ajustes}
            </span>
          </button>
        </nav>
      </div>
    </footer>
  );
}
