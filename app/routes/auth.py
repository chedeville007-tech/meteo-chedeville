from flask import Blueprint, flash, redirect, render_template, request, url_for
from werkzeug.security import check_password_hash, generate_password_hash

from app.auth import MAX_PSEUDO_LENGTH, current_user, login_user, logout_user
from app.db import get_db, new_id

bp = Blueprint("auth", __name__)

MIN_PASSWORD_LENGTH = 8


@bp.route("/inscription", methods=["GET", "POST"])
def register():
    if current_user():
        return redirect(url_for("home.index"))

    if request.method == "POST":
        email = request.form.get("email", "").strip().lower()
        pseudo = request.form.get("pseudo", "").strip()
        password = request.form.get("password", "")
        password_confirm = request.form.get("password_confirm", "")

        error = None
        if not email or "@" not in email:
            error = "Adresse e-mail invalide."
        elif not pseudo:
            error = "Choisis un pseudo."
        elif len(pseudo) > MAX_PSEUDO_LENGTH:
            error = f"Pseudo trop long ({MAX_PSEUDO_LENGTH} caractères max)."
        elif len(password) < MIN_PASSWORD_LENGTH:
            error = f"Le mot de passe doit faire au moins {MIN_PASSWORD_LENGTH} caractères."
        elif password != password_confirm:
            error = "Les deux mots de passe ne correspondent pas."

        db = get_db()
        if not error and db.execute("SELECT 1 FROM users WHERE email = ?", (email,)).fetchone():
            error = "Un compte existe déjà avec cet e-mail."

        if error:
            flash(error, "error")
            return render_template("auth/register.html", email=email, pseudo=pseudo)

        user_id = new_id()
        db.execute(
            "INSERT INTO users (id, email, password_hash, pseudo) VALUES (?, ?, ?, ?)",
            (user_id, email, generate_password_hash(password), pseudo),
        )
        db.commit()

        login_user(user_id)
        return redirect(url_for("home.index"))

    return render_template("auth/register.html")


@bp.route("/connexion", methods=["GET", "POST"])
def login():
    if current_user():
        return redirect(url_for("home.index"))

    next_url = request.args.get("next") or url_for("home.index")

    if request.method == "POST":
        email = request.form.get("email", "").strip().lower()
        password = request.form.get("password", "")

        db = get_db()
        user = db.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()

        if not user or not user["password_hash"] or not check_password_hash(user["password_hash"], password):
            flash("E-mail ou mot de passe incorrect.", "error")
            return render_template("auth/login.html", email=email, next=request.form.get("next", next_url))

        login_user(user["id"])
        return redirect(request.form.get("next") or url_for("home.index"))

    return render_template("auth/login.html", next=next_url)


@bp.route("/deconnexion", methods=["POST"])
def logout():
    logout_user()
    return redirect(url_for("auth.login"))
