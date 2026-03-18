#!/usr/bin/env python3

import argparse
import json
import re
import sys
from typing import Any, Dict, List, Optional, Tuple

START_MARKER = "[CODEX_FIX_REQUEST]"
END_MARKER = "[/CODEX_FIX_REQUEST]"
CLEAR_MARKER = "[CODEX_REVIEW_CLEAR]"


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
        help="GitHub login of the Codex reviewer/bot to filter on, e.g. 'codex' or 'openai-codex[bot]'",
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


def get_submitted_at(item: Dict[str, Any]) -> str:
    for key in ("submitted_at", "updated_at", "created_at"):
        value = item.get(key)
        if isinstance(value, str):
            return value
    return ""


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
    return CLEAR_MARKER in text


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
    severity_rank = {"p0": 0, "p1": 1, "p2": 2, "": 9}

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
    codex_actor: str,
    item_type: str,
) -> Tuple[List[Dict[str, str]], bool]:
    if not isinstance(items, list):
        return [], False

    requests: List[Dict[str, str]] = []
    clear_seen = False

    for item in items:
        if not isinstance(item, dict):
            continue

        author = get_login(item)
        if author != codex_actor:
            continue

        text = get_text(item)
        if not text:
            continue

        if has_clear_marker(text):
            clear_seen = True

        source_id = str(item.get("id", ""))
        source_created_at = get_submitted_at(item)
        source_url = str(
            item.get("html_url")
            or item.get("pull_request_url")
            or item.get("url")
            or ""
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

    return requests, clear_seen


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
        codex_actor = normalize_actor(args.codex_actor)

        reviews = load_json(args.reviews)
        review_comments = load_json(args.review_comments)
        issue_comments = load_json(args.issue_comments)

        extracted_reviews, review_clear = extract_from_items(
            reviews,
            codex_actor=codex_actor,
            item_type="review",
        )
        extracted_review_comments, review_comment_clear = extract_from_items(
            review_comments,
            codex_actor=codex_actor,
            item_type="review_comment",
        )
        extracted_issue_comments, issue_comment_clear = extract_from_items(
            issue_comments,
            codex_actor=codex_actor,
            item_type="issue_comment",
        )

        all_requests = (
            extracted_reviews
            + extracted_review_comments
            + extracted_issue_comments
        )
        deduped = dedupe_requests(all_requests)
        ordered = sort_requests(deduped)

        payload: Dict[str, Any] = {
            "codex_actor": codex_actor,
            "clear_seen": review_clear or review_comment_clear or issue_comment_clear,
            "request_count": len(ordered),
            "requests": ordered,
        }

        write_output(args.out, payload)
        return 0

    except RuntimeError as error:
        print(f"Error: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())