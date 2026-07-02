from flask import Blueprint, flash, redirect, render_template, request, url_for

from app.auth import current_user, login_required
from app.codes import generate_invite_code
from app.db import get_db, new_id

bp = Blueprint("home", __name__)

MAX_NAME_LENGTH = 40


@bp.route("/")
@login_required
def index():
    db = get_db()
    user = current_user()

    groups = db.execute(
        """
        SELECT g.id, g.name, g.code,
          (SELECT COUNT(*) FROM members m2 WHERE m2.group_id = g.id) AS member_count,
          (SELECT COUNT(*) FROM matches ma WHERE ma.group_id = g.id AND ma.status = 'UPCOMING') AS upcoming_count
        FROM members m
        JOIN groups g ON g.id = m.group_id
        WHERE m.user_id = ?
        ORDER BY m.created_at DESC
        """,
        (user["id"],),
    ).fetchall()

    top_groups = db.execute(
        """
        SELECT g.id, g.name,
          (SELECT COUNT(*) FROM members m2 WHERE m2.group_id = g.id) AS member_count,
          COALESCE(SUM(p.points), 0) AS total_points
        FROM groups g
        LEFT JOIN members m ON m.group_id = g.id
        LEFT JOIN predictions p ON p.member_id = m.id
        GROUP BY g.id, g.name
        ORDER BY total_points DESC, member_count DESC
        LIMIT 10
        """
    ).fetchall()

    return render_template("home.html", groups=groups, top_groups=top_groups)


@bp.route("/groupes/creer", methods=["POST"])
@login_required
def create_group():
    name = request.form.get("name", "").strip()
    user = current_user()

    if not name:
        flash("Le nom du groupe est requis.", "error")
        return redirect(url_for("home.index"))
    if len(name) > MAX_NAME_LENGTH:
        flash(f"Nom de groupe trop long ({MAX_NAME_LENGTH} caractères max).", "error")
        return redirect(url_for("home.index"))

    db = get_db()

    code = generate_invite_code()
    for _ in range(6):
        if not db.execute("SELECT 1 FROM groups WHERE code = ?", (code,)).fetchone():
            break
        code = generate_invite_code()

    group_id = new_id()
    db.execute("INSERT INTO groups (id, name, code) VALUES (?, ?, ?)", (group_id, name, code))
    db.execute(
        "INSERT INTO members (id, pseudo, is_admin, user_id, group_id) VALUES (?, ?, ?, ?, ?)",
        (new_id(), user["pseudo"], True, user["id"], group_id),
    )
    db.commit()

    return redirect(url_for("groups.upcoming", group_id=group_id))


@bp.route("/groupes/rejoindre", methods=["POST"])
@login_required
def join_group():
    code = request.form.get("code", "").strip().upper()
    user = current_user()

    if not code:
        flash("Le code d'invitation est requis.", "error")
        return redirect(url_for("home.index"))

    db = get_db()
    group = db.execute("SELECT * FROM groups WHERE code = ?", (code,)).fetchone()
    if not group:
        flash("Aucun groupe ne correspond à ce code.", "error")
        return redirect(url_for("home.join_by_code", code=code))

    existing_membership = db.execute(
        "SELECT * FROM members WHERE group_id = ? AND user_id = ?", (group["id"], user["id"])
    ).fetchone()
    if existing_membership:
        return redirect(url_for("groups.upcoming", group_id=group["id"]))

    pseudo_taken = db.execute(
        "SELECT 1 FROM members WHERE group_id = ? AND pseudo = ?", (group["id"], user["pseudo"])
    ).fetchone()
    if pseudo_taken:
        flash(
            f"Un autre membre de ce groupe utilise déjà le pseudo « {user['pseudo']} ». "
            "Demande à l'admin de renommer ce membre, ou change de compte.",
            "error",
        )
        return redirect(url_for("home.join_by_code", code=code))

    db.execute(
        "INSERT INTO members (id, pseudo, is_admin, user_id, group_id) VALUES (?, ?, ?, ?, ?)",
        (new_id(), user["pseudo"], False, user["id"], group["id"]),
    )
    db.commit()

    return redirect(url_for("groups.upcoming", group_id=group["id"]))


@bp.route("/rejoindre/<code>")
@login_required
def join_by_code(code):
    db = get_db()
    normalized = code.strip().upper()
    group = db.execute("SELECT * FROM groups WHERE code = ?", (normalized,)).fetchone()
    member_count = 0
    if group:
        member_count = db.execute(
            "SELECT COUNT(*) AS c FROM members WHERE group_id = ?", (group["id"],)
        ).fetchone()["c"]
    return render_template("join.html", group=group, code=normalized, member_count=member_count)
