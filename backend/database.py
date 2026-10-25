from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

# ВАЖНО: вместо admin123 напиши свой пароль от PostgreSQL
SQLALCHEMY_DATABASE_URL = "postgresql://postgres:admin123@localhost:5432/masit_db"

engine = create_engine(SQLALCHEMY_DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()