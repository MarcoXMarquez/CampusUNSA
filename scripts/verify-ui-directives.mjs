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

scanDirectory(
  frontendSrc,
  (name) => /\.(tsx|jsx|css)$/.test(name) && !name.includes(".test."),
  (filePath) => {
    const content = fs.readFileSync(filePath, "utf-8");
    const lines = content.split("\n");

    lines.forEach((line, idx) => {
      const lineNum = idx + 1;

      // Check opt-out
      if (line.includes("// ui-gate-ignore:")) {
        return;
      }

      // 1. Check prohibited shadows in components
      if (filePath.includes("/components/") && SHADOW_REGEX.test(line)) {
        // Exclude LoginModal and AuthFlow official Google button and card styles matching Stitch design
        const isAuthFlowExempt =
          filePath.endsWith("LoginModal.tsx") || filePath.endsWith("AuthFlow.tsx");
        if (!isAuthFlowExempt) {
          reportViolation(
            filePath,
            lineNum,
            "Rule-3.2.2.1",
            "Prohibited floating shadow class detected. Use inset lists with hairline borders instead."
          );
        }
      }

      // 2. Check prohibited web fonts
      if (FONT_IMPORT_REGEX.test(line)) {
        reportViolation(
          filePath,
          lineNum,
          "Rule-3.2.4",
          "Prohibited web font import detected. Use native Apple system font stack."
        );
      }

      // 3. Check fake status bars
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
