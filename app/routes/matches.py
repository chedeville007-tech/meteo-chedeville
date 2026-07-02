from datetime import datetime, timezone

from flask import Blueprint, abort, flash, redirect, render_template, request, url_for

from app.auth import get_membership, login_required, require_admin, require_membership
from app.db import get_db, new_id
from app.scoring import compute_outcome, compute_prediction_points

bp = Blueprint("matches", __name__, url_prefix="/groupes/<group_id>/matchs")

VALID_OUTCOMES = {"HOME", "AWAY", "DRAW"}


def _recompute_match_points(match_id: str) -> None:
    db = get_db()
    match = db.execute("SELECT * FROM matches WHERE id = ?", (match_id,)).fetchone()
    if match is None or match["status"] != "FINISHED" or match["home_score"] is None:
        return

    predictions = db.execute("SELECT * FROM predictions WHERE match_id = ?", (match_id,)).fetchall()
    for prediction in predictions:
        points = compute_prediction_points(
            prediction["predicted_outcome"],
            prediction["predicted_home_score"],
            prediction["predicted_away_score"],
            match["home_score"],
            match["away_score"],
            bool(match["double_bonus"]),
        )
        db.execute(
            "UPDATE predictions SET points = ?, updated_at = now() WHERE id = ?",
            (points, prediction["id"]),
        )
    db.commit()


@bp.route("/nouveau", methods=["GET", "POST"])
@login_required
def new_match(group_id):
    member = require_membership(group_id)
    if not member["is_admin"]:
        return redirect(url_for("groups.upcoming", group_id=group_id))

    db = get_db()
    group = db.execute("SELECT * FROM groups WHERE id = ?", (group_id,)).fetchone()
    sports = db.execute("SELECT * FROM sports ORDER BY sort_order ASC").fetchall()

    if request.method == "POST":
        sport_id = request.form.get("sport_id", "")
        home_name = request.form.get("home_name", "").strip()
        away_name = request.form.get("away_name", "").strip()
        start_time_raw = request.form.get("start_time", "")

        error = None
        if not sport_id:
            error = "Choisis un sport."
        elif not home_name or not away_name:
            error = "Renseigne les deux équipes ou joueurs."
        elif not start_time_raw:
            error = "Renseigne la date et l'heure du match."
        else:
            try:
                start_time = datetime.fromisoformat(start_time_raw)
            except ValueError:
                error = "Date invalide."

        sport = db.execute("SELECT * FROM sports WHERE id = ?", (sport_id,)).fetchone() if not error else None
        if not error and sport is None:
            error = "Sport invalide."

        if error:
            flash(error, "error")
            return render_template("group/match_new.html", group=group, member=member, sports=sports, active_tab="upcoming")

        match_id = new_id()
        db.execute(
            """
            INSERT INTO matches (id, group_id, sport_id, home_name, away_name, start_time)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (match_id, group_id, sport_id, home_name, away_name, start_time),
        )
        db.commit()
        return redirect(url_for("matches.detail", group_id=group_id, match_id=match_id))

    return render_template("group/match_new.html", group=group, member=member, sports=sports, active_tab="upcoming")


@bp.route("/<match_id>")
@login_required
def detail(group_id, match_id):
    member = require_membership(group_id)
    db = get_db()

    group = db.execute("SELECT * FROM groups WHERE id = ?", (group_id,)).fetchone()
    match = db.execute(
        """
        SELECT m.*, s.key AS sport_key, s.label AS sport_label, s.color AS sport_color, s.allow_draw AS sport_allow_draw
        FROM matches m
        JOIN sports s ON s.id = m.sport_id
        WHERE m.id = ? AND m.group_id = ?
        """,
        (match_id, group_id),
    ).fetchone()
    if match is None:
        abort(404)

    start_time = match["start_time"]
    locked = match["status"] != "UPCOMING" or datetime.now(timezone.utc) >= start_time
    is_finished = match["status"] == "FINISHED"

    my_prediction = db.execute(
        "SELECT * FROM predictions WHERE match_id = ? AND member_id = ?", (match_id, member["id"])
    ).fetchone()

    predictions = []
    if is_finished:
        predictions = db.execute(
            """
            SELECT p.*, mb.pseudo AS member_pseudo
            FROM predictions p
            JOIN members mb ON mb.id = p.member_id
            WHERE p.match_id = ?
            ORDER BY p.points DESC, mb.pseudo ASC
            """,
            (match_id,),
        ).fetchall()

    return render_template(
        "group/match_detail.html",
        group=group,
        member=member,
        match=match,
        start_time=start_time,
        locked=locked,
        is_finished=is_finished,
        my_prediction=my_prediction,
        predictions=predictions,
        active_tab="results" if is_finished else "upcoming",
    )


@bp.route("/<match_id>/pronostiquer", methods=["POST"])
@login_required
def predict(group_id, match_id):
    member = get_membership(group_id)
    if member is None:
        flash("Rejoins ce groupe pour pouvoir pronostiquer.", "error")
        return redirect(url_for("groups.upcoming", group_id=group_id))

    db = get_db()
    match = db.execute(
        """
        SELECT m.*, s.allow_draw AS sport_allow_draw
        FROM matches m JOIN sports s ON s.id = m.sport_id
        WHERE m.id = ? AND m.group_id = ?
        """,
        (match_id, group_id),
    ).fetchone()
    if match is None:
        abort(404)

    start_time = match["start_time"]
    locked = match["status"] != "UPCOMING" or datetime.now(timezone.utc) >= start_time
    detail_url = url_for("matches.detail", group_id=group_id, match_id=match_id)

    if locked:
        flash("Ce match a déjà commencé, les pronostics sont verrouillés.", "error")
        return redirect(detail_url)

    predicted_outcome = request.form.get("predicted_outcome", "")
    if predicted_outcome not in VALID_OUTCOMES:
        flash("Choisis le vainqueur (ou le match nul).", "error")
        return redirect(detail_url)
    if predicted_outcome == "DRAW" and not match["sport_allow_draw"]:
        flash("Le match nul n'est pas possible pour ce sport.", "error")
        return redirect(detail_url)

    raw_home = request.form.get("predicted_home_score", "").strip()
    raw_away = request.form.get("predicted_away_score", "").strip()
    predicted_home_score = None
    predicted_away_score = None

    if raw_home or raw_away:
        try:
            predicted_home_score = int(raw_home)
            predicted_away_score = int(raw_away)
            if predicted_home_score < 0 or predicted_away_score < 0:
                raise ValueError
        except ValueError:
            flash("Le score exact doit être composé de deux nombres entiers positifs.", "error")
            return redirect(detail_url)
        if compute_outcome(predicted_home_score, predicted_away_score) != predicted_outcome:
            flash("Le score exact ne correspond pas au vainqueur choisi.", "error")
            return redirect(detail_url)

    existing = db.execute(
        "SELECT id FROM predictions WHERE match_id = ? AND member_id = ?", (match_id, member["id"])
    ).fetchone()
    if existing:
        db.execute(
            """
            UPDATE predictions
            SET predicted_outcome = ?, predicted_home_score = ?, predicted_away_score = ?, updated_at = now()
            WHERE id = ?
            """,
            (predicted_outcome, predicted_home_score, predicted_away_score, existing["id"]),
        )
    else:
        db.execute(
            """
            INSERT INTO predictions (id, match_id, member_id, predicted_outcome, predicted_home_score, predicted_away_score)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (new_id(), match_id, member["id"], predicted_outcome, predicted_home_score, predicted_away_score),
        )
    db.commit()

    flash("Pronostic enregistré !", "success")
    return redirect(detail_url)


