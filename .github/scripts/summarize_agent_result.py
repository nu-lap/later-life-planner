#!/usr/bin/env python3

import argparse
import json
import sys
from pathlib import Path
from typing import Any, Dict, List


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate a Markdown summary from an agent result JSON payload."
    )
    parser.add_argument("--input", required=True, help="Path to agent_result.json")
    parser.add_argument("--output", required=True, help="Path to write summary markdown")
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
        raise RuntimeError("Expected top-level JSON object in agent result file.")

    return data


def ensure_list_of_strings(value: Any) -> List[str]:
    if not isinstance(value, list):
        return []
    result: List[str] = []
    for item in value:
        if isinstance(item, str) and item.strip():
            result.append(item.strip())
    return result


def get_validation_summary(validation: Any) -> Dict[str, Any]:
    if not isinstance(validation, dict):
        return {"passed": None, "summary": ""}

    passed = validation.get("passed")
    summary = validation.get("summary")

    normalized_passed = passed if isinstance(passed, bool) else None
    normalized_summary = summary.strip() if isinstance(summary, str) else ""

    return {
        "passed": normalized_passed,
        "summary": normalized_summary,
    }


def status_heading(status: str) -> str:
    mapping = {
        "fixed": "Automated repair completed",
        "no_changes": "Automated repair found no changes to make",
        "blocked": "Automated repair was blocked",
        "validation_failed": "Automated repair failed validation",
    }
    return mapping.get(status, "Automated repair finished")


def status_icon(status: str) -> str:
    mapping = {
        "fixed": "✅",
        "no_changes": "ℹ️",
        "blocked": "⛔",
        "validation_failed": "❌",
    }
    return mapping.get(status, "ℹ️")


def build_summary(data: Dict[str, Any]) -> str:
    status = data.get("status")
    if not isinstance(status, str) or not status.strip():
        status = "unknown"
    status = status.strip()

    files_changed = ensure_list_of_strings(data.get("files_changed"))
    findings_addressed = ensure_list_of_strings(data.get("findings_addressed"))
    notes = data.get("notes", "")
    notes = notes.strip() if isinstance(notes, str) else ""

    validation = get_validation_summary(data.get("validation"))

    lines: List[str] = []
    lines.append(f"{status_icon(status)} **{status_heading(status)}**")
    lines.append("")
    lines.append(f"- **Status:** `{status}`")

    if findings_addressed:
        lines.append(f"- **Findings addressed:** {len(findings_addressed)}")
    else:
        lines.append("- **Findings addressed:** 0")

    if files_changed:
        lines.append(f"- **Files changed:** {len(files_changed)}")
    else:
        lines.append("- **Files changed:** 0")

    if validation["passed"] is True:
        lines.append("- **Validation:** passed")
    elif validation["passed"] is False:
        lines.append("- **Validation:** failed")
    else:
        lines.append("- **Validation:** not reported")

    if validation["summary"]:
        lines.append(f"- **Validation summary:** {validation['summary']}")

    if findings_addressed:
        lines.append("")
        lines.append("### Findings addressed")
        for item in findings_addressed[:20]:
            lines.append(f"- `{item}`")
        if len(findings_addressed) > 20:
            lines.append(f"- _...and {len(findings_addressed) - 20} more_")

    if files_changed:
        lines.append("")
        lines.append("### Files changed")
        for item in files_changed[:20]:
            lines.append(f"- `{item}`")
        if len(files_changed) > 20:
            lines.append(f"- _...and {len(files_changed) - 20} more_")

    if notes:
        lines.append("")
        lines.append("### Notes")
        lines.append(notes)

    lines.append("")
    lines.append("<!-- codex-repair-summary -->")
    return "\n".join(lines).strip() + "\n"


def write_output(path: str, content: str) -> None:
    output_path = Path(path)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    try:
        with output_path.open("w", encoding="utf-8") as handle:
            handle.write(content)
    except OSError as error:
        raise RuntimeError(f"Failed to write output file {path}: {error}") from error


def main() -> int:
    try:
        args = parse_args()
        data = load_json(args.input)
        summary = build_summary(data)
        write_output(args.output, summary)
        print(summary)
        return 0
    except RuntimeError as error:
        print(f"Error: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())