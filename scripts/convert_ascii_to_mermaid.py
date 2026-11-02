#!/usr/bin/env python3
"""
Convert ASCII box diagrams to native Mermaid flowchart TD blocks across wiki files.
"""

import glob
import re
import os
import sys

def convert_file(file_path: str) -> bool:
    with open(file_path, "r", encoding="utf-8") as f:
        content = f.read()

    if "+---" not in content:
        return False

    if "Offline-Resilience-and-IndexedDB.md" in file_path:
        mermaid_block = """```mermaid
flowchart TD
    subgraph ClientTier["Client Tier (Student Mobile / Browser PWA)"]
        direction LR
        CacheStorage["<b>Cache Storage (Workbox)</b><br/>• Static HTML, CSS, JS"]
        IndexedDBStore["<b>IndexedDB Store (CampusUNSA_DB)</b><br/>• Courses, Assignments, Outbox Sync Queue"]
    end

    subgraph ServerTier["Server Tier (Containerized Backend Stack)"]
        direction LR
        RedisCache["<b>Redis 7 In-Memory Cache</b><br/>• 15m Schedule TTL Cache"]
        PostgresDB["<b>PostgreSQL 16 Relational ACID Database</b><br/>• Authoritative Users, Assignments, Tickets"]
    end

    ClientTier -->|"Network Transport (HTTPS / Sync Worker)"| ServerTier
```"""
        new_content = re.sub(r"```(?:\w+)?\n[\s\S]*?\+---[\s\S]*?```", mermaid_block, content, count=1)
        with open(file_path, "w", encoding="utf-8") as f:
            f.write(new_content)
        return True

    m = re.search(r"```(?:\w+)?\n([\s\S]*?\+---[\s\S]*?)```", content)
    if not m:
        return False

    ascii_block = m.group(1)
    boxes = []
    current_box = []
    in_box = False

    for line in ascii_block.strip().splitlines():
        s = line.strip()
        if s.startswith("+---"):
            if in_box:
                if current_box:
                    boxes.append(current_box)
                    current_box = []
                in_box = False
            else:
                in_box = True
        elif s.startswith("|") and s.endswith("|"):
            content_line = s[1:-1].strip()
            if content_line and not content_line.startswith("+---"):
                current_box.append(content_line)

    if not boxes:
        return False

    mermaid_lines = ["```mermaid", "flowchart TD"]
    tier_ids = []
    for idx, box in enumerate(boxes, 1):
        if not box:
            continue
        title = box[0].replace('"', "'")
        tier_id = f"Tier{idx}"
        tier_ids.append(tier_id)
        items = []
        for item in box[1:]:
            item_clean = item.lstrip("- *").strip().replace('"', "'")
            if item_clean:
                items.append(f"• {item_clean}")
        items_str = "<br/>".join(items) if items else title
        mermaid_lines.append(f'    subgraph {tier_id}["{title}"]')
        mermaid_lines.append("        direction TB")
        mermaid_lines.append(f'        T{idx}["{items_str}"]')
        mermaid_lines.append("    end")
        mermaid_lines.append("")

    for i in range(len(tier_ids) - 1):
        mermaid_lines.append(f"    {tier_ids[i]} --> {tier_ids[i+1]}")
    mermaid_lines.append("```")

    replacement = "\n".join(mermaid_lines)
    new_content = re.sub(r"```(?:\w+)?\n[\s\S]*?\+---[\s\S]*?```", replacement, content, count=1)

    with open(file_path, "w", encoding="utf-8") as f:
        f.write(new_content)
    return True

def main():
    wiki_dir = sys.argv[1] if len(sys.argv) > 1 else ".wiki_workspace"
    files = sorted(glob.glob(os.path.join(wiki_dir, "*.md")))
    count = 0
    for f in files:
        if convert_file(f):
            print(f"Converted {os.path.basename(f)} to Mermaid flowchart")
            count += 1
    print(f"Total files converted: {count}")

if __name__ == "__main__":
    main()
