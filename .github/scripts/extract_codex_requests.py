#!/usr/bin/env python3

import argparse
import json
import re
import sys
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

START_MARKER = "[CODEX_FIX_REQUEST]"
END_MARKER = "[/CODEX_FIX_REQUEST]"
CLEAR_MARKER = "[CODEX_REVIEW_CLEAR]"
WORKFLOW_REVIEW_MARKER = "<!-- codex-pr-review -->"
WORKFLOW_FINDINGS_HEADER = "### Findings"
WORKFLOW_SECTION_HEADER_PREFIX = "### "
WORKFLOW_NO_FINDINGS = "No findings."
WORKFLOW_REVIEW_ACTORS = {"github-actions[bot]"}
CLEAR_PHRASE_PATTERNS = [
    re.compile(r"did(?:n't| not) find any major issues", re.IGNORECASE),
    re.compile(r"did(?:n't| not) find any issues", re.IGNORECASE),
    re.compile(r"no major issues found", re.IGNORECASE),
    re.compile(r"no issues found", re.IGNORECASE),
]
JSON_CLEAR_RESULTS = {
    "NO_CHANGES",
    "NO_ISSUES",
    "APPROVED",
    "LGTM",
    "CLEAR",
    "PASS",
}
JSON_ISSUE_RESULTS = {
    "CHANGES_REQUESTED",
    "REQUESTED_CHANGES",
    "REQUEST_CHANGES",
    "CHANGES_REQUIRED",
    "NEEDS_CHANGES",
    "ISSUES_FOUND",
    "REWORK_REQUIRED",
}
WORKFLOW_FINDING_PATTERN = re.compile(
    r"^- \[(?P<severity>[A-Z]+)\] (?P<title>.*?)(?: \(`(?P<location>[^`]+)`\))?$"
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Extract structured Codex fix requests from GitHub PR reviews and comments."
    )
    parser.add_argument("--reviews", required=True, help="Path to PR reviews JSON")
    parser.add_argument("--review-comments", required=True, help="Path to review comments JSON")
    parser.add_argument("--issue-comments", required=True, help="Path to issue comments JSON")
    parser.add_argument(
        "--codex-actor",
        required=True,
        help=(
            "GitHub login(s) of the Codex reviewer/bot to filter on, e.g. "
            "'codex' or 'openai-codex[bot]'. Multiple actors may be provided "
            "as a comma-separated list."
        ),
    )
    parser.add_argument(
        "--commit-sha",
        default="",
        help="Optional head commit SHA; when set, only review items for this SHA are considered.",
    )
    parser.add_argument(
        "--min-created-at",
        default="",
        help=(
            "Optional ISO 8601 timestamp; review/issue comments before this time are ignored "
            "(useful for limiting to the latest commit time)."
        ),
    )
    parser.add_argument("--out", required=True, help="Output path for normalized JSON")
    return parser.parse_args()


def load_json(path: str) -> Any:
    try:
        with open(path, "r", encoding="utf-8") as handle:
            return json.load(handle)
    except FileNotFoundError:
        raise RuntimeError(f"File not found: {path}")
    except json.JSONDecodeError as error:
        raise RuntimeError(f"Invalid JSON in {path}: {error}") from error
    except OSError as error:
        raise RuntimeError(f"Failed to read {path}: {error}") from error


def normalize_actor(actor: str) -> str:
    return actor.strip().lower()


def normalize_actors(raw: str) -> set[str]:
    actors: set[str] = set()
    for part in raw.split(","):
        part = part.strip()
        if part:
            actors.add(normalize_actor(part))
    return actors


def get_login(item: Dict[str, Any]) -> str:
    user = item.get("user")
    if isinstance(user, dict):
        login = user.get("login")
        if isinstance(login, str):
            return normalize_actor(login)
    return ""


def get_text(item: Dict[str, Any]) -> str:
    for key in ("body", "body_text"):
        value = item.get(key)
        if isinstance(value, str):
            return value
    return ""


