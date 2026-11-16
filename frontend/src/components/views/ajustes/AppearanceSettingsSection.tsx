"use client";

import React, { useEffect, useState } from "react";
import { BlockTitle, List } from "konsta/react";
import {
  applyLiquidGlassIntensity,
  DEFAULT_LIQUID_GLASS_INTENSITY,
  loadLiquidGlassIntensity,
  resetLiquidGlassIntensity,
} from "@/lib/liquid-glass-tuning";
import { appearanceMessages } from "@/lib/messages/appearance-messages";

/**
 * Appearance settings section featuring the Apple-style Liquid Glass intensity slider.
 */
export function AppearanceSettingsSection(): React.JSX.Element {
  const [intensity, setIntensity] = useState<number>(DEFAULT_LIQUID_GLASS_INTENSITY);

  useEffect(() => {
    const saved = loadLiquidGlassIntensity();
    setIntensity(saved);
    if (saved !== DEFAULT_LIQUID_GLASS_INTENSITY) {
      applyLiquidGlassIntensity(saved, false);
    }
  }, []);

  const handleIntensityChange = (nextValue: number) => {
    setIntensity(nextValue);
    applyLiquidGlassIntensity(nextValue, true);
  };

  const handleReset = () => {
    setIntensity(DEFAULT_LIQUID_GLASS_INTENSITY);
    resetLiquidGlassIntensity();
  };

  return (
    <>
      <BlockTitle>{appearanceMessages.sectionTitle}</BlockTitle>
      <List strong inset className="my-0">
        <div className="px-4 py-3.5 space-y-2.5">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-ios-body font-medium text-ink-primary">
                {appearanceMessages.liquidGlassTitle}
              </p>
              <p className="text-ios-footnote text-ink-secondary">
                {appearanceMessages.liquidGlassDescription}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <span className="text-ios-subhead font-semibold text-brand-action tabular-nums">
                {intensity}%
              </span>
              <p className="text-ios-caption-2 text-ink-secondary">
                {appearanceMessages.levelLabel(intensity)}
              </p>
            </div>
          </div>

          <input
            type="range"
            aria-label={appearanceMessages.liquidGlassAria}
            min={0}
            max={100}
            step={1}
            value={intensity}
            onChange={(e) => handleIntensityChange(Number(e.target.value))}
            className="w-full h-1.5 rounded-full bg-surface-inset accent-brand-action cursor-pointer"
          />

          <div className="flex items-center justify-between text-ios-caption-2 text-ink-secondary">
            <span>{appearanceMessages.minLabel}</span>
            <span>{appearanceMessages.midLabel} (50%)</span>
            <span>{appearanceMessages.maxLabel}</span>
          </div>

          {intensity !== DEFAULT_LIQUID_GLASS_INTENSITY && (
            <div className="pt-1 flex justify-end">
              <button
                type="button"
                onClick={handleReset}
                className="min-h-[36px] px-2 text-ios-footnote font-medium text-brand-action hover:underline cursor-pointer"
              >
                {appearanceMessages.resetAction}
              </button>
            </div>
          )}
        </div>
      </List>
    </>
  );
}
