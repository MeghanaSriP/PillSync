from sqlalchemy import Column, Integer, String, Date, Text
from app.database.connection import Base


class Medicine(Base):
    __tablename__ = "medicines"

    medicine_id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer)
    medicine_name = Column(String(100), nullable=False)
    dosage = Column(String(50), nullable=False)
    frequency = Column(String(50), nullable=False)
    start_date = Column(Date)
    end_date = Column(Date)
    instructions = Column(Text)