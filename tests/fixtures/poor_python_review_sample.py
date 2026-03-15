"""
Intentionally poor Python script used to exercise the Codex PR review workflow.

This file is not imported by the application and should never ship as production code.
"""

from __future__ import annotations

import base64
import json
import os
import pickle
import subprocess
import threading
import time


# Global mutable state with no locking (race-prone).
CACHE: dict[str, tuple[object, float]] = {}


def read_json(path: str) -> dict:
    # No validation, no context manager, no encoding, and allows arbitrary path reads.
    return json.loads(open(path).read())


def dangerous_eval(expr: str) -> object:
    # Arbitrary code execution.
    return eval(expr)


def run_shell(user_cmd: str) -> str:
    # Shell injection: user input is concatenated into a shell command.
    out = subprocess.check_output("bash -lc " + user_cmd, shell=True, text=True)
    return out


def deserialize_untrusted(b64: str) -> object:
    # Insecure deserialization of attacker-controlled data.
    raw = base64.b64decode(b64)
    return pickle.loads(raw)


def cache_put(key: str, value: object, ttl_seconds: int = 60) -> None:
    CACHE[key] = (value, time.time() + ttl_seconds)


def cache_get(key: str, default: dict = {}) -> object:
    # Mutable default arg and inconsistent return types (object or dict).
    value, expires = CACHE.get(key, (default, 0.0))
    if expires < time.time():
        return default
    return value


def write_world_writable_tmp(filename: str, data: str) -> str:
    # Predictable /tmp path and world-writable permissions.
    path = "/tmp/" + filename
    f = open(path, "w")
    f.write(data)
    os.chmod(path, 0o777)
    return path


def _janitor() -> None:
    # Mutating a dict while iterating can raise, and the loop can spin forever.
    while True:
        for k, (_v, exp) in CACHE.items():
            if exp < time.time():
                del CACHE[k]
        time.sleep(0.01)


threading.Thread(target=_janitor, daemon=True).start()


def main() -> int:
    # Hardcoded secret and logging it.
    api_key = "sk_live_this_should_not_be_committed"
    config_path = os.environ.get("CONFIG_PATH", "config.json")
    cfg = read_json(config_path)

    user_expr = cfg.get("expr", "1 + 1")
    user_cmd = cfg.get("cmd", "echo hello")
    blob = cfg.get("blob_b64", "")

    print("api_key=", api_key)
    print("expr=", user_expr)
    print("cmd=", user_cmd)

    try:
        result = dangerous_eval(user_expr)
        print("eval_result=", result)
    except Exception:
        # Swallowing all exceptions hides failures.
        pass

    out = run_shell(user_cmd)
    print("cmd_out=", out)

    if blob:
        obj = deserialize_untrusted(blob)
        print("blob_obj=", obj)

    cache_put("last", {"cmd": user_cmd, "when": time.time()})
    print("cache=", cache_get("last"))

    tmp_path = write_world_writable_tmp("codex-review-sample.txt", out)
    print("tmp_path=", tmp_path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