def get_result_value(item: Dict[str, Any], text: str) -> str:
    payload = parse_json_payload(text)
    if payload:
        for key in ("result", "verdict", "status", "state"):
            raw = payload.get(key)
            if isinstance(raw, str) and raw.strip():
                return normalize_result_value(raw)
    workflow_review = parse_workflow_review(text)
    if workflow_review:
        verdict = workflow_review.get("verdict")
        if isinstance(verdict, str) and verdict.strip():
            return normalize_result_value(verdict)
    for key in ("result", "verdict", "status", "state"):
        raw = item.get(key)
        if isinstance(raw, str) and raw.strip():
            normalized = normalize_result_value(raw)
            if key == "state" and normalized == "COMMENTED":
                continue
            return normalized
    return ""


def get_submitted_at(item: Dict[str, Any]) -> str:
    for key in ("submitted_at", "updated_at", "created_at"):
        value = item.get(key)
        if isinstance(value, str):
            return value
    return ""


def parse_timestamp(value: str) -> datetime:
    if value.endswith("Z"):
        value = value[:-1] + "+00:00"
    return datetime.fromisoformat(value)


def should_include_by_time(item: Dict[str, Any], min_created_at: Optional[datetime]) -> bool:
    if min_created_at is None:
        return True
    timestamp = get_submitted_at(item)
    if not timestamp:
        return False
    try:
        parsed = parse_timestamp(timestamp)
    except ValueError:
        return False
    return parsed >= min_created_at


def slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.strip().lower())
    slug = re.sub(r"-{2,}", "-", slug).strip("-")
    return slug or "request"


def derive_request_id(data: Dict[str, str]) -> str:
    parts = [
        data.get("file", ""),
        data.get("line", ""),
        data.get("title", ""),
        data.get("fix", ""),
    ]
    joined = " ".join(part for part in parts if part)
    return slugify(joined)[:120]


def parse_fix_request_blocks(text: str) -> List[Dict[str, str]]:
    requests: List[Dict[str, str]] = []
    if not text:
        return requests

    pattern = re.compile(
        re.escape(START_MARKER) + r"(.*?)" + re.escape(END_MARKER),
        flags=re.DOTALL | re.IGNORECASE,
    )

    for match in pattern.finditer(text):
        block = match.group(1).strip()
        parsed = parse_fix_request_block(block)
        if parsed:
            requests.append(parsed)

    return requests


def parse_fix_request_block(block: str) -> Optional[Dict[str, str]]:
    result: Dict[str, str] = {}
    allowed_keys = {"severity", "category", "file", "line", "title", "fix", "id"}

    for raw_line in block.splitlines():
        line = raw_line.strip()
        if not line or ":" not in line:
            continue
        key, value = line.split(":", 1)
        normalized_key = key.strip().lower()
        if normalized_key in allowed_keys:
            result[normalized_key] = value.strip()

    if not result.get("title") or not result.get("fix"):
        return None

    if "id" not in result or not result["id"]:
        result["id"] = derive_request_id(result)

    return result


def has_clear_marker(text: str) -> bool:
    if CLEAR_MARKER in text:
        return True

    for pattern in CLEAR_PHRASE_PATTERNS:
        if pattern.search(text):
            return True

    return False


def parse_json_payload(text: str) -> Optional[Dict[str, Any]]:
    if not text:
        return None
    candidate = text.lstrip()
    if not candidate.startswith("{"):
        return None
    decoder = json.JSONDecoder()
    try:
        payload, _ = decoder.raw_decode(candidate)
    except json.JSONDecodeError:
        return None
    if isinstance(payload, dict):
        return payload
    return None


def is_workflow_review(text: str) -> bool:
    return WORKFLOW_REVIEW_MARKER in text


