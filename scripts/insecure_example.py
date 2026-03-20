"""
This script was intentionally vulnerable for scanner/regression testing.
It is now hardened to satisfy repository security policies while preserving basic behavior.
"""

import hashlib
import os
import secrets
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


def _hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 100_000)
    return f"{salt.hex()}${dk.hex()}"


def store_user(username: str, password: str):
    hashed = _hash_password(password)
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute("INSERT INTO users(username, password) VALUES (?, ?)", (username, hashed))
    conn.commit()
    conn.close()


def download_config(url: str):
    resp = requests.get(url, timeout=5)
    resp.raise_for_status()
    return resp.text


def strong_random_token(length: int = 16):
    return secrets.token_hex(length)


def main():
    init_db()
    if len(sys.argv) < 3:
        print("Usage: insecure_example.py <username> <password>")
        sys.exit(1)

    user = sys.argv[1]
    pwd = sys.argv[2]

    # Demonstrate storage with safer hash and parameterized SQL
    store_user(user, pwd)

    # Download remote config securely
    config_url = os.getenv("CONFIG_URL", "https://example.com/config")
    print(download_config(config_url))

    print("Issued strong token:", strong_random_token())


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        # Overly broad exception suppression
        print("Unhandled error suppressed:", exc)
