#!/usr/bin/env python3

import argparse
import json
import os
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional


DEFAULT_CODEX_ACTORS = (
    "openai-codex[bot],codex,chatgpt-codex-connector[bot],chatgpt-codex-connector"
)
DEFAULT_STATUS_CONTEXT = "codex-review-loop"
DEFAULT_POLL_SECONDS = 30
DEFAULT_MAX_WAIT_MINUTES = 30
DEFAULT_MAX_ITERATIONS = 5
DEFAULT_COMMIT_MESSAGE = "chore(ai): address Codex review findings"
DEFAULT_WORK_DIR = ".codex-orchestrator"
STATE_FILE = "state.json"


class CommandError(RuntimeError):
    pass


def run_cmd(cmd: List[str], *, cwd: Optional[Path] = None, check: bool = True) -> str:
    try:
        completed = subprocess.run(
            cmd,
            cwd=str(cwd) if cwd else None,
            check=check,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
    except FileNotFoundError as error:
        raise CommandError(f"Command not found: {cmd[0]}") from error
    except subprocess.CalledProcessError as error:
        stderr = error.stderr.strip()
        raise CommandError(f"Command failed: {' '.join(cmd)}\n{stderr}") from error

    return completed.stdout.strip()


def gh_json(args: List[str], *, paginate: bool = False, cwd: Optional[Path] = None) -> Any:
    cmd = ["gh", "api"]
    if paginate:
        cmd.append("--paginate")
    cmd.extend(args)
    output = run_cmd(cmd, cwd=cwd)
    try:
        return json.loads(output) if output else None
    except json.JSONDecodeError as error:
        raise CommandError(f"Invalid JSON from gh api: {' '.join(cmd)}") from error


def gh_text(args: List[str], *, cwd: Optional[Path] = None) -> str:
    cmd = ["gh"] + args
    return run_cmd(cmd, cwd=cwd)


def git_root() -> Path:
    output = run_cmd(["git", "rev-parse", "--show-toplevel"])
    return Path(output)


def git_branch() -> str:
    return run_cmd(["git", "rev-parse", "--abbrev-ref", "HEAD"])


def git_is_clean() -> bool:
    status = run_cmd(["git", "status", "--porcelain"])
    return status == ""


def git_has_changes() -> bool:
    status = run_cmd(["git", "status", "--porcelain"])
    return status != ""


def git_commit(message: str) -> None:
    run_cmd(["git", "add", "-A"])
    try:
        run_cmd(["git", "commit", "-m", message])
    except CommandError as error:
        if "nothing to commit" in str(error):
            return
        raise


def git_push() -> None:
    run_cmd(["git", "push"])


def get_repo_name(repo_override: Optional[str]) -> str:
    if repo_override:
        return repo_override
    return gh_text(["repo", "view", "--json", "nameWithOwner", "--jq", ".nameWithOwner"])


def get_pr_number(repo: str, pr_override: Optional[int]) -> int:
    if pr_override is not None:
        return pr_override
    output = gh_text(["pr", "view", "--repo", repo, "--json", "number", "--jq", ".number"])
    return int(output.strip())


def get_pr_data(repo: str, pr_number: int) -> Dict[str, Any]:
    data = gh_json([f"repos/{repo}/pulls/{pr_number}"])
    if not isinstance(data, dict):
        raise CommandError("Unexpected PR payload from GitHub API.")
    return data


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def parse_iso(value: str) -> datetime:
    if value.endswith("Z"):
        value = value[:-1] + "+00:00"
    return datetime.fromisoformat(value)


def load_state(path: Path) -> Dict[str, Any]:
    if not path.exists():
        return {"first_seen": {}}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        raise CommandError(f"Invalid JSON in {path}") from error


def save_state(path: Path, state: Dict[str, Any]) -> None:
    path.write_text(json.dumps(state, indent=2) + "\n", encoding="utf-8")


def fetch_reviews(repo: str, pr_number: int, output_dir: Path) -> Dict[str, Path]:
    output_dir.mkdir(parents=True, exist_ok=True)
    reviews_path = output_dir / "reviews.json"
    review_comments_path = output_dir / "review_comments.json"
    issue_comments_path = output_dir / "issue_comments.json"

    reviews = gh_json([f"repos/{repo}/pulls/{pr_number}/reviews"], paginate=True)
    review_comments = gh_json([f"repos/{repo}/pulls/{pr_number}/comments"], paginate=True)
    issue_comments = gh_json([f"repos/{repo}/issues/{pr_number}/comments"], paginate=True)

    reviews_path.write_text(json.dumps(reviews, indent=2) + "\n", encoding="utf-8")
    review_comments_path.write_text(
        json.dumps(review_comments, indent=2) + "\n", encoding="utf-8"
    )
    issue_comments_path.write_text(
        json.dumps(issue_comments, indent=2) + "\n", encoding="utf-8"
    )

    return {
        "reviews": reviews_path,
        "review_comments": review_comments_path,
        "issue_comments": issue_comments_path,
    }


def run_extract(
    repo_root: Path,
    inputs: Dict[str, Path],
    codex_actors: str,
    head_sha: str,
    min_created_at: str,
    output_path: Path,
) -> Dict[str, Any]:
    script_path = repo_root / ".github" / "scripts" / "extract_codex_requests.py"
    cmd = [
        sys.executable,
        str(script_path),
        "--reviews",
        str(inputs["reviews"]),
        "--review-comments",
        str(inputs["review_comments"]),
        "--issue-comments",
        str(inputs["issue_comments"]),
        "--codex-actor",
        codex_actors,
        "--commit-sha",
        head_sha,
        "--min-created-at",
        min_created_at,
        "--out",
        str(output_path),
    ]
    run_cmd(cmd, cwd=repo_root)
    with output_path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def set_status(
    repo: str,
    sha: str,
    *,
    state: str,
    context: str,
    description: str,
    target_url: Optional[str],
) -> None:
    args = [f"repos/{repo}/statuses/{sha}"]
    args.extend(["-f", f"state={state}"])
    args.extend(["-f", f"context={context}"])
    args.extend(["-f", f"description={description}"])
    if target_url:
        args.extend(["-f", f"target_url={target_url}"])
    gh_json(args)


def run_repair(command: str, env: Dict[str, str], cwd: Path) -> None:
    completed = subprocess.run(command, shell=True, cwd=str(cwd), env=env)
    if completed.returncode != 0:
        raise CommandError(f"Repair command failed with exit code {completed.returncode}.")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Local Codex review loop orchestrator for PRs."
    )
    parser.add_argument("--repo", help="Repo in OWNER/REPO form (defaults to gh repo view)")
    parser.add_argument("--pr", type=int, help="Pull request number (defaults to current branch PR)")
    parser.add_argument(
        "--codex-actors",
        default=DEFAULT_CODEX_ACTORS,
        help="Comma-separated Codex actor logins to match.",
    )
    parser.add_argument(
        "--status-context",
        default=DEFAULT_STATUS_CONTEXT,
        help="Status check context to update.",
    )
    parser.add_argument(
        "--poll-interval",
        type=int,
        default=DEFAULT_POLL_SECONDS,
        help="Seconds between polls while waiting for Codex review.",
    )
    parser.add_argument(
        "--max-wait-minutes",
        type=int,
        default=DEFAULT_MAX_WAIT_MINUTES,
        help="Max minutes to wait for a Codex review before failing.",
    )
    parser.add_argument(
        "--max-iterations",
        type=int,
        default=DEFAULT_MAX_ITERATIONS,
        help="Max auto-repair iterations before stopping.",
    )
    parser.add_argument(
        "--repair-command",
        help="Shell command to run when Codex issues are found.",
    )
    parser.add_argument(
        "--auto-commit",
        action="store_true",
        help="Commit local changes after repair command completes.",
    )
    parser.add_argument(
        "--commit-message",
        default=DEFAULT_COMMIT_MESSAGE,
        help="Commit message to use with --auto-commit.",
    )
    parser.add_argument(
        "--push",
        action="store_true",
        help="Push after committing changes.",
    )
    parser.add_argument(
        "--require-clean",
        action="store_true",
        help="Fail if working tree is dirty before starting.",
    )
    parser.add_argument(
        "--require-branch-match",
        action="store_true",
        help="Fail if local branch does not match PR head ref.",
    )
    parser.add_argument(
        "--work-dir",
        default=DEFAULT_WORK_DIR,
        help="Directory for loop artifacts (default: .codex-orchestrator).",
    )
    return parser.parse_args()


