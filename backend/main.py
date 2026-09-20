from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from api.routes import router
from api.websocket import ws_router
from api.auth import auth_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup initialization
    yield
    # Teardown / cleanup


app = FastAPI(
    title="QPath API - Quantum-Inspired Traffic Route Optimization",
    version="1.0.0",
    description="Backend optimization engine for SIH 2026 Problem Statement 26137",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)
app.include_router(ws_router)
app.include_router(auth_router)


@app.get("/")
async def root():
    return {
        "message": "QPath API is online",
        "version": "1.0.0",
        "docs_url": "/docs"
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
