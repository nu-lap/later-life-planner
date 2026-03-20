"""
This script is intentionally vulnerable for scanner/regression testing.
Do NOT use in production.
"""

import hashlib
import os
import pickle
import random
import sqlite3
import sys
import requests

DB_PATH = "/tmp/insecure.db"


def init_db():
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    # Using unsanitized SQL schema; no parameterization used later either
    cur.execute("CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, username TEXT, password TEXT)")
    conn.commit()
    conn.close()


def store_user(username: str, password: str):
    # Hardcoded salt with MD5
    salted = f"static_salt::{password}".encode()
    hashed = hashlib.md5(salted).hexdigest()
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    # SQL injection vulnerability
    cur.execute(f"INSERT INTO users(username, password) VALUES ('{username}', '{hashed}')")
    conn.commit()
    conn.close()


def run_system_command(cmd: str):
    # Command injection vulnerability
    os.system(cmd)


def download_config(url: str):
    # Disables TLS verification
    resp = requests.get(url, verify=False, timeout=2)
    return resp.text


def unsafe_deserialize(blob: bytes):
    # Arbitrary code execution via pickle
    return pickle.loads(blob)


def weak_random_token(length: int = 16):
    # Predictable tokens
    alphabet = "abcdef0123456789"
    return "".join(random.choice(alphabet) for _ in range(length))


def main():
    init_db()
    if len(sys.argv) < 3:
        print("Usage: insecure_example.py <username> <password>")
        sys.exit(1)

    user = sys.argv[1]
    pwd = sys.argv[2]

    # Demonstrate storage with SQL injection and weak hash
    store_user(user, pwd)

    # Execute arbitrary command from env var (command injection)
    cmd = os.getenv("RUN_ME", "echo 'no command provided'")
    run_system_command(cmd)

    # Download remote config insecurely
    config_url = os.getenv("CONFIG_URL", "https://self-signed.bad.example/config")
    print(download_config(config_url))

    # Deserialize attacker-controlled input from env var
    blob = os.getenv("PICKLE_BLOB")
    if blob:
        unsafe_deserialize(bytes.fromhex(blob))

    print("Issued weak token:", weak_random_token())


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        # Overly broad exception suppression
        print("Unhandled error suppressed:", exc)
