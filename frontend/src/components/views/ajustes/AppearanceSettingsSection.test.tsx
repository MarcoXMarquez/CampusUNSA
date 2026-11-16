import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AppearanceSettingsSection } from "./AppearanceSettingsSection";
import {
  LIQUID_GLASS_STORAGE_KEY,
  resetLiquidGlassIntensity,
} from "@/lib/liquid-glass-tuning";

describe("AppearanceSettingsSection Liquid Glass intensity slider", () => {
  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    resetLiquidGlassIntensity();
  });

  it("renders slider defaulting to 50% and updates CSS tokens and persistence on change", () => {
    render(<AppearanceSettingsSection />);

    const slider = screen.getByRole("slider", {
      name: "Intensidad de Liquid Glass",
    }) as HTMLInputElement;

    expect(slider.value).toBe("50");
    expect(screen.getByText("50%")).toBeDefined();

    fireEvent.change(slider, { target: { value: "100" } });
    expect(slider.value).toBe("100");
    expect(screen.getByText("100%")).toBeDefined();
    expect(window.localStorage.getItem(LIQUID_GLASS_STORAGE_KEY)).toBe("100");
    expect(document.documentElement.style.getPropertyValue("--lg-dock-opacity")).toBe("0.32");

    const resetBtn = screen.getByRole("button", { name: "Restablecer" });
    fireEvent.click(resetBtn);
    expect(slider.value).toBe("50");
    expect(window.localStorage.getItem(LIQUID_GLASS_STORAGE_KEY)).toBeNull();
  });
});
