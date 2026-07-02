import uuid

import psycopg2
import psycopg2.extras
from flask import current_app, g


def new_id() -> str:
    return uuid.uuid4().hex


class DB:
    """Fine couche autour d'une connexion psycopg2 : accepte les requêtes écrites
    avec des placeholders `?` (style sqlite historique) et les traduit en `%s`."""

    def __init__(self, dsn: str):
        self._conn = psycopg2.connect(dsn, cursor_factory=psycopg2.extras.RealDictCursor)

    def execute(self, sql: str, params=()):
        cur = self._conn.cursor()
        cur.execute(sql.replace("?", "%s"), params)
        return cur

    def commit(self) -> None:
        self._conn.commit()

    def close(self) -> None:
        self._conn.close()


def get_db() -> DB:
    if "db" not in g:
        g.db = DB(current_app.config["DATABASE_URL"])
    return g.db


def close_db(_exception=None) -> None:
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_app(app) -> None:
    app.teardown_appcontext(close_db)
