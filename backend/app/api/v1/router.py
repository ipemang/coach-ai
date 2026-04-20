from fastapi import APIRouter

from app.api.v1.knowledge_base import router as knowledge_base_router
from app.api.v1.race_day import router as race_day_router
from app.api.v1.routes import router as health_router

router = APIRouter()
router.include_router(health_router)
# COA-23: disabled until auth is implemented
# router.include_router(invites_router)
# router.include_router(payments_router)
# router.include_router(integrations_router)
# router.include_router(integrations_webhooks_router)
router.include_router(race_day_router)
router.include_router(knowledge_base_router)  # COA-85
