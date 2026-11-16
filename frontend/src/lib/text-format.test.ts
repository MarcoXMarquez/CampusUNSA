import { describe, expect, it } from "vitest";
import { formatAcademicTitle } from "./text-format";

describe("formatAcademicTitle", () => {
  it("converts ALL CAPS Spanish course titles into Smart Title Case with lowercase connectors", () => {
    expect(formatAcademicTitle("DESARROLLO DE SOFTWARE PARA JUEGOS (E)")).toBe(
      "Desarrollo de Software para Juegos (E)"
    );
    expect(formatAcademicTitle("ESTRUCTURA DE DATOS Y ALGORITMOS")).toBe(
      "Estructura de Datos y Algoritmos"
    );
    expect(formatAcademicTitle("INTRODUCCION A LA COMPUTACION")).toBe(
      "Introduccion a la Computacion"
    );
    expect(formatAcademicTitle("TECNOLOGIAS DE INFORMACION")).toBe(
      "Tecnologias de Informacion"
    );
  });

  it("preserves Roman numerals and technical acronyms", () => {
    expect(formatAcademicTitle("PROGRAMACION WEB II")).toBe("Programacion Web II");
    expect(formatAcademicTitle("INFORME DE CALIDAD ISO 25010")).toBe(
      "Informe de Calidad ISO 25010"
    );
    expect(formatAcademicTitle("DISENO DE BASE DE DATOS SQL Y NOSQL")).toBe(
      "Diseno de Base de Datos SQL y NoSQL"
    );
    expect(formatAcademicTitle("TALLER DE DEVOPS Y API REST")).toBe(
      "Taller de DevOps y API REST"
    );
  });

  it("capitalizes words after separators like colons or hyphens", () => {
    expect(formatAcademicTitle("PROYECTO: FASE 1 - DISENO DE LA ARQUITECTURA")).toBe(
      "Proyecto: Fase 1 - Diseno de la Arquitectura"
    );
  });

  it("leaves already mixed-case titles untouched", () => {
    expect(formatAcademicTitle("Implementar API REST en FastAPI")).toBe(
      "Implementar API REST en FastAPI"
    );
    expect(formatAcademicTitle("Quiz 2 - Diagramas UML")).toBe("Quiz 2 - Diagramas UML");
    expect(formatAcademicTitle("Negocios Electrónicos (E)")).toBe(
      "Negocios Electrónicos (E)"
    );
  });

  it("handles empty or whitespace-only inputs safely", () => {
    expect(formatAcademicTitle("")).toBe("");
    expect(formatAcademicTitle("   ")).toBe("");
  });
});
