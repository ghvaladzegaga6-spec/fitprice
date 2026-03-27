from fastapi import FastAPI, HTTPException, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
import uvicorn
import os
from optimizer.basket import router as basket_router
from nutrition.engine import router as nutrition_router
from data.loader import router as data_router

limiter = Limiter(key_func=get_remote_address)
app = FastAPI(title="FITPRICE Python Service", docs_url=None, redoc_url=None)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "Authorization", "X-Internal-Token"],
)

INTERNAL_TOKEN = os.getenv("INTERNAL_TOKEN", "change-me-in-production")

async def verify_internal_token(request: Request):
    token = request.headers.get("X-Internal-Token")
    if token != INTERNAL_TOKEN:
        raise HTTPException(status_code=403, detail="Forbidden")
    return True

app.include_router(basket_router, prefix="/api/basket", dependencies=[Depends(verify_internal_token)])
app.include_router(nutrition_router, prefix="/api/nutrition", dependencies=[Depends(verify_internal_token)])
app.include_router(data_router, prefix="/api/data", dependencies=[Depends(verify_internal_token)])

@app.get("/health")
async def health():
    return {"status": "ok"}

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=False)
