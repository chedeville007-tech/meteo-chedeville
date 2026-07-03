from flask import Blueprint, abort, flash, redirect, render_template, request, url_for

from app.auth import get_membership, login_required, require_admin, require_membership
from app.db import get_db
from app.standings import summarize_predictions

bp = Blueprint("groups", __name__, url_prefix="/groupes/<group_id>")


def group_gate(group_id: str):
    db = get_db()
    group = db.execute("SELECT * FROM groups WHERE id = ?", (group_id,)).fetchone()
    if group is None:
        abort(404)
    member = get_membership(group_id)
    return group, member


@bp.route("/")
@login_required
def index(group_id):
    return redirect(url_for("groups.upcoming", group_id=group_id))


@bp.route("/matchs-a-venir")
@login_required
def upcoming(group_id):
    group, member = group_gate(group_id)
    if member is None:
        return render_template("group/join_prompt.html", group=group)

    db = get_db()
    matches = db.execute(
        """
        SELECT m.*, s.key AS sport_key, s.label AS sport_label, s.color AS sport_color, c.name AS competition_name,
          EXISTS(SELECT 1 FROM predictions p WHERE p.match_id = m.id AND p.member_id = ?) AS has_predicted
        FROM matches m
        JOIN sports s ON s.id = m.sport_id
        LEFT JOIN competitions c ON c.id = m.competition_id
        WHERE m.group_id = ? AND m.status IN ('UPCOMING', 'LIVE')
        ORDER BY m.start_time ASC
        """,
        (member["id"], group_id),
    ).fetchall()

    return render_template(
        "group/upcoming.html", group=group, member=member, matches=matches, active_tab="upcoming"
    )


@bp.route("/resultats")
@login_required
def results(group_id):
    group, member = group_gate(group_id)
    if member is None:
        return render_template("group/join_prompt.html", group=group)

    db = get_db()
    matches = db.execute(
        """
        SELECT m.*, s.key AS sport_key, s.label AS sport_label, s.color AS sport_color, c.name AS competition_name
        FROM matches m
        JOIN sports s ON s.id = m.sport_id
        LEFT JOIN competitions c ON c.id = m.competition_id
        WHERE m.group_id = ? AND m.status = 'FINISHED'
        ORDER BY m.start_time DESC
        """,
        (group_id,),
    ).fetchall()

    results_with_predictions = []
    for match in matches:
        predictions = db.execute(
            """
            SELECT p.*, mb.pseudo AS member_pseudo
            FROM predictions p
            JOIN members mb ON mb.id = p.member_id
            WHERE p.match_id = ?
            ORDER BY p.points DESC, mb.pseudo ASC
            """,
            (match["id"],),
        ).fetchall()
        results_with_predictions.append({"match": match, "predictions": predictions})

    return render_template(
        "group/results.html",
        group=group,
        member=member,
        results=results_with_predictions,
        active_tab="results",
    )


@bp.route("/classement")
@login_required
def standings(group_id):
    group, member = group_gate(group_id)
    if member is None:
        return render_template("group/join_prompt.html", group=group)

    db = get_db()
    members = db.execute("SELECT * FROM members WHERE group_id = ?", (group_id,)).fetchall()

    rows = []
    for m in members:
        predictions = db.execute(
            """
            SELECT p.points, p.predicted_home_score, p.predicted_away_score,
                   ma.status AS match_status, ma.home_score AS match_home_score, ma.away_score AS match_away_score
            FROM predictions p
            JOIN matches ma ON ma.id = p.match_id
            WHERE p.member_id = ?
            """,
            (m["id"],),
        ).fetchall()
        summary = summarize_predictions([dict(p) for p in predictions])
        rows.append({"member_id": m["id"], "pseudo": m["pseudo"], **summary})

    rows.sort(
        key=lambda r: (-r["total_points"], -r["exact_count"], -r["correct_count"], r["pseudo"].lower())
    )

    top3 = rows[:3]

    return render_template(
        "group/standings.html",
        group=group,
        member=member,
        rows=rows,
        top3=top3,
        active_tab="standings",
    )


@bp.route("/membres")
@login_required
def members(group_id):
    group, member = group_gate(group_id)
    if member is None:
        return render_template("group/join_prompt.html", group=group)

    db = get_db()
    members_list = db.execute(
        "SELECT * FROM members WHERE group_id = ? ORDER BY is_admin DESC, pseudo ASC", (group_id,)
    ).fetchall()

    return render_template(
        "group/members.html",
        group=group,
        member=member,
        members=members_list,
        active_tab="members",
    )


@bp.route("/membres/<member_id>/retirer", methods=["POST"])
@login_required
def remove_member(group_id, member_id):
    admin = require_admin(group_id)
    if admin["id"] == member_id:
        flash("Utilise « Quitter le groupe » pour te retirer toi-même.", "error")
        return redirect(url_for("groups.members", group_id=group_id))

    db = get_db()
    target = db.execute("SELECT * FROM members WHERE id = ? AND group_id = ?", (member_id, group_id)).fetchone()
    if target is None:
        abort(404)

    db.execute("DELETE FROM members WHERE id = ?", (member_id,))
    db.commit()
    flash(f"{target['pseudo']} a été retiré du groupe.", "success")
    return redirect(url_for("groups.members", group_id=group_id))


@bp.route("/membres/<member_id>/transferer", methods=["POST"])
@login_required
def transfer_admin(group_id, member_id):
    admin = require_admin(group_id)
    if admin["id"] == member_id:
        flash("Tu es déjà admin.", "error")
        return redirect(url_for("groups.members", group_id=group_id))

    db = get_db()
    target = db.execute("SELECT * FROM members WHERE id = ? AND group_id = ?", (member_id, group_id)).fetchone()
    if target is None:
        abort(404)

    db.execute("UPDATE members SET is_admin = false WHERE id = ?", (admin["id"],))
    db.execute("UPDATE members SET is_admin = true WHERE id = ?", (member_id,))
    db.commit()
    flash(f"{target['pseudo']} est maintenant admin du groupe.", "success")
    return redirect(url_for("groups.members", group_id=group_id))


@bp.route("/quitter", methods=["POST"])
@login_required
def leave_group(group_id):
    member = require_membership(group_id)
    db = get_db()

    if member["is_admin"]:
        other_members = db.execute(
            "SELECT COUNT(*) AS c FROM members WHERE group_id = ? AND id != ?", (group_id, member["id"])
        ).fetchone()
        if other_members["c"] > 0:
            flash("Transfère l'administration à quelqu'un avant de quitter le groupe.", "error")
            return redirect(url_for("groups.members", group_id=group_id))

    db.execute("DELETE FROM members WHERE id = ?", (member["id"],))
    db.commit()
    flash("Tu as quitté le groupe.", "success")
    return redirect(url_for("home.index"))
