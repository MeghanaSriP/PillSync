from pydantic import BaseModel
from datetime import date
from typing import Optional


class MedicineCreate(BaseModel):
    user_id: int
    medicine_name: str
    dosage: str
    frequency: str
    start_date: date
    end_date: date
    instructions: Optional[str] = None


class MedicineResponse(MedicineCreate):
    medicine_id: int

    class Config:
        from_attributes = True