def main() -> int:
    try:
        args = parse_args()
        repo_root = git_root()
        repo = get_repo_name(args.repo)
        pr_number = get_pr_number(repo, args.pr)
        pr_data = get_pr_data(repo, pr_number)

        head_ref = pr_data.get("head", {}).get("ref", "")
        pr_url = pr_data.get("html_url")

        local_branch = git_branch()
        if args.require_branch_match and head_ref and local_branch != head_ref:
            raise CommandError(
                f"Local branch '{local_branch}' does not match PR head '{head_ref}'."
            )

        if args.require_clean and not git_is_clean():
            raise CommandError("Working tree is not clean.")

        work_dir = repo_root / args.work_dir
        work_dir.mkdir(parents=True, exist_ok=True)

        iteration = 0
        current_sha = ""
        state_path = work_dir / STATE_FILE
        state = load_state(state_path)
        first_seen = state.get("first_seen")
        if not isinstance(first_seen, dict):
            first_seen = {}
            state["first_seen"] = first_seen

        while True:
            pr_data = get_pr_data(repo, pr_number)
            head = pr_data.get("head", {})
            head_sha = head.get("sha", "")
            head_ref = head.get("ref", "")
            if not head_sha:
                raise CommandError("Could not resolve PR head SHA.")

            if head_sha != current_sha:
                current_sha = head_sha
                if head_sha not in first_seen:
                    first_seen[head_sha] = now_iso()
                    save_state(state_path, state)
                set_status(
                    repo,
                    head_sha,
                    state="pending",
                    context=args.status_context,
                    description="Waiting for Codex review.",
                    target_url=pr_url,
                )

            min_created_at = first_seen.get(head_sha) or now_iso()

            inputs = fetch_reviews(repo, pr_number, work_dir)
            output_path = work_dir / "fix_requests.json"
            fix_requests = run_extract(
                repo_root,
                inputs,
                args.codex_actors,
                head_sha,
                min_created_at,
                output_path,
            )

            status = fix_requests.get("status")
            if status == "clear":
                set_status(
                    repo,
                    head_sha,
                    state="success",
                    context=args.status_context,
                    description="Codex review clear.",
                    target_url=pr_url,
                )
                return 0

            if status == "issues":
                set_status(
                    repo,
                    head_sha,
                    state="failure",
                    context=args.status_context,
                    description="Codex review reported issues.",
                    target_url=pr_url,
                )

                if not args.repair_command:
                    raise CommandError("Repair command required to address Codex issues.")

                iteration += 1
                if iteration > args.max_iterations:
                    raise CommandError("Max repair iterations reached.")

                env = os.environ.copy()
                env.update(
                    {
                        "PR_NUMBER": str(pr_number),
                        "REPO": repo,
                        "HEAD_SHA": head_sha,
                        "HEAD_REF": head_ref,
                        "FIX_REQUESTS_JSON": str(output_path),
                    }
                )
                run_repair(args.repair_command, env, repo_root)

                if args.auto_commit and git_has_changes():
                    git_commit(args.commit_message)

                if args.push:
                    git_push()

                continue

            if status == "unstructured":
                set_status(
                    repo,
                    head_sha,
                    state="failure",
                    context=args.status_context,
                    description="Codex review missing structured markers.",
                    target_url=pr_url,
                )
                raise CommandError("Codex review missing structured markers.")

            # pending or unknown
            try:
                elapsed_minutes = (
                    datetime.now(timezone.utc) - parse_iso(min_created_at)
                ).total_seconds() / 60.0
            except ValueError:
                elapsed_minutes = 0.0
            if elapsed_minutes > args.max_wait_minutes:
                set_status(
                    repo,
                    head_sha,
                    state="failure",
                    context=args.status_context,
                    description="Timed out waiting for Codex review.",
                    target_url=pr_url,
                )
                raise CommandError("Timed out waiting for Codex review.")

            set_status(
                repo,
                head_sha,
                state="pending",
                context=args.status_context,
                description="Waiting for Codex review.",
                target_url=pr_url,
            )
            time.sleep(args.poll_interval)

    except CommandError as error:
        print(f"Error: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
