from fastapi import APIRouter

from app.api.v1.payments import router as payments_router
from app.api.v1.routes import router as health_router

router = APIRouter()
router.include_router(health_router)
router.include_router(payments_router)
