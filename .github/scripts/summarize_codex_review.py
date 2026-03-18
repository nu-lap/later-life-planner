#!/usr/bin/env python3

import argparse
import json
import sys
from pathlib import Path
from typing import Any, Dict, List


STATUS_LABELS = {
    "clear": "Codex review clear",
    "issues": "Codex review issues detected",
    "pending": "Codex review pending",
    "unstructured": "Codex review missing structured markers",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Summarize Codex review extraction results for gate reporting."
    )
    parser.add_argument("--input", required=True, help="Path to fix_requests.json")
    parser.add_argument("--summary", required=True, help="Path to write summary markdown")
    parser.add_argument("--status", required=True, help="Path to write status JSON")
    parser.add_argument("--head-sha", default="", help="Head SHA for the PR")
    parser.add_argument(
        "--head-commit-time",
        default="",
        help="ISO 8601 timestamp for the head commit",
    )
    return parser.parse_args()


def load_json(path: str) -> Dict[str, Any]:
    try:
        with open(path, "r", encoding="utf-8") as handle:
            data = json.load(handle)
    except FileNotFoundError as error:
        raise RuntimeError(f"Input file not found: {path}") from error
    except json.JSONDecodeError as error:
        raise RuntimeError(f"Invalid JSON in {path}: {error}") from error
    except OSError as error:
        raise RuntimeError(f"Failed to read {path}: {error}") from error

    if not isinstance(data, dict):
        raise RuntimeError("Expected top-level JSON object in fix requests file.")

    return data


def ensure_list(value: Any) -> List[Dict[str, Any]]:
    if not isinstance(value, list):
        return []
    return [item for item in value if isinstance(item, dict)]


def compute_status(data: Dict[str, Any]) -> str:
    status = data.get("status")
    if isinstance(status, str) and status.strip():
        return status.strip()

    request_count = data.get("request_count")
    clear_seen = data.get("clear_seen") is True
    matched_items = data.get("matched_item_count") or 0

    if isinstance(request_count, int) and request_count > 0:
        return "issues"
    if clear_seen:
        return "clear"
    if matched_items > 0:
        return "unstructured"
    return "pending"


def build_summary(
    data: Dict[str, Any],
    *,
    head_sha: str,
    head_commit_time: str,
) -> str:
    status = compute_status(data)
    label = STATUS_LABELS.get(status, "Codex review status")

    request_count = data.get("request_count") if isinstance(data.get("request_count"), int) else 0
    matched_items = data.get("matched_item_count") if isinstance(data.get("matched_item_count"), int) else 0
    clear_seen = data.get("clear_seen") is True

    lines: List[str] = []
    lines.append(f"**{label}**")
    lines.append("")
    lines.append(f"- Status: `{status}`")
    lines.append(f"- Requests: {request_count}")
    lines.append(f"- Codex items matched: {matched_items}")
    lines.append(f"- Clear marker seen: {str(clear_seen).lower()}")

    if head_sha:
        lines.append(f"- Head SHA: `{head_sha}`")
    if head_commit_time:
        lines.append(f"- Head commit time: `{head_commit_time}`")

    requests = ensure_list(data.get("requests"))
    if requests:
        lines.append("")
        lines.append("### Requests")
        for item in requests[:20]:
            title = str(item.get("title", "")).strip()
            file_path = str(item.get("file", "")).strip()
            line = str(item.get("line", "")).strip()
            severity = str(item.get("severity", "")).strip().lower()
            entry = "- "
            if severity:
                entry += f"[{severity}] "
            if file_path:
                entry += file_path
                if line:
                    entry += f":{line}"
                entry += " "
            if title:
                entry += title
            else:
                entry += "(no title)"
            lines.append(entry.strip())
        if len(requests) > 20:
            lines.append(f"- ...and {len(requests) - 20} more")

    lines.append("")
    lines.append("<!-- codex-review-gate -->")
    return "\n".join(lines).strip() + "\n"


def write_text(path: str, content: str) -> None:
    output_path = Path(path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    try:
        with output_path.open("w", encoding="utf-8") as handle:
            handle.write(content)
    except OSError as error:
        raise RuntimeError(f"Failed to write {path}: {error}") from error


def write_json(path: str, payload: Dict[str, Any]) -> None:
    output_path = Path(path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    try:
        with output_path.open("w", encoding="utf-8") as handle:
            json.dump(payload, handle, indent=2)
            handle.write("\n")
    except OSError as error:
        raise RuntimeError(f"Failed to write {path}: {error}") from error


def main() -> int:
    try:
        args = parse_args()
        data = load_json(args.input)
        status = compute_status(data)

        summary = build_summary(
            data,
            head_sha=args.head_sha.strip(),
            head_commit_time=args.head_commit_time.strip(),
        )

        status_payload = {
            "status": status,
            "request_count": data.get("request_count"),
            "matched_item_count": data.get("matched_item_count"),
            "clear_seen": data.get("clear_seen"),
            "commit_sha": data.get("commit_sha", ""),
            "min_created_at": data.get("min_created_at", ""),
            "codex_actors": data.get("codex_actors", []),
            "head_sha": args.head_sha.strip(),
            "head_commit_time": args.head_commit_time.strip(),
        }

        write_text(args.summary, summary)
        write_json(args.status, status_payload)
        print(summary)
        return 0
    except RuntimeError as error:
        print(f"Error: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
