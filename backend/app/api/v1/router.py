from fastapi import APIRouter

from app.api.v1.invites import router as invites_router
from app.api.v1.routes import router as health_router

router = APIRouter()
router.include_router(health_router)
router.include_router(invites_router)
