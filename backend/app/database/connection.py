from sqlalchemy import create_engine

DATABASE_URL = "postgresql://postgres:password@localhost:5432/pillsync"

engine = create_engine(DATABASE_URL)