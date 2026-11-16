"use client";

import React, { useEffect, useState } from "react";
import {
  computeLiquidGlassDockParams,
  DEFAULT_DOCK_REFRACTION_SCALE,
  detectDarkColorScheme,
  FIXED_DOCK_BASE_FREQUENCY,
  LG_TUNING_EVENT,
  loadLiquidGlassIntensity,
  type LiquidGlassIntensityChangeDetail,
} from "@/lib/liquid-glass-tuning";

const PEAK_BASE_FREQUENCY = Number((FIXED_DOCK_BASE_FREQUENCY * 1.45).toFixed(4));

/**
 * Hidden SVG displacement filter powering subtle liquid-glass backdrop refraction.
 * Optical technique adapted from dpawlikowski/liquid-glass (MIT License).
 */
export function LiquidGlassDockFilter(): React.JSX.Element {
  const [reducedMotion, setReducedMotion] = useState<boolean>(false);
  const [scale, setScale] = useState<number>(DEFAULT_DOCK_REFRACTION_SCALE);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const initialIntensity = loadLiquidGlassIntensity();
    const initialParams = computeLiquidGlassDockParams(
      initialIntensity,
      detectDarkColorScheme()
    );
    setScale(initialParams.refractionScale);

    const onTuningChange = (event: Event) => {
      const detail = (
        event as CustomEvent<LiquidGlassIntensityChangeDetail | null>
      ).detail;
      setScale(
        detail ? detail.params.refractionScale : DEFAULT_DOCK_REFRACTION_SCALE
      );
    };
    window.addEventListener(LG_TUNING_EVENT, onTuningChange);

    if (!window.matchMedia) {
      return () => window.removeEventListener(LG_TUNING_EVENT, onTuningChange);
    }
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);

    const onChange = (event: MediaQueryListEvent) => {
      setReducedMotion(event.matches);
    };
    mq.addEventListener?.("change", onChange);
    return () => {
      mq.removeEventListener?.("change", onChange);
      window.removeEventListener(LG_TUNING_EVENT, onTuningChange);
    };
  }, []);

  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width="0"
      height="0"
      className="liquid-glass-filter-root hidden"
    >
      <filter
        id="campus-liquid-glass-dock"
        x="-20%"
        y="-20%"
        width="140%"
        height="140%"
        colorInterpolationFilters="sRGB"
      >
        <feTurbulence
          type="fractalNoise"
          baseFrequency={String(FIXED_DOCK_BASE_FREQUENCY)}
          numOctaves={2}
          seed={7}
          result="noise"
        >
          {!reducedMotion && (
            <animate
              attributeName="baseFrequency"
              dur="9s"
              values={`${FIXED_DOCK_BASE_FREQUENCY};${PEAK_BASE_FREQUENCY};${FIXED_DOCK_BASE_FREQUENCY}`}
              repeatCount="indefinite"
            />
          )}
        </feTurbulence>
        <feDisplacementMap
          in="SourceGraphic"
          in2="noise"
          scale={scale}
          xChannelSelector="R"
          yChannelSelector="G"
        />
      </filter>
    </svg>
  );
}
