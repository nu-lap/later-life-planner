#!/usr/bin/env python3
import json
import os
import re
import subprocess
import sys


def map_position(path, target_line, merge_base):
    try:
        diff = subprocess.run(
            ["git", "diff", "--unified=0", merge_base, "--", path],
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


def get_merge_base(base_ref, head_sha):
    try:
        return (
            subprocess.run(
                ["git", "merge-base", f"origin/{base_ref}", head_sha],
                capture_output=True,
                text=True,
                check=True,
            )
            .stdout.strip()
        )
    except subprocess.CalledProcessError:
        return f"origin/{base_ref}"


def main():
    if len(sys.argv) < 2:
        print("Usage: prepare_review_comments.py <path/to/codex-review.json>", file=sys.stderr)
        sys.exit(1)
    base_ref = os.environ.get("BASE_REF")
    if not base_ref:
        raise RuntimeError("BASE_REF environment variable is required")
    head_sha = os.environ.get("HEAD_SHA")
    if not head_sha:
        raise RuntimeError("HEAD_SHA environment variable is required")
    review_path = sys.argv[1]
    with open(review_path) as fh:
        review = json.load(fh)
    findings = review.get("findings", [])
    comments = []
    merge_base = get_merge_base(base_ref, head_sha)
    for finding in findings:
        path = finding.get("file")
        line = finding.get("line")
        if not path or not isinstance(line, int) or line <= 0:
            continue
        pos = map_position(path, line, merge_base)
        if pos is None:
            continue
        severity = finding.get("severity", "medium").upper()
        title = finding.get("title", "")
        details = finding.get("details", "")
        comments.append(
            {
                "path": path,
                "position": pos,
                "body": f"[{severity}] {title}\n{details}",
            }
        )
    print(json.dumps(comments))


if __name__ == "__main__":
    main()
