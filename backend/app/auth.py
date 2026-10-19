"""
auth.py
-------
Accounts and login sessions.

* Passwords: PBKDF2-HMAC-SHA256, 200k iterations, per-user salt (stdlib).
* Sessions: on login/signup the server issues a random 256-bit token. Only a
  SHA-256 hash of it is stored (sessions table), so a leaked database can't
  be used to log in. Tokens expire after SESSION_DAYS (default 30).
* Every /students/{id}/... API route requires `Authorization: Bearer <token>`
  and the token must belong to that same student -- knowing someone's
  student id is no longer enough to read or change their data.
* Accounts created before logins existed (no email/password) can be opened
  once with their old student id via /auth/legacy, and are then asked to
  add an email + password in Settings. As soon as they do, the legacy route
  stops working for that account.
"""
from __future__ import annotations
import hashlib
import hmac
import os
import re
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

from . import storage

_ITERATIONS = 200_000
SESSION_DAYS = int(os.environ.get("SESSION_DAYS", "30"))
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


# ---------------------------------------------------------------- passwords

def hash_password(password: str, salt: Optional[str] = None) -> tuple[str, str]:
    salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), _ITERATIONS).hex()
    return salt, digest


def verify_password(password: str, salt: str, digest: str) -> bool:
    _, candidate = hash_password(password, salt)
    return hmac.compare_digest(candidate, digest)


def normalize_email(email: str) -> str:
    return email.strip().lower()


def _validate(email: str, password: str) -> None:
    if not EMAIL_RE.match(email):
        raise ValueError("Enter a valid email address.")
    if len(password) < 6:
        raise ValueError("Use at least 6 characters for your password.")


# ---------------------------------------------------------------- sessions

def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def create_session(student_id: str) -> str:
    token = secrets.token_urlsafe(32)
    now = datetime.now(timezone.utc)
    storage.query(
        "INSERT INTO sessions (token_hash, student_id, created_at, expires_at) VALUES (?,?,?,?)",
        (_hash_token(token), student_id, now.isoformat(), (now + timedelta(days=SESSION_DAYS)).isoformat()),
    )
    return token


def student_for_token(token: Optional[str]) -> Optional[str]:
    if not token:
        return None
    row = storage.query_one(
        "SELECT student_id, expires_at FROM sessions WHERE token_hash=?", (_hash_token(token),)
    )
    if not row:
        return None
    if row["expires_at"] < datetime.now(timezone.utc).isoformat():
        revoke_session(token)
        return None
    return row["student_id"]


def revoke_session(token: str) -> None:
    storage.query("DELETE FROM sessions WHERE token_hash=?", (_hash_token(token),))


def revoke_all_sessions(student_id: str) -> None:
    storage.query("DELETE FROM sessions WHERE student_id=?", (student_id,))


# ---------------------------------------------------------------- accounts

def signup(name: str, email: str, password: str) -> dict:
    email = normalize_email(email)
    _validate(email, password)
    if storage.find_student_by_email(email):
        raise ValueError("An account with this email already exists. Log in instead.")
    record = storage.create_student()
    salt, digest = hash_password(password)
    record["auth"] = {"email": email, "salt": salt, "hash": digest}
    record["profile"]["name"] = name.strip()
    record["profile"]["email"] = email
    storage.save_student(record)
    return record


def login(email: str, password: str) -> dict:
    email = normalize_email(email)
    record = storage.find_student_by_email(email)
    if not record:
        raise ValueError("No account found for this email. Check the spelling or sign up.")
    auth = record.get("auth") or {}
    if not auth.get("hash") or not verify_password(password, auth["salt"], auth["hash"]):
        raise ValueError("That password doesn't match this email.")
    return record


def is_legacy(record: dict) -> bool:
    return not (record.get("auth") or {}).get("hash")


def can_use_legacy_login(record: dict) -> bool:
    # only accounts that pre-date logins -- never demo accounts
    return is_legacy(record) and not record.get("profile", {}).get("demo")


def legacy_login(student_id: str) -> dict:
    if not storage.student_exists(student_id):
        raise ValueError("No account with that student ID.")
    record = storage.load_student(student_id)
    if not can_use_legacy_login(record):
        raise ValueError("This account can't be opened with a student ID. Log in with your email and password.")
    return record


def set_credentials(record: dict, email: str, password: str) -> dict:
    """Adds/changes the email + password on an account (used to secure legacy/demo accounts)."""
    email = normalize_email(email)
    _validate(email, password)
    other = storage.find_student_by_email(email)
    if other and other["student_id"] != record["student_id"]:
        raise ValueError("That email is already used by another account.")
    salt, digest = hash_password(password)
    record["auth"] = {"email": email, "salt": salt, "hash": digest}
    record["profile"]["email"] = email
    record["profile"].pop("demo", None)
    return record


def public_record(record: dict) -> dict:
    """Never send password hashes to the browser."""
    clean = dict(record)
    clean.pop("auth", None)
    clean["needs_credentials"] = is_legacy(record)
    return clean
