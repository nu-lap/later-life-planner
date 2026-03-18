#!/usr/bin/env python3

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional

AUTOMATION_COMMENT_MARKER_PREFIX = "<!-- codex-repair-iteration:"
AUTOMATION_COMMENT_PATTERN = re.compile(r"<!--\s*codex-repair-iteration:\s*(\d+)\s*-->")
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
        help="Do not modify PR comments remotely; only inspect PR state and write local state file",
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


def run_gh(args: List[str]) -> str:
    command = ["gh"] + args
    try:
        completed = subprocess.run(
            command,
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        return completed.stdout
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
            "number,url",
        ]
    )
    if not isinstance(data, dict):
        raise RuntimeError("Unexpected PR payload returned by gh.")

    comments = run_gh_json(["api", f"repos/{repo}/issues/{pr_number}/comments"])
    if not isinstance(comments, list):
        raise RuntimeError("Unexpected issue comments payload returned by gh.")

    data["comments"] = comments
    return data

def extract_iteration_comment(comments: Any) -> Optional[Dict[str, Any]]:
    if not isinstance(comments, list):
        return None

    highest_comment: Optional[Dict[str, Any]] = None
    highest_iteration = -1

    for comment in comments:
        if not isinstance(comment, dict):
            continue

        body = comment.get("body")
        if not isinstance(body, str):
            continue

        match = AUTOMATION_COMMENT_PATTERN.search(body)
        if not match:
            continue

        iteration = int(match.group(1))
        if iteration > highest_iteration:
            highest_iteration = iteration
            highest_comment = {
                "id": comment.get("id"),
                "url": comment.get("url", ""),
                "body": body,
                "iteration": iteration,
            }

    return highest_comment


def determine_current_iteration(pr_data: Dict[str, Any]) -> int:
    comment_data = extract_iteration_comment(pr_data.get("comments"))
    if not comment_data:
        return 0
    return int(comment_data["iteration"])


def build_iteration_comment_body(iteration: int) -> str:
    return (
        f"{AUTOMATION_COMMENT_MARKER_PREFIX}{iteration} -->\n"
        f"Automated Codex repair iteration reserved: **{iteration}**."
    )


def upsert_iteration_comment(repo: str, pr_number: str, pr_data: Dict[str, Any], iteration: int) -> None:
    existing = extract_iteration_comment(pr_data.get("comments"))
    body = build_iteration_comment_body(iteration)

    if existing and existing.get("id") is not None:
        comment_id = str(existing["id"])
        run_gh(
            [
                "api",
                f"repos/{repo}/issues/comments/{comment_id}",
                "--method",
                "PATCH",
                "--field",
                f"body={body}",
            ]
        )
        return

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
            upsert_iteration_comment(args.repo, args.pr, pr_data, reserved_iteration)

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