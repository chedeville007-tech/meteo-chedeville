import os
from datetime import timedelta

from dotenv import load_dotenv
from flask import Flask

from app import db as db_module
from app.auth import current_user
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
        PERMANENT_SESSION_LIFETIME=timedelta(days=30),
    )

    if test_config:
        app.config.update(test_config)

    os.makedirs(app.instance_path, exist_ok=True)

    db_module.init_app(app)

    app.jinja_env.filters["fr_datetime"] = format_datetime_fr
    app.jinja_env.globals["icon_name_for"] = icon_name_for
    app.jinja_env.globals["current_user"] = current_user

    from app.routes import auth, home, groups, matches, profile

    app.register_blueprint(auth.bp)
    app.register_blueprint(home.bp)
    app.register_blueprint(groups.bp)
    app.register_blueprint(matches.bp)
    app.register_blueprint(profile.bp)
    app.register_blueprint(profile.avatar_bp)

    return app
