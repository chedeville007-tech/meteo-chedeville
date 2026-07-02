import os
import secrets

from flask import Flask, g, request

from app import db as db_module
from app.format import format_datetime_fr
from app.sports import icon_name_for


def create_app(test_config: dict | None = None) -> Flask:
    app = Flask(__name__, instance_relative_config=True)
    app.config.from_mapping(
        SECRET_KEY=os.environ.get("SECRET_KEY", "dev-only-secret-change-me"),
        DATABASE_PATH=os.path.join(app.instance_path, "multiprono.sqlite3"),
    )

    if test_config:
        app.config.update(test_config)

    os.makedirs(app.instance_path, exist_ok=True)

    db_module.init_app(app)

    app.jinja_env.filters["fr_datetime"] = format_datetime_fr
    app.jinja_env.globals["icon_name_for"] = icon_name_for

    @app.before_request
    def ensure_device_cookie():
        g.uid = request.cookies.get("mp_uid")
        if not g.uid:
            g.uid = secrets.token_hex(16)
            g.uid_is_new = True
        else:
            g.uid_is_new = False

    @app.after_request
    def persist_device_cookie(response):
        if getattr(g, "uid_is_new", False):
            response.set_cookie(
                "mp_uid",
                g.uid,
                max_age=60 * 60 * 24 * 365,
                httponly=True,
                samesite="Lax",
            )
        return response

    from app.routes import home, groups, matches

    app.register_blueprint(home.bp)
    app.register_blueprint(groups.bp)
    app.register_blueprint(matches.bp)

    with app.app_context():
        if not os.path.exists(app.config["DATABASE_PATH"]):
            db_module.init_db()
            _seed_sports()

    return app


def _seed_sports() -> None:
    from app.db import get_db, new_id
    from app.sports import SEED_SPORTS

    db = get_db()
    for sport in SEED_SPORTS:
        db.execute(
            """
            INSERT INTO sports (id, key, label, allow_draw, color, sort_order)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(key) DO UPDATE SET
                label = excluded.label,
                allow_draw = excluded.allow_draw,
                color = excluded.color,
                sort_order = excluded.sort_order
            """,
            (
                new_id(),
                sport["key"],
                sport["label"],
                int(sport["allow_draw"]),
                sport["color"],
                sport["sort_order"],
            ),
        )
    db.commit()