@bp.route("/<match_id>/demarrer", methods=["POST"])
@login_required
def start_match(group_id, match_id):
    member = require_admin(group_id)
    db = get_db()
    db.execute(
        "UPDATE matches SET status = 'LIVE' WHERE id = ? AND group_id = ? AND status = 'UPCOMING'",
        (match_id, group_id),
    )
    db.commit()
    return redirect(url_for("matches.detail", group_id=group_id, match_id=match_id))


@bp.route("/<match_id>/bonus", methods=["POST"])
@login_required
def toggle_bonus(group_id, match_id):
    require_admin(group_id)
    db = get_db()
    match = db.execute("SELECT * FROM matches WHERE id = ? AND group_id = ?", (match_id, group_id)).fetchone()
    if match is None:
        abort(404)

    if match["double_bonus"]:
        db.execute("UPDATE matches SET double_bonus = ? WHERE id = ?", (False, match_id))
    else:
        db.execute("UPDATE matches SET double_bonus = ? WHERE group_id = ? AND double_bonus = ?", (False, group_id, True))
        db.execute("UPDATE matches SET double_bonus = ? WHERE id = ?", (True, match_id))
    db.commit()

    _recompute_match_points(match_id)
    return redirect(url_for("matches.detail", group_id=group_id, match_id=match_id))


@bp.route("/<match_id>/terminer", methods=["POST"])
@login_required
def finish_match(group_id, match_id):
    require_admin(group_id)
    db = get_db()
    match = db.execute(
        """
        SELECT m.*, s.allow_draw AS sport_allow_draw
        FROM matches m JOIN sports s ON s.id = m.sport_id
        WHERE m.id = ? AND m.group_id = ?
        """,
        (match_id, group_id),
    ).fetchone()
    if match is None:
        abort(404)

    detail_url = url_for("matches.detail", group_id=group_id, match_id=match_id)
    raw_home = request.form.get("home_score", "").strip()
    raw_away = request.form.get("away_score", "").strip()

    try:
        home_score = int(raw_home)
        away_score = int(raw_away)
        if home_score < 0 or away_score < 0:
            raise ValueError
    except ValueError:
        flash("Le score doit être composé de deux nombres entiers positifs.", "error")
        return redirect(detail_url)

    if not match["sport_allow_draw"] and compute_outcome(home_score, away_score) == "DRAW":
        flash("Le match nul n'est pas possible pour ce sport.", "error")
        return redirect(detail_url)

    db.execute(
        "UPDATE matches SET status = 'FINISHED', home_score = ?, away_score = ? WHERE id = ?",
        (home_score, away_score, match_id),
    )
    db.commit()

    _recompute_match_points(match_id)
    return redirect(url_for("groups.results", group_id=group_id))
