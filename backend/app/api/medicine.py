from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database.connection import get_db
from app.models.medicine import Medicine
from app.schemas.medicine import MedicineCreate, MedicineResponse

router = APIRouter(
    prefix="/medicines",
    tags=["Medicines"]
)


@router.post("/", response_model=MedicineResponse)
def add_medicine(
    medicine: MedicineCreate,
    db: Session = Depends(get_db)
):

    new_medicine = Medicine(
        user_id=medicine.user_id,
        medicine_name=medicine.medicine_name,
        dosage=medicine.dosage,
        frequency=medicine.frequency,
        start_date=medicine.start_date,
        end_date=medicine.end_date,
        instructions=medicine.instructions
    )

    db.add(new_medicine)
    db.commit()
    db.refresh(new_medicine)

    return new_medicine


@router.get("/", response_model=list[MedicineResponse])
def get_medicines(db: Session = Depends(get_db)):

    medicines = db.query(Medicine).all()

    return medicines