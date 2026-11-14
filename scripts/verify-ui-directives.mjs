#!/usr/bin/env node
// ==============================================================================
// CampusUNSA — Static UI Directives Verification Gate
// Validates compliance with AGENTS.md Section 3.2 (Frontend Presentation Directives)
// ==============================================================================

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const frontendSrc = path.join(rootDir, "frontend", "src");

let violations = 0;

function reportViolation(file, lineNum, rule, message) {
  const relPath = path.relative(rootDir, file);
  console.error(`  [FAIL] ${relPath}:${lineNum} [${rule}] ${message}`);
  violations++;
}

function scanDirectory(dir, filter, callback) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "node_modules" && entry.name !== ".next") {
        scanDirectory(fullPath, filter, callback);
      }
    } else if (filter(entry.name)) {
      callback(fullPath);
    }
  }
}

console.log("==> [UI Directives Gate] Scanning frontend/src against AGENTS.md Section 3.2...");

// Rule 3.2.2.1: Prohibited Floating Shadow Classes on components
// (shadow-md, shadow-lg, shadow-xl, shadow-2xl prohibited on cards/rows)
const SHADOW_REGEX = /\bshadow-(md|lg|xl|2xl)\b/;

// Rule 3.2.4: Prohibited Web Font imports (Inter, Roboto, Google Fonts)
const FONT_IMPORT_REGEX = /(from\s+['"]next\/font\/google['"]|@import\s+url\(['"]https:\/\/fonts\.googleapis\.com)/;

// Rule 3.2.2.4: Prohibited Fake Status Bar (hardcoded 9:41 clock or fake mobile status drawings)
const FAKE_STATUS_REGEX = /\b(9:41|status-bar-battery|fake-status-bar)\b/i;

// Rule 3.2.3: Prohibited off-palette Tailwind color scale classes and arbitrary hex classes
const OFF_PALETTE_SCALE_REGEX =
  /\b(bg|text|border)-(emerald|red|blue|amber|green|yellow|purple|pink|indigo|teal|cyan|orange|slate|zinc|gray|neutral)-\d+/;
const ARBITRARY_HEX_CLASS_REGEX =
  /(?:bg|text|border|ring|placeholder)-\[(#[0-9A-Fa-f]{3,8})\]/g;
const APPROVED_HEX_TOKENS = new Set([
  "#F2F2F7",
  "#000000",
  "#FFFFFF",
  "#1C1C1E",
  "#8B0000",
  "#E5575B",
  "#FF3B30",
  "#FF453A",
  "#FFCC00",
  "#FFD60A",
  "#34C759",
  "#30D158",
  "#E5E5EA",
  "#DADCE0",
]);

scanDirectory(
  frontendSrc,
  (name) => /\.(tsx|jsx|css)$/.test(name) && !name.includes(".test."),
  (filePath) => {
    const content = fs.readFileSync(filePath, "utf-8");
    const lines = content.split("\n");
    const isComponent = filePath.includes("/components/");

    lines.forEach((line, idx) => {
      const lineNum = idx + 1;

      // Check opt-out (must carry a non-empty trailing reason per Section 3.2.10)
      if (line.includes("// ui-gate-ignore:")) {
        if (!/\/\/\s*ui-gate-ignore:\s*\S+/.test(line)) {
          reportViolation(
            filePath,
            lineNum,
            "Rule-3.2.10",
            "Unexplained ui-gate-ignore opt-out detected. Provide a trailing reason."
          );
        }
        return;
      }

      // 1. Check prohibited shadows in components (no broad component exemptions)
      if (isComponent && SHADOW_REGEX.test(line)) {
        reportViolation(
          filePath,
          lineNum,
          "Rule-3.2.2.1",
          "Prohibited floating shadow class detected. Use inset lists with hairline borders instead."
        );
      }

      // 2. Check prohibited off-palette color classes and arbitrary hex literals in components
      if (isComponent) {
        if (OFF_PALETTE_SCALE_REGEX.test(line)) {
          reportViolation(
            filePath,
            lineNum,
            "Rule-3.2.3",
            "Off-palette Tailwind color scale class detected. Use Section 3.2.3 design tokens."
          );
        }
        for (const match of line.matchAll(ARBITRARY_HEX_CLASS_REGEX)) {
          const hex = match[1].toUpperCase();
          if (!APPROVED_HEX_TOKENS.has(hex)) {
            reportViolation(
              filePath,
              lineNum,
              "Rule-3.2.3",
              `Off-palette arbitrary hex token ${hex} detected. Use Section 3.2.3 design tokens.`
            );
          }
        }
      }

      // 3. Check prohibited web fonts
      if (FONT_IMPORT_REGEX.test(line)) {
        reportViolation(
          filePath,
          lineNum,
          "Rule-3.2.4",
          "Prohibited web font import detected. Use native Apple system font stack."
        );
      }

      // 4. Check fake status bars
      if (FAKE_STATUS_REGEX.test(line)) {
        reportViolation(
          filePath,
          lineNum,
          "Rule-3.2.2.4",
          "Prohibited fake status bar markup detected. Use safeAreas and system status bar."
        );
      }
    });
  }
);

if (violations > 0) {
  console.error(`\n[UI Directives Gate] FAILED: ${violations} violation(s) detected.`);
  console.error("Refer to AGENTS.md Section 3.2 for presentation and styling constraints.");
  process.exit(1);
} else {
  console.log("==> [UI Directives Gate] PASSED: All frontend components comply with Section 3.2.");
  process.exit(0);
}
