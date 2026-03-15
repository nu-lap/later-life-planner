#!/usr/bin/env python3
import json
import os
import re
import subprocess
import sys


def map_position(path, target_line, base_ref):
    try:
        diff = subprocess.run(
            ["git", "diff", "--unified=0", f"origin/{base_ref}", "--", path],
            capture_output=True,
            text=True,
            check=True,
        ).stdout
    except subprocess.CalledProcessError:
        return None
    position = 0
    cur_line = None
    for row in diff.splitlines():
        if row.startswith("@@"):
            m = re.search(r"\+(\d+)", row)
            if m:
                cur_line = int(m.group(1)) - 1
            else:
                cur_line = None
            continue
        if cur_line is None:
            continue
        position += 1
        if row.startswith("+"):
            cur_line += 1
            if cur_line == target_line:
                return position
        elif row.startswith(" "):
            cur_line += 1
    return None


def main():
    if len(sys.argv) < 2:
        print("Usage: prepare_review_comments.py <path/to/codex-review.json>", file=sys.stderr)
        sys.exit(1)
    base_ref = os.environ.get("BASE_REF")
    if not base_ref:
        raise RuntimeError("BASE_REF environment variable is required")
    review_path = sys.argv[1]
    with open(review_path) as fh:
        review = json.load(fh)
    findings = review.get("findings", [])
    comments = []
    for finding in findings:
        path = finding.get("file")
        line = finding.get("line")
        if not path or not isinstance(line, int) or line <= 0:
            continue
        pos = map_position(path, line, base_ref)
        if pos is None:
            continue
        severity = finding.get("severity", "medium").upper()
        title = finding.get("title", "")
        details = finding.get("details", "")
        comments.append(
            {
                "path": path,
                "line": line,
                "side": "RIGHT",
                "position": pos,
                "body": f"[{severity}] {title}\n{details}",
            }
        )
    print(json.dumps(comments))


if __name__ == "__main__":
    main()
