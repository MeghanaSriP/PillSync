from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database.connection import Base, engine

# Import models so SQLAlchemy knows about them
import app.models.user
import app.models.medicine

from app.api.auth import router as auth_router
from app.api.medicine import router as medicine_router

# Create all database tables
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="PillSync API",
    version="1.0.0",
    description="Backend API for the PillSync Medication Management System"
)

# Enable CORS (needed when frontend calls backend)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # For development only
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def root():
    return {
        "message": "Welcome to PillSync API!",
        "status": "Backend is running successfully."
    }

# Register API Routers
app.include_router(auth_router)
app.include_router(medicine_router)