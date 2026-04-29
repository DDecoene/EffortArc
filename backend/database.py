from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker
import os

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:////data/hike.db")

# connect_args is SQLite-only; omit for PostgreSQL
if DATABASE_URL.startswith("sqlite"):
    engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
else:
    engine = create_engine(DATABASE_URL)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_alembic_config():
    """Return an Alembic Config for programmatic use (e.g. tests)."""
    from alembic.config import Config
    cfg = Config("/app/alembic.ini")
    cfg.set_main_option("sqlalchemy.url", DATABASE_URL)
    return cfg