def split_location(location: str) -> Tuple[str, str]:
    trimmed = location.strip()
    if not trimmed:
        return "", ""
    match = re.match(r"^(?P<file>.+?):(?P<line>\d+)$", trimmed)
    if match:
        return match.group("file"), match.group("line")
    return trimmed, ""


def parse_workflow_review(text: str) -> Optional[Dict[str, Any]]:
    if not is_workflow_review(text):
        return None

    verdict_match = re.search(r"- Verdict:\s*`([^`]+)`", text)
    summary_match = re.search(r"- Summary:\s*(.+)", text)
    findings: List[Dict[str, str]] = []
    lines = text.splitlines()
    in_findings = False
    i = 0

    while i < len(lines):
        stripped = lines[i].strip()
        if stripped == WORKFLOW_FINDINGS_HEADER:
            in_findings = True
            i += 1
            continue
        if in_findings and stripped.startswith(WORKFLOW_SECTION_HEADER_PREFIX):
            break
        if in_findings:
            if not stripped or stripped == WORKFLOW_NO_FINDINGS:
                i += 1
                continue
            finding_match = WORKFLOW_FINDING_PATTERN.match(stripped)
            if finding_match:
                severity = finding_match.group("severity").strip().lower()
                title = finding_match.group("title").strip()
                location = finding_match.group("location") or ""
                file_value, line_value = split_location(location)
                details_lines: List[str] = []
                i += 1
                while i < len(lines):
                    next_stripped = lines[i].strip()
                    if not next_stripped:
                        i += 1
                        continue
                    if next_stripped.startswith("- [") or next_stripped.startswith(
                        WORKFLOW_SECTION_HEADER_PREFIX
                    ):
                        break
                    details_lines.append(next_stripped)
                    i += 1
                findings.append(
                    {
                        "severity": severity,
                        "title": title,
                        "details": " ".join(details_lines).strip(),
                        "file": file_value,
                        "line": line_value,
                    }
                )
                continue
        i += 1

    verdict = verdict_match.group(1).strip() if verdict_match else ""
    summary = summary_match.group(1).strip() if summary_match else ""
    return {"verdict": verdict, "summary": summary, "findings": findings}


def normalize_result_value(value: str) -> str:
    return value.strip().upper()


def extract_requests_from_json(payload: Dict[str, Any]) -> List[Dict[str, str]]:
    requests: List[Dict[str, str]] = []
    for key in ("requests", "issues", "findings"):
        raw_items = payload.get(key)
        if not isinstance(raw_items, list):
            continue
        for item in raw_items:
            if isinstance(item, dict):
                title = str(item.get("title") or item.get("summary") or item.get("message") or "").strip()
                fix = str(item.get("fix") or item.get("recommendation") or item.get("action") or "").strip()
                if not title:
                    continue
                if not fix:
                    fix = "Address the Codex review finding."
                request = {
                    "severity": str(item.get("severity") or ""),
                    "category": str(item.get("category") or ""),
                    "file": str(item.get("file") or ""),
                    "line": str(item.get("line") or ""),
                    "title": title,
                    "fix": fix,
                    "id": str(item.get("id") or ""),
                }
                if not request["id"]:
                    request["id"] = derive_request_id(request)
                requests.append(request)
            elif isinstance(item, str):
                title = item.strip()
                if not title:
                    continue
                request = {
                    "severity": "",
                    "category": "",
                    "file": "",
                    "line": "",
                    "title": title,
                    "fix": "Address the Codex review finding.",
                }
                request["id"] = derive_request_id(request)
                requests.append(request)
    return requests


