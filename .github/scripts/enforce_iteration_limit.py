#!/usr/bin/env python3

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

ITERATION_LABEL_PREFIX = "codex-repair-pass:"
AUTOMATION_COMMENT_MARKER = "<!-- codex-repair-iteration:"
DEFAULT_STATE_PATH = ".github/agent-output/codex_repair_iteration_state.json"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Enforce a maximum number of automated Codex PR repair iterations."
    )
    parser.add_argument("--repo", required=True, help="GitHub repo in OWNER/REPO form")
    parser.add_argument("--pr", required=True, help="Pull request number")
    parser.add_argument("--max-iterations", type=int, required=True, help="Maximum allowed repair passes")
    parser.add_argument(
        "--mode",
        choices=("check", "increment"),
        default="increment",
        help="check = fail if already at limit, increment = reserve the next pass and fail if it exceeds limit",
    )
    parser.add_argument(
        "--state-path",
        default=DEFAULT_STATE_PATH,
        help="Optional local JSON file used to persist the current iteration count for downstream steps",
    )
    parser.add_argument(
        "--write-state-only",
        action="store_true",
        help="Do not modify labels/comments remotely; only inspect PR state and write local state file",
    )
    return parser.parse_args()


def run_gh_json(args: List[str]) -> Any:
    command = ["gh"] + args
    try:
        completed = subprocess.run(
            command,
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
    except FileNotFoundError as error:
        raise RuntimeError("GitHub CLI 'gh' was not found in PATH.") from error
    except subprocess.CalledProcessError as error:
        stderr = error.stderr.strip()
        raise RuntimeError(f"gh command failed: {' '.join(command)}\n{stderr}") from error

    try:
        return json.loads(completed.stdout)
    except json.JSONDecodeError as error:
        raise RuntimeError(f"gh command returned invalid JSON: {' '.join(command)}") from error


def run_gh(args: List[str]) -> None:
    command = ["gh"] + args
    try:
        subprocess.run(
            command,
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
    except FileNotFoundError as error:
        raise RuntimeError("GitHub CLI 'gh' was not found in PATH.") from error
    except subprocess.CalledProcessError as error:
        stderr = error.stderr.strip()
        raise RuntimeError(f"gh command failed: {' '.join(command)}\n{stderr}") from error


def fetch_pr(repo: str, pr_number: str) -> Dict[str, Any]:
    data = run_gh_json(
        [
            "pr",
            "view",
            pr_number,
            "--repo",
            repo,
            "--json",
            "number,labels,comments,url",
        ]
    )
    if not isinstance(data, dict):
        raise RuntimeError("Unexpected PR payload returned by gh.")
    return data


def extract_label_iteration(labels: Any) -> Optional[int]:
    if not isinstance(labels, list):
        return None

    highest: Optional[int] = None
    for label in labels:
        if not isinstance(label, dict):
            continue
        name = label.get("name")
        if not isinstance(name, str):
            continue
        if not name.startswith(ITERATION_LABEL_PREFIX):
            continue
        suffix = name[len(ITERATION_LABEL_PREFIX) :].strip()
        if suffix.isdigit():
            value = int(suffix)
            if highest is None or value > highest:
                highest = value
    return highest


def extract_comment_iteration(comments: Any) -> Optional[int]:
    if not isinstance(comments, list):
        return None

    highest: Optional[int] = None
    pattern = re.compile(r"<!--\s*codex-repair-iteration:\s*(\d+)\s*-->")

    for comment in comments:
        if not isinstance(comment, dict):
            continue
        body = comment.get("body")
        if not isinstance(body, str):
            continue

        for match in pattern.finditer(body):
            value = int(match.group(1))
            if highest is None or value > highest:
                highest = value

    return highest


def determine_current_iteration(pr_data: Dict[str, Any]) -> int:
    label_iteration = extract_label_iteration(pr_data.get("labels"))
    comment_iteration = extract_comment_iteration(pr_data.get("comments"))

    candidates = [value for value in (label_iteration, comment_iteration) if value is not None]
    return max(candidates) if candidates else 0


def replace_iteration_label(repo: str, pr_number: str, labels: Any, new_iteration: int) -> None:
    existing_iteration_labels: List[str] = []

    if isinstance(labels, list):
        for label in labels:
            if not isinstance(label, dict):
                continue
            name = label.get("name")
            if isinstance(name, str) and name.startswith(ITERATION_LABEL_PREFIX):
                existing_iteration_labels.append(name)

    for label_name in existing_iteration_labels:
        run_gh(["pr", "edit", pr_number, "--repo", repo, "--remove-label", label_name])

    run_gh(
        [
            "pr",
            "edit",
            pr_number,
            "--repo",
            repo,
            "--add-label",
            f"{ITERATION_LABEL_PREFIX}{new_iteration}",
        ]
    )


def add_iteration_comment(repo: str, pr_number: str, iteration: int) -> None:
    body = (
        f"{AUTOMATION_COMMENT_MARKER}{iteration} -->\n"
        f"Automated Codex repair iteration reserved: **{iteration}**."
    )
    run_gh(["pr", "comment", pr_number, "--repo", repo, "--body", body])


def write_state_file(path: str, payload: Dict[str, Any]) -> None:
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    with target.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2)
        handle.write("\n")


def main() -> int:
    try:
        args = parse_args()

        if args.max_iterations < 1:
            raise RuntimeError("--max-iterations must be at least 1.")

        pr_data = fetch_pr(args.repo, args.pr)
        current_iteration = determine_current_iteration(pr_data)

        if args.mode == "check":
            next_iteration = current_iteration
            if current_iteration >= args.max_iterations:
                raise RuntimeError(
                    f"Iteration limit reached for PR #{args.pr}: "
                    f"current={current_iteration}, max={args.max_iterations}."
                )

            state_payload = {
                "repo": args.repo,
                "pr": str(args.pr),
                "mode": args.mode,
                "current_iteration": current_iteration,
                "next_iteration": current_iteration + 1,
                "max_iterations": args.max_iterations,
                "pr_url": pr_data.get("url", ""),
            }
            write_state_file(args.state_path, state_payload)
            print(json.dumps(state_payload, indent=2))
            return 0

        reserved_iteration = current_iteration + 1
        if reserved_iteration > args.max_iterations:
            raise RuntimeError(
                f"Iteration limit exceeded for PR #{args.pr}: "
                f"attempted={reserved_iteration}, max={args.max_iterations}."
            )

        if not args.write_state_only:
            replace_iteration_label(args.repo, args.pr, pr_data.get("labels"), reserved_iteration)
            add_iteration_comment(args.repo, args.pr, reserved_iteration)

        state_payload = {
            "repo": args.repo,
            "pr": str(args.pr),
            "mode": args.mode,
            "current_iteration": current_iteration,
            "reserved_iteration": reserved_iteration,
            "max_iterations": args.max_iterations,
            "pr_url": pr_data.get("url", ""),
            "state_written_only": bool(args.write_state_only),
        }
        write_state_file(args.state_path, state_payload)
        print(json.dumps(state_payload, indent=2))
        return 0

    except RuntimeError as error:
        print(f"Error: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())