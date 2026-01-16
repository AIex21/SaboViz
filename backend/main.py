from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.database import engine, Base
from app.routers import graph_router

# Create Database Tables on startup
Base.metadata.create_all(bind=engine)

app = FastAPI(title="Sabo Visualization API")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Update this to ["http://localhost:5173"] in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include Routers
app.include_router(graph_router.router)

@app.get("/")
def health_check():
    return {"status": "ok", "message": "Backend is running"}