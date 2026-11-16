import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyLiquidGlassIntensity,
  clampLiquidGlassIntensity,
  computeLiquidGlassDockParams,
  DEFAULT_LIQUID_GLASS_INTENSITY,
  FIXED_DOCK_BASE_FREQUENCY,
  LIQUID_GLASS_STORAGE_KEY,
  LG_TUNING_EVENT,
  loadLiquidGlassIntensity,
  resetLiquidGlassIntensity,
} from "./liquid-glass-tuning";

describe("liquid-glass-tuning intensity model", () => {
  afterEach(() => {
    window.localStorage.clear();
    resetLiquidGlassIntensity();
    vi.restoreAllMocks();
  });

  it("clamps invalid or out-of-range intensity values safely", () => {
    expect(clampLiquidGlassIntensity(-15)).toBe(0);
    expect(clampLiquidGlassIntensity(140)).toBe(100);
    expect(clampLiquidGlassIntensity(Number.NaN)).toBe(DEFAULT_LIQUID_GLASS_INTENSITY);
    expect(clampLiquidGlassIntensity(64.6)).toBe(65);
  });

  it("matches exact user-calibrated dark preset and derived light preset at 50%", () => {
    const darkMid = computeLiquidGlassDockParams(50, true);
    expect(darkMid).toEqual({
      opacity: 0.9,
      blur: 12,
      saturate: 180,
      refractionScale: 10,
      baseFrequency: FIXED_DOCK_BASE_FREQUENCY,
      borderOpacity: 0.1,
      highlightOpacity: 0.24,
    });

    const lightMid = computeLiquidGlassDockParams(50, false);
    expect(lightMid).toEqual({
      opacity: 0.58,
      blur: 8,
      saturate: 190,
      refractionScale: 12,
      baseFrequency: FIXED_DOCK_BASE_FREQUENCY,
      borderOpacity: 0.85,
      highlightOpacity: 0.92,
    });
  });

  it("interpolates cleanly between 0% frosted and 100% clear glass while keeping baseFrequency fixed", () => {
    const frostedDark = computeLiquidGlassDockParams(0, true);
    expect(frostedDark.opacity).toBe(0.96);
    expect(frostedDark.blur).toBe(16);
    expect(frostedDark.saturate).toBe(100);
    expect(frostedDark.refractionScale).toBe(0);
    expect(frostedDark.baseFrequency).toBe(0.02);

    const crystalDark = computeLiquidGlassDockParams(100, true);
    expect(crystalDark.opacity).toBe(0.7);
    expect(crystalDark.blur).toBe(8);
    expect(crystalDark.saturate).toBe(220);
    expect(crystalDark.refractionScale).toBe(18);
    expect(crystalDark.baseFrequency).toBe(0.02);

    const crystalLight = computeLiquidGlassDockParams(100, false);
    expect(crystalLight.opacity).toBe(0.32);
    expect(crystalLight.blur).toBe(5);
    expect(crystalLight.saturate).toBe(220);
    expect(crystalLight.refractionScale).toBe(18);
    expect(crystalLight.baseFrequency).toBe(0.02);
  });

  it("persists intensity, updates root CSS custom properties, and emits tuning events", () => {
    const listener = vi.fn();
    window.addEventListener(LG_TUNING_EVENT, listener);

    expect(loadLiquidGlassIntensity()).toBe(50);

    const params = applyLiquidGlassIntensity(100);
    expect(loadLiquidGlassIntensity()).toBe(100);
    expect(window.localStorage.getItem(LIQUID_GLASS_STORAGE_KEY)).toBe("100");
    expect(document.documentElement.style.getPropertyValue("--lg-dock-opacity")).toBe(
      String(params.opacity)
    );
    expect(document.documentElement.style.getPropertyValue("--lg-dock-blur")).toBe(
      "5px"
    );
    expect(document.documentElement.style.getPropertyValue("--lg-dock-saturate")).toBe(
      "220%"
    );
    expect(listener).toHaveBeenCalledTimes(1);

    resetLiquidGlassIntensity();
    expect(loadLiquidGlassIntensity()).toBe(50);
    expect(document.documentElement.style.getPropertyValue("--lg-dock-opacity")).toBe("");
    window.removeEventListener(LG_TUNING_EVENT, listener);
  });
});
