from functools import wraps

from flask import abort, g, redirect, request, session, url_for

from app.db import get_db

MAX_PSEUDO_LENGTH = 24


def current_user():
    if "user" not in g:
        user_id = session.get("user_id")
        g.user = None
        if user_id:
            db = get_db()
            g.user = db.execute(
                """
                SELECT id, email, pseudo, password_hash, created_at, (avatar_data IS NOT NULL) AS has_avatar
                FROM users WHERE id = ?
                """,
                (user_id,),
            ).fetchone()
    return g.user


def login_user(user_id: str) -> None:
    session.clear()
    session["user_id"] = user_id
    session.permanent = True


def logout_user() -> None:
    session.clear()


def login_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        if current_user() is None:
            return redirect(url_for("auth.login", next=request.path))
        return view(*args, **kwargs)

    return wrapped


def get_membership(group_id: str):
    user = current_user()
    if user is None:
        return None
    db = get_db()
    return db.execute(
        "SELECT * FROM members WHERE group_id = ? AND user_id = ?",
        (group_id, user["id"]),
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
