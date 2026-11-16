/**
 * Spanish (es-PE) user-facing copy for the Appearance settings section.
 */
export const appearanceMessages = {
  sectionTitle: "Apariencia",
  liquidGlassTitle: "Intensidad de Liquid Glass",
  liquidGlassAria: "Intensidad de Liquid Glass",
  liquidGlassDescription:
    "Ajusta el equilibrio entre transparencia líquida y legibilidad esmerilada de la barra.",
  minLabel: "Esmerilado",
  midLabel: "Equilibrado",
  maxLabel: "Cristalino",
  resetAction: "Restablecer",
  levelLabel: (intensity: number): string => {
    if (intensity <= 20) return "Esmerilado";
    if (intensity >= 80) return "Cristalino";
    if (intensity === 50) return "Equilibrado";
    return "Personalizado";
  },
} as const;
