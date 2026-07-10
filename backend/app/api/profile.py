from fastapi import APIRouter

router = APIRouter()

@router.get("/profile")
def get_profile():
    return {"message": "Profile Details"}

@router.put("/profile")
def update_profile():
    return {"message": "Profile Updated"}