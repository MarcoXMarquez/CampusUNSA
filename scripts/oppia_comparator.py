#!/usr/bin/env python3
"""
CampusUNSA Oppia Wiki Parity Oracle
Compares CampusUNSA Wiki pages against the structural standards of Oppia Wiki
(inspected in wikis/oppia.wiki/).
Calculates an Oppia Parity Score (0-100%) based on structural criteria.
"""

import os
import sys
import re
from typing import Dict, Any


def evaluate_oppia_parity(page_path: str) -> Dict[str, Any]:
    """Evaluate a markdown file against Oppia structural standards."""
    if not os.path.isfile(page_path):
        return {"error": f"File '{page_path}' not found."}

    with open(page_path, "r", encoding="utf-8", errors="ignore") as f:
        content = f.read()

    lines = content.splitlines()
    words = len(content.split())
    has_toc = bool(re.search(r"##\s+Table of Contents", content, re.IGNORECASE))
    has_mermaid = "```mermaid" in content
    has_sequence = bool(re.search(r"sequenceDiagram", content, re.IGNORECASE))
    has_flowchart = bool(re.search(r"flowchart|graph\s+(TD|LR)", content, re.IGNORECASE))
    has_layered = bool(re.search(r"layer|controller|storage|service", content, re.IGNORECASE))
    has_testing = bool(re.search(r"test|pytest|vitest|coverage", content, re.IGNORECASE))
    has_callouts = bool(re.search(r">\s*\[!(NOTE|TIP|IMPORTANT|WARNING)\]", content))
    has_code_blocks = len(re.findall(r"```[a-zA-Z]+", content)) >= 1
    has_tables = len(re.findall(r"\|.*\|.*\|", content)) >= 3

    score = 0
    checks = []

    # 1. Structural Framing (20 pts)
    if has_toc:
        score += 15
        checks.append("[PASS] Table of Contents present (+15)")
    else:
        checks.append("[FAIL] Missing '## Table of Contents' (0/15)")

    if words >= 300:
        score += 10
        checks.append(f"[PASS] Substantive content depth ({words} words) (+10)")
    else:
        checks.append(f"[WARN] Sparse content ({words} words < 300) (0/10)")

    # 2. Visual Architecture & Mermaid (25 pts)
    if has_mermaid:
        score += 15
        if has_sequence:
            score += 10
            checks.append("[PASS] Mermaid sequence diagram modeling request flow (+25)")
        elif has_flowchart:
            score += 7
            checks.append("[PASS] Mermaid flowchart diagram present (+22)")
        else:
            checks.append("[PASS] Mermaid diagram present (+15)")
    else:
        checks.append("[FAIL] No Mermaid architectural diagrams found (0/25)")

    # 3. Layered Design & Separation of Concerns (20 pts)
    if has_layered:
        score += 20
        checks.append("[PASS] Layered web server anatomy documented (+20)")
    else:
        checks.append("[FAIL] Missing layered controller/service/storage breakdown (0/20)")

    # 4. Actionable Testing & CLI Runbooks (15 pts)
    if has_testing:
        score += 15
        checks.append("[PASS] Automated test suites & verification runbooks included (+15)")
    else:
        checks.append("[FAIL] Missing testing verification guidelines (0/15)")

    # 5. Tables & Code Blocks (10 pts)
    if has_code_blocks and has_tables:
        score += 10
        checks.append("[PASS] Code snippets and structured data tables present (+10)")
    elif has_code_blocks or has_tables:
        score += 5
        checks.append("[WARN] Partial code blocks or tables (+5)")
    else:
        checks.append("[FAIL] Missing code blocks and data tables (0/10)")

    # 6. Professional Callouts (5 pts)
    if has_callouts:
        score += 5
        checks.append("[PASS] GitHub-style alert callouts (> [!NOTE]) present (+5)")
    else:
        checks.append("[INFO] Alert callout (> [!NOTE]) optional but recommended (0/5)")

    return {
        "file": page_path,
        "score": min(score, 100),
        "word_count": words,
        "checks": checks,
    }


def main():
    if len(sys.argv) < 2:
        print("Usage: python scripts/oppia_comparator.py <path_to_wiki_page.md>")
        sys.exit(1)

    target_file = sys.argv[1]
    res = evaluate_oppia_parity(target_file)
    if "error" in res:
        print(f"ERROR: {res['error']}")
        sys.exit(1)

    print("=" * 65)
    print(f" Oppia Parity Evaluation for: {os.path.basename(res['file'])}")
    print("=" * 65)
    for check in res["checks"]:
        print(f"  {check}")
    print("-" * 65)
    print(f"OPPIA STRUCTURAL PARITY SCORE: {res['score']}/100")
    if res["score"] >= 80:
        print("RESULT: Meets Oppia Quality Benchmark.")
    else:
        print("RESULT: Needs improvement to match Oppia standard.")
    print("=" * 65)
    sys.exit(0 if res["score"] >= 75 else 1)


if __name__ == "__main__":
    main()
