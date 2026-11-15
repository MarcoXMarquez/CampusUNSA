#!/usr/bin/env python3
"""
CampusUNSA Wiki Validator and Quality Oracle
Enforces:
1. Zero-Emoji policy across all wiki pages.
2. Relative wiki link integrity ([[Page-Name]] or [[Label|Page-Name]]).
3. Mermaid diagram block syntax validation.
4. Essential file existence (Home.md, _Sidebar.md).
"""

import os
import sys
import re
import glob
import unicodedata
from typing import List, Tuple, Set


def check_zero_emojis(file_path: str) -> List[Tuple[int, str, str]]:
    """Scan file for unicode emoji ranges. Return list of (line_num, char, codepoint)."""
    violations = []
    with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
        for line_num, line in enumerate(f, 1):
            for ch in line:
                cp = ord(ch)
                if (
                    0x1F300 <= cp <= 0x1F9FF
                    or 0x2600 <= cp <= 0x26FF
                    or 0x2700 <= cp <= 0x27BF
                    or 0x1F600 <= cp <= 0x1F64F
                    or 0x1F680 <= cp <= 0x1F6FF
                    or 0x1FA00 <= cp <= 0x1FAFF
                ):
                    violations.append((line_num, ch, f"U+{cp:X}"))
    return violations


def extract_wiki_links(content: str) -> List[str]:
    """Extract target page names from [[Target]] or [[Label|Target]] or [Label](Target)."""
    bracket_links = re.findall(r"\[\[(.*?)\]\]", content)
    targets = []
    for link in bracket_links:
        if "|" in link:
            # Format: [[Label|Target]]
            parts = link.split("|")
            targets.append(parts[1].strip())
        else:
            targets.append(link.strip())
    return targets


def validate_mermaid_blocks(content: str) -> List[Tuple[int, str]]:
    """Verify that mermaid blocks specify valid diagram types and have matching fences."""
    errors = []
    lines = content.splitlines()
    in_mermaid = False
    start_line = 0
    diagram_type_found = False
    valid_types = {
        "sequencediagram",
        "flowchart",
        "graph",
        "statediagram",
        "statediagram-v2",
        "classdiagram",
        "erdiagram",
    }

    for i, line in enumerate(lines, 1):
        stripped = line.strip()
        if stripped == "```mermaid":
            in_mermaid = True
            start_line = i
            diagram_type_found = False
            continue
        if in_mermaid:
            if stripped == "```":
                in_mermaid = False
                if not diagram_type_found:
                    errors.append(
                        (start_line, "Mermaid block ended without a recognized diagram type definition.")
                    )
                continue
            # Look for diagram type or title header
            clean = stripped.lower()
            if clean.startswith("---") or clean.startswith("title:"):
                continue
            first_word = clean.split()[0] if clean.split() else ""
            if any(first_word.startswith(t) for t in valid_types):
                diagram_type_found = True

    if in_mermaid:
        errors.append((start_line, "Unclosed mermaid code block at end of file."))
    return errors


def run_validation(wiki_dir: str) -> bool:
    """Execute complete validation suite on the given wiki directory."""
    print("=" * 65)
    print(f" CampusUNSA: Running Wiki Validation Oracle on '{wiki_dir}'")
    print("=" * 65)

    if not os.path.isdir(wiki_dir):
        print(f"FAILED: Wiki directory '{wiki_dir}' does not exist.")
        return False

    all_passed = True
    md_files = glob.glob(os.path.join(wiki_dir, "**/*.md"), recursive=True)
    if not md_files:
        print(f"FAILED: No Markdown files found in '{wiki_dir}'.")
        return False

    print(f"Auditing {len(md_files)} Markdown files...")

    # 1. Essential Pages Check
    essential_pages = ["Home.md", "_Sidebar.md"]
    for ep in essential_pages:
        target = os.path.join(wiki_dir, ep)
        if not os.path.exists(target):
            print(f"  [FAIL] Missing essential wiki file: {ep}")
            all_passed = False
        else:
            print(f"  [PASS] Essential file present: {ep}")

    # Build known page registry for link validation
    known_pages: Set[str] = set()
    for f in md_files:
        base = os.path.splitext(os.path.basename(f))[0]
        known_pages.add(base.lower())

    # 2. Page-by-Page Audit
    emoji_fails = 0
    link_fails = 0
    mermaid_fails = 0

    for f in md_files:
        rel_path = os.path.relpath(f, wiki_dir)
        
        # Check emojis
        emojis = check_zero_emojis(f)
        if emojis:
            emoji_fails += 1
            all_passed = False
            for line_num, ch, cp in emojis[:3]:
                print(f"  [FAIL-EMOJI] {rel_path}:{line_num} -> Detected {ch} ({cp})")

        with open(f, "r", encoding="utf-8", errors="ignore") as fh:
            content = fh.read()

        # Check Mermaid blocks
        mermaid_errs = validate_mermaid_blocks(content)
        if mermaid_errs:
            mermaid_fails += 1
            all_passed = False
            for line_num, msg in mermaid_errs:
                print(f"  [FAIL-MERMAID] {rel_path}:{line_num} -> {msg}")

        # Check Wiki Links
        links = extract_wiki_links(content)
        for target in links:
            # Skip external URLs or anchors
            if target.startswith("http://") or target.startswith("https://") or target.startswith("#"):
                continue
            clean_target = os.path.splitext(target)[0].lower()
            if clean_target not in known_pages:
                link_fails += 1
                all_passed = False
                print(f"  [FAIL-LINK] {rel_path} -> Target wiki page '[[{target}]]' does not exist.")

    print("-" * 65)
    print(f"Audit Summary: {len(md_files)} files evaluated.")
    print(f"  Emoji Violations:    {emoji_fails}")
    print(f"  Broken Wiki Links:   {link_fails}")
    print(f"  Mermaid Block Errors:{mermaid_fails}")

    if all_passed:
        print("RESULT: ALL WIKI QUALITY GATES PASSED (100% Oppia-Standard Clean).")
        print("=" * 65)
        return True
    else:
        print("RESULT: WIKI QUALITY GATES FAILED. Correct defects above.")
        print("=" * 65)
        return False


if __name__ == "__main__":
    target_directory = sys.argv[1] if len(sys.argv) > 1 else ".wiki_workspace"
    success = run_validation(target_directory)
    sys.exit(0 if success else 1)
