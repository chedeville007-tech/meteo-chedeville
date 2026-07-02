import os
import secrets

from dotenv import load_dotenv
from flask import Flask, g, request

from app import db as db_module
from app.format import format_datetime_fr
from app.sports import icon_name_for

load_dotenv()


def create_app(test_config: dict | None = None) -> Flask:
    app = Flask(__name__, instance_relative_config=True)

    database_url = os.environ.get("DATABASE_URL")
    if not database_url and not test_config:
        raise RuntimeError(
            "DATABASE_URL manquant. Copie .env.example vers .env et renseigne la "
            "connection string PostgreSQL (Supabase -> Connect -> Direct -> Session pooler)."
        )

    app.config.from_mapping(
        SECRET_KEY=os.environ.get("SECRET_KEY", "dev-only-secret-change-me"),
        DATABASE_URL=database_url,
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

    return app
