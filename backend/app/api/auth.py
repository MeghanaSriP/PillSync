from fastapi import APIRouter

router = APIRouter()

@router.post("/register")
def register():
    return {"message": "User Registration"}

@router.post("/login")
def login():
    return {"message": "User Login"}

@router.post("/logout")
def logout():
    return {"message": "User Logout"}