def extract_requests_from_workflow_review(payload: Dict[str, Any]) -> List[Dict[str, str]]:
    requests: List[Dict[str, str]] = []
    findings = payload.get("findings")
    if not isinstance(findings, list):
        return requests
    for item in findings:
        if not isinstance(item, dict):
            continue
        title = str(item.get("title") or "").strip()
        if not title:
            continue
        details = str(item.get("details") or "").strip()
        request = {
            "severity": str(item.get("severity") or "").strip(),
            "category": "workflow_review",
            "file": str(item.get("file") or "").strip(),
            "line": str(item.get("line") or "").strip(),
            "title": title,
            "fix": details or "Address the Codex workflow review finding.",
            "id": str(item.get("id") or "").strip(),
        }
        if not request["id"]:
            request["id"] = derive_request_id(request)
        requests.append(request)
    return requests


def item_source_type(item_type: str) -> str:
    if item_type == "review":
        return "review"
    if item_type == "review_comment":
        return "review_comment"
    return "issue_comment"


def normalize_request(
    request: Dict[str, str],
    *,
    source_type: str,
    source_id: str,
    source_author: str,
    source_created_at: str,
    source_url: str,
) -> Dict[str, str]:
    return {
        "id": request.get("id", ""),
        "severity": request.get("severity", ""),
        "category": request.get("category", ""),
        "file": request.get("file", ""),
        "line": request.get("line", ""),
        "title": request.get("title", ""),
        "fix": request.get("fix", ""),
        "source_type": source_type,
        "source_id": source_id,
        "source_author": source_author,
        "source_created_at": source_created_at,
        "source_url": source_url,
    }


def dedupe_requests(requests: List[Dict[str, str]]) -> List[Dict[str, str]]:
    seen: set[Tuple[str, str, str, str]] = set()
    deduped: List[Dict[str, str]] = []

    for item in requests:
        key = (
            item.get("file", "").strip().lower(),
            item.get("line", "").strip().lower(),
            item.get("title", "").strip().lower(),
            item.get("fix", "").strip().lower(),
        )
        if key in seen:
            continue
        seen.add(key)
        deduped.append(item)

    return deduped


def sort_requests(requests: List[Dict[str, str]]) -> List[Dict[str, str]]:
    severity_rank = {
        "critical": 0,
        "p0": 0,
        "high": 1,
        "p1": 1,
        "medium": 2,
        "p2": 2,
        "low": 3,
        "p3": 3,
        "": 9,
    }

    def sort_key(item: Dict[str, str]) -> Tuple[int, str, str, str]:
        severity = item.get("severity", "").strip().lower()
        return (
            severity_rank.get(severity, 8),
            item.get("file", ""),
            item.get("line", ""),
            item.get("title", ""),
        )

    return sorted(requests, key=sort_key)


def extract_from_items(
    items: Any,
    *,
    codex_actors: set[str],
    item_type: str,
    commit_sha: Optional[str] = None,
    min_created_at: Optional[datetime] = None,
) -> Tuple[List[Dict[str, str]], bool, bool, int]:
    if not isinstance(items, list):
        return [], False, False, 0

    requests: List[Dict[str, str]] = []
    clear_seen = False
    issues_seen = False
    matched_items = 0

    for item in items:
        if not isinstance(item, dict):
            continue

        text = get_text(item)
        workflow_review = parse_workflow_review(text) if item_type == "review" else None
        author = get_login(item)
        trusted_workflow_review = workflow_review is not None
        if author not in codex_actors and not trusted_workflow_review:
            continue

        if commit_sha and item_type in ("review", "review_comment"):
            commit_id = item.get("commit_id")
            if not isinstance(commit_id, str) or not commit_id:
                continue
            if commit_id != commit_sha:
                continue

        if not should_include_by_time(item, min_created_at):
            continue

        matched_items += 1

        if not text:
            continue

        source_id = str(item.get("id", ""))
        source_created_at = get_submitted_at(item)
        source_url = str(
            item.get("html_url")
            or item.get("pull_request_url")
            or item.get("url")
            or ""
        )

        result_value = get_result_value(item, text)
        if result_value and result_value in JSON_CLEAR_RESULTS:
            clear_seen = True
        elif result_value and result_value in JSON_ISSUE_RESULTS:
            issues_seen = True

        if has_clear_marker(text):
            clear_seen = True

        json_payload = parse_json_payload(text)
        if json_payload:
            for request in extract_requests_from_json(json_payload):
                requests.append(
                    normalize_request(
                        request,
                        source_type=item_source_type(item_type),
                        source_id=source_id,
                        source_author=author,
                        source_created_at=source_created_at,
                        source_url=source_url,
                    )
                )

        if trusted_workflow_review:
            for request in extract_requests_from_workflow_review(workflow_review):
                requests.append(
                    normalize_request(
                        request,
                        source_type="workflow_review",
                        source_id=source_id,
                        source_author=author,
                        source_created_at=source_created_at,
                        source_url=source_url,
                    )
                )

        for request in parse_fix_request_blocks(text):
            requests.append(
                normalize_request(
                    request,
                    source_type=item_source_type(item_type),
                    source_id=source_id,
                    source_author=author,
                    source_created_at=source_created_at,
                    source_url=source_url,
                )
            )

    return requests, clear_seen, issues_seen, matched_items


def write_output(path: str, payload: Dict[str, Any]) -> None:
    try:
        with open(path, "w", encoding="utf-8") as handle:
            json.dump(payload, handle, indent=2)
            handle.write("\n")
    except OSError as error:
        raise RuntimeError(f"Failed to write {path}: {error}") from error


def main() -> int:
    try:
        args = parse_args()
        codex_actors = normalize_actors(args.codex_actor)
        if not codex_actors:
            raise RuntimeError("--codex-actor must include at least one actor.")

        commit_sha = args.commit_sha.strip() or None
        min_created_at = None
        if args.min_created_at.strip():
            try:
                min_created_at = parse_timestamp(args.min_created_at.strip())
            except ValueError as error:
                raise RuntimeError(
                    f"Invalid --min-created-at timestamp: {args.min_created_at}"
                ) from error

        reviews = load_json(args.reviews)
        review_comments = load_json(args.review_comments)
        issue_comments = load_json(args.issue_comments)

        extracted_reviews, review_clear, review_issues, review_matched = extract_from_items(
            reviews,
            codex_actors=codex_actors,
            item_type="review",
            commit_sha=commit_sha,
            min_created_at=min_created_at,
        )
        extracted_review_comments, review_comment_clear, review_comment_issues, review_comment_matched = extract_from_items(
            review_comments,
            codex_actors=codex_actors,
            item_type="review_comment",
            commit_sha=commit_sha,
            min_created_at=min_created_at,
        )
        extracted_issue_comments, issue_comment_clear, issue_comment_issues, issue_comment_matched = extract_from_items(
            issue_comments,
            codex_actors=codex_actors,
            item_type="issue_comment",
            commit_sha=commit_sha,
            min_created_at=min_created_at,
        )

        all_requests = (
            extracted_reviews
            + extracted_review_comments
            + extracted_issue_comments
        )
        deduped = dedupe_requests(all_requests)
        ordered = sort_requests(deduped)
        matched_items = review_matched + review_comment_matched + issue_comment_matched
        issues_seen = review_issues or review_comment_issues or issue_comment_issues

        status = "pending"
        if len(ordered) > 0:
            status = "issues"
        elif issues_seen:
            status = "issues"
        elif review_clear or review_comment_clear or issue_comment_clear:
            status = "clear"
        elif matched_items > 0:
            status = "unstructured"

        payload: Dict[str, Any] = {
            "codex_actors": sorted(codex_actors),
            "commit_sha": commit_sha or "",
            "min_created_at": args.min_created_at.strip(),
            "clear_seen": review_clear or review_comment_clear or issue_comment_clear,
            "issues_seen": issues_seen,
            "matched_item_count": matched_items,
            "request_count": len(ordered),
            "status": status,
            "requests": ordered,
        }

        write_output(args.out, payload)
        return 0

    except RuntimeError as error:
        print(f"Error: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
