export interface LiquidGlassDockParams {
  opacity: number;
  blur: number;
  saturate: number;
  refractionScale: number;
  baseFrequency: number;
  borderOpacity: number;
  highlightOpacity: number;
}

export interface LiquidGlassIntensityChangeDetail {
  intensity: number;
  params: LiquidGlassDockParams;
}

export const DEFAULT_LIQUID_GLASS_INTENSITY = 50;
export const FIXED_DOCK_BASE_FREQUENCY = 0.02;
export const DEFAULT_DOCK_REFRACTION_SCALE = 10;
export const LG_TUNING_EVENT = "campus-lg-tuning-change";
export const LIQUID_GLASS_STORAGE_KEY = "campusunsa_liquid_glass_intensity";

interface AnchorStop {
  opacity: number;
  blur: number;
  saturate: number;
  refractionScale: number;
  borderOpacity: number;
  highlightOpacity: number;
}

const DARK_ANCHORS: readonly [AnchorStop, AnchorStop, AnchorStop] = [
  // 0%: Frosted / high legibility
  {
    opacity: 0.96,
    blur: 16,
    saturate: 100,
    refractionScale: 0,
    borderOpacity: 0.06,
    highlightOpacity: 0.06,
  },
  // 50%: Calibrated user default
  {
    opacity: 0.9,
    blur: 12,
    saturate: 180,
    refractionScale: 10,
    borderOpacity: 0.1,
    highlightOpacity: 0.24,
  },
  // 100%: Maximum liquid-glass clarity and refraction
  {
    opacity: 0.7,
    blur: 8,
    saturate: 220,
    refractionScale: 18,
    borderOpacity: 0.18,
    highlightOpacity: 0.36,
  },
];

const LIGHT_ANCHORS: readonly [AnchorStop, AnchorStop, AnchorStop] = [
  // 0%: Frosted / high legibility on bright surfaces
  {
    opacity: 0.88,
    blur: 14,
    saturate: 110,
    refractionScale: 0,
    borderOpacity: 0.72,
    highlightOpacity: 0.55,
  },
  // 50%: Crisp translucent light glass showing subtle background depth & refraction
  {
    opacity: 0.58,
    blur: 8,
    saturate: 190,
    refractionScale: 12,
    borderOpacity: 0.85,
    highlightOpacity: 0.92,
  },
  // 100%: Maximum liquid-glass clarity and refraction
  {
    opacity: 0.32,
    blur: 5,
    saturate: 220,
    refractionScale: 18,
    borderOpacity: 0.95,
    highlightOpacity: 0.98,
  },
];

function lerp(start: number, end: number, t: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round((start + (end - start) * t) * factor) / factor;
}

/**
 * Clamps liquid glass intensity to an integer within [0, 100].
 */
export function clampLiquidGlassIntensity(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_LIQUID_GLASS_INTENSITY;
  }
  return Math.min(100, Math.max(0, Math.round(value)));
}

/**
 * Computes coupled optical CSS and SVG filter parameters from intensity [0..100].
 * Anchors 0% -> 50% -> 100% piecewise linearly while keeping baseFrequency fixed.
 */
export function computeLiquidGlassDockParams(
  intensity: number,
  isDark: boolean
): LiquidGlassDockParams {
  const clamped = clampLiquidGlassIntensity(intensity);
  const [low, mid, high] = isDark ? DARK_ANCHORS : LIGHT_ANCHORS;
  const from = clamped <= 50 ? low : mid;
  const to = clamped <= 50 ? mid : high;
  const t = clamped <= 50 ? clamped / 50 : (clamped - 50) / 50;

  return {
    opacity: lerp(from.opacity, to.opacity, t, 2),
    blur: lerp(from.blur, to.blur, t, 1),
    saturate: lerp(from.saturate, to.saturate, t, 0),
    refractionScale: lerp(from.refractionScale, to.refractionScale, t, 1),
    baseFrequency: FIXED_DOCK_BASE_FREQUENCY,
    borderOpacity: lerp(from.borderOpacity, to.borderOpacity, t, 2),
    highlightOpacity: lerp(from.highlightOpacity, to.highlightOpacity, t, 2),
  };
}

