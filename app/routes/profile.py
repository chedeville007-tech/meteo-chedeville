import psycopg2
from flask import Blueprint, Response, abort, flash, redirect, render_template, request, url_for
from werkzeug.security import check_password_hash, generate_password_hash

from app.auth import MAX_PSEUDO_LENGTH, current_user, login_required
from app.db import get_db
from app.standings import compute_personal_stats

bp = Blueprint("profile", __name__, url_prefix="/profil")

MIN_PASSWORD_LENGTH = 8
MAX_AVATAR_BYTES = 2 * 1024 * 1024
ALLOWED_AVATAR_TYPES = {"image/png", "image/jpeg", "image/webp"}


@bp.route("/")
@login_required
def index():
    return render_template("profile.html")


@bp.route("/infos", methods=["POST"])
@login_required
def update_infos():
    user = current_user()
    db = get_db()

    email = request.form.get("email", "").strip().lower()
    pseudo = request.form.get("pseudo", "").strip()

    error = None
    if not email or "@" not in email:
        error = "Adresse e-mail invalide."
    elif not pseudo:
        error = "Choisis un pseudo."
    elif len(pseudo) > MAX_PSEUDO_LENGTH:
        error = f"Pseudo trop long ({MAX_PSEUDO_LENGTH} caractères max)."

    if not error and email != user["email"]:
        taken = db.execute("SELECT 1 FROM users WHERE email = ? AND id != ?", (email, user["id"])).fetchone()
        if taken:
            error = "Un autre compte utilise déjà cet e-mail."

    if error:
        flash(error, "error")
        return redirect(url_for("profile.index"))

    db.execute("UPDATE users SET email = ?, pseudo = ? WHERE id = ?", (email, pseudo, user["id"]))

    if pseudo != user["pseudo"]:
        memberships = db.execute("SELECT id, group_id FROM members WHERE user_id = ?", (user["id"],)).fetchall()
        skipped = 0
        for m in memberships:
            conflict = db.execute(
                "SELECT 1 FROM members WHERE group_id = ? AND pseudo = ? AND id != ?",
                (m["group_id"], pseudo, m["id"]),
            ).fetchone()
            if conflict:
                skipped += 1
                continue
            db.execute("UPDATE members SET pseudo = ? WHERE id = ?", (pseudo, m["id"]))
        if skipped:
            flash(
                f"Pseudo mis à jour, mais déjà pris par un autre membre dans {skipped} de tes groupes "
                "(pseudo inchangé là-bas).",
                "error",
            )

    db.commit()
    flash("Profil mis à jour.", "success")
    return redirect(url_for("profile.index"))


@bp.route("/mot-de-passe", methods=["POST"])
@login_required
def update_password():
    user = current_user()
    current_password = request.form.get("current_password", "")
    new_password = request.form.get("new_password", "")
    new_password_confirm = request.form.get("new_password_confirm", "")

    error = None
    if not user["password_hash"] or not check_password_hash(user["password_hash"], current_password):
        error = "Mot de passe actuel incorrect."
    elif len(new_password) < MIN_PASSWORD_LENGTH:
        error = f"Le nouveau mot de passe doit faire au moins {MIN_PASSWORD_LENGTH} caractères."
    elif new_password != new_password_confirm:
        error = "Les deux mots de passe ne correspondent pas."

    if error:
        flash(error, "error")
        return redirect(url_for("profile.index"))

    db = get_db()
    db.execute("UPDATE users SET password_hash = ? WHERE id = ?", (generate_password_hash(new_password), user["id"]))
    db.commit()
    flash("Mot de passe modifié.", "success")
    return redirect(url_for("profile.index"))


@bp.route("/photo", methods=["POST"])
@login_required
def update_photo():
    user = current_user()
    file = request.files.get("avatar")

    if file is None or file.filename == "":
        flash("Choisis une image.", "error")
        return redirect(url_for("profile.index"))
    if file.mimetype not in ALLOWED_AVATAR_TYPES:
        flash("Format d'image non supporté (PNG, JPEG ou WebP uniquement).", "error")
        return redirect(url_for("profile.index"))

    data = file.read(MAX_AVATAR_BYTES + 1)
    if len(data) > MAX_AVATAR_BYTES:
        flash("Image trop lourde (2 Mo maximum).", "error")
        return redirect(url_for("profile.index"))

    db = get_db()
    db.execute(
        "UPDATE users SET avatar_data = ?, avatar_mimetype = ? WHERE id = ?",
        (psycopg2.Binary(data), file.mimetype, user["id"]),
    )
    db.commit()
    flash("Photo de profil mise à jour.", "success")
    return redirect(url_for("profile.index"))


@bp.route("/photo/supprimer", methods=["POST"])
@login_required
def delete_photo():
    user = current_user()
    db = get_db()
    db.execute("UPDATE users SET avatar_data = NULL, avatar_mimetype = NULL WHERE id = ?", (user["id"],))
    db.commit()
    flash("Photo de profil supprimée.", "success")
    return redirect(url_for("profile.index"))


@bp.route("/statistiques")
@login_required
def stats():
    user = current_user()
    db = get_db()
    rows = db.execute(
        """
        SELECT p.points, s.label AS sport_label
        FROM predictions p
        JOIN members mb ON mb.id = p.member_id
        JOIN matches m ON m.id = p.match_id
        JOIN sports s ON s.id = m.sport_id
        WHERE mb.user_id = ? AND m.status = 'FINISHED'
        ORDER BY m.start_time DESC
        """,
        (user["id"],),
    ).fetchall()

    stats = compute_personal_stats([dict(r) for r in rows])
    return render_template("profile_stats.html", stats=stats)


avatar_bp = Blueprint("avatar", __name__)


@avatar_bp.route("/avatar/<user_id>")
@login_required
def avatar(user_id):
    db = get_db()
    row = db.execute("SELECT avatar_data, avatar_mimetype FROM users WHERE id = ?", (user_id,)).fetchone()
    if row is None or row["avatar_data"] is None:
        abort(404)
    return Response(bytes(row["avatar_data"]), mimetype=row["avatar_mimetype"])
