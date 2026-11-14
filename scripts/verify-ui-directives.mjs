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

console.log("==> [UI Engineering Gate] Scanning frontend/src against Stitch-First directives in AGENTS.md Section 3.2...");

// Rule 3.2.3.1: Prohibited direct process.env.NEXT_PUBLIC_* reads in UI components
const DIRECT_ENV_REGEX = /\bprocess\.env\.NEXT_PUBLIC_/;

// Rule 3.2.3.2: Prohibited Fake Status Bar (hardcoded 9:41 clock or fake mobile status drawings)
const FAKE_STATUS_REGEX = /\b(9:41|status-bar-battery|fake-status-bar)\b/i;

// Rule 3.2.3.3: Prohibited Web Font imports (Inter, Roboto, Google Fonts)
const FONT_IMPORT_REGEX = /(from\s+['"]next\/font\/google['"]|@import\s+url\(['"]https:\/\/fonts\.googleapis\.com)/;

scanDirectory(
  frontendSrc,
  (name) => /\.(tsx|jsx|css)$/.test(name) && !name.includes(".test."),
  (filePath) => {
    const content = fs.readFileSync(filePath, "utf-8");
    const lines = content.split("\n");
    const isComponent = filePath.includes("/components/");

    lines.forEach((line, idx) => {
      const lineNum = idx + 1;

      // Check opt-out (must carry a non-empty trailing reason per Section 3.2.4)
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

      // 1. Check direct process.env.NEXT_PUBLIC_* reads inside components
      if (isComponent && DIRECT_ENV_REGEX.test(line)) {
        reportViolation(
          filePath,
          lineNum,
          "Rule-3.2.3.1",
          "Direct process.env.NEXT_PUBLIC_* read in component. Use frontend/src/lib/api-client.ts helpers instead."
        );
      }

      // 2. Check fake status bars
      if (FAKE_STATUS_REGEX.test(line)) {
        reportViolation(
          filePath,
          lineNum,
          "Rule-3.2.3.2",
          "Prohibited fake status bar markup detected. Use safeAreas and system status bar."
        );
      }

      // 3. Check prohibited network web fonts
      if (FONT_IMPORT_REGEX.test(line)) {
        reportViolation(
          filePath,
          lineNum,
          "Rule-3.2.3.3",
          "Prohibited network web font import detected. Use system font stack for offline PWA resilience."
        );
      }
    });
  }
);

if (violations > 0) {
  console.error(`\n[UI Engineering Gate] FAILED: ${violations} violation(s) detected.`);
  console.error("Refer to AGENTS.md Section 3.2 for Stitch-First frontend engineering constraints.");
  process.exit(1);
} else {
  console.log("==> [UI Engineering Gate] PASSED: All frontend components comply with Stitch-First engineering standards.");
  process.exit(0);
}