/**
 * Detects whether the OS prefers dark color scheme.
 */
export function detectDarkColorScheme(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) {
    return false;
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/**
 * Loads persisted liquid glass intensity percentage or returns the 50% default.
 */
export function loadLiquidGlassIntensity(): number {
  if (typeof window === "undefined") {
    return DEFAULT_LIQUID_GLASS_INTENSITY;
  }
  try {
    const raw = window.localStorage.getItem(LIQUID_GLASS_STORAGE_KEY);
    if (raw === null) {
      return DEFAULT_LIQUID_GLASS_INTENSITY;
    }
    return clampLiquidGlassIntensity(Number(raw));
  } catch {
    return DEFAULT_LIQUID_GLASS_INTENSITY;
  }
}

function writeDockCssProperties(params: LiquidGlassDockParams): void {
  if (typeof document === "undefined") {
    return;
  }
  const root = document.documentElement;
  const fallbackBlur = Math.round(params.blur * (20 / 12));
  root.style.setProperty("--lg-dock-opacity", String(params.opacity));
  root.style.setProperty("--lg-dock-blur", `${params.blur}px`);
  root.style.setProperty("--lg-dock-blur-fallback", `${fallbackBlur}px`);
  root.style.setProperty("--lg-dock-saturate", `${params.saturate}%`);
  root.style.setProperty("--lg-dock-border", `255 255 255 / ${params.borderOpacity}`);
  root.style.setProperty(
    "--lg-dock-highlight",
    `255 255 255 / ${params.highlightOpacity}`
  );
}

/**
 * Applies a liquid-glass intensity level to document CSS tokens, persists it, and notifies listeners.
 */
export function applyLiquidGlassIntensity(
  intensity: number,
  persist = true
): LiquidGlassDockParams {
  const clamped = clampLiquidGlassIntensity(intensity);
  const params = computeLiquidGlassDockParams(clamped, detectDarkColorScheme());
  writeDockCssProperties(params);

  if (persist && typeof window !== "undefined") {
    try {
      window.localStorage.setItem(LIQUID_GLASS_STORAGE_KEY, String(clamped));
    } catch {
      // Ignore storage quota errors
    }
  }

  if (typeof window !== "undefined") {
    const detail: LiquidGlassIntensityChangeDetail = {
      intensity: clamped,
      params,
    };
    window.dispatchEvent(new CustomEvent(LG_TUNING_EVENT, { detail }));
  }

  return params;
}

/**
 * Resets custom inline overrides and stored intensity back to the 50% CSS baseline.
 */
export function resetLiquidGlassIntensity(): LiquidGlassDockParams {
  const params = computeLiquidGlassDockParams(
    DEFAULT_LIQUID_GLASS_INTENSITY,
    detectDarkColorScheme()
  );

  if (typeof document !== "undefined") {
    const root = document.documentElement;
    root.style.removeProperty("--lg-dock-opacity");
    root.style.removeProperty("--lg-dock-blur");
    root.style.removeProperty("--lg-dock-blur-fallback");
    root.style.removeProperty("--lg-dock-saturate");
    root.style.removeProperty("--lg-dock-border");
    root.style.removeProperty("--lg-dock-highlight");
  }

  if (typeof window !== "undefined") {
    try {
      window.localStorage.removeItem(LIQUID_GLASS_STORAGE_KEY);
    } catch {
      // Ignore storage removal errors
    }
    const detail: LiquidGlassIntensityChangeDetail = {
      intensity: DEFAULT_LIQUID_GLASS_INTENSITY,
      params,
    };
    window.dispatchEvent(new CustomEvent(LG_TUNING_EVENT, { detail }));
  }

  return params;
}
