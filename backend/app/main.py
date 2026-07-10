from fastapi import FastAPI

# Create the FastAPI application
app = FastAPI(
    title="PillSync API",
    version="1.0.0",
    description="Backend API for the PillSync Medication Management System"
)

# Home route
@app.get("/")
def root():
    return {
        "message": "Welcome to PillSync API!",
        "status": "Backend is running successfully."
    }