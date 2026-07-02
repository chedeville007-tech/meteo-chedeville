from flask import abort, g

from app.db import get_db

UID_COOKIE = "mp_uid"
ONE_YEAR = 60 * 60 * 24 * 365


def get_device_id() -> str:
    return g.uid


def ensure_user() -> str:
    db = get_db()
    user_id = get_device_id()
    db.execute("INSERT OR IGNORE INTO users (id) VALUES (?)", (user_id,))
    db.commit()
    return user_id


def get_membership(group_id: str):
    db = get_db()
    return db.execute(
        "SELECT * FROM members WHERE group_id = ? AND user_id = ?",
        (group_id, get_device_id()),
    ).fetchone()


def require_membership(group_id: str):
    member = get_membership(group_id)
    if member is None:
        abort(403, description="Vous n'êtes pas membre de ce groupe.")
    return member


def require_admin(group_id: str):
    member = require_membership(group_id)
    if not member["is_admin"]:
        abort(403, description="Réservé à l'admin du groupe.")
    return member
