from fastapi import APIRouter

from app.api.v1.athlete_auth import router as athlete_auth_router
from app.api.v1.athlete_files import router as athlete_files_router
from app.api.v1.athlete_onboarding import router as athlete_onboarding_router
from app.api.v1.athlete_workouts import router as athlete_workouts_router
from app.api.v1.athlete_memory import router as athlete_memory_router
from app.api.v1.athlete_profile import router as athlete_profile_router
from app.api.v1.athlete_snapshot import router as athlete_snapshot_router
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
router.include_router(knowledge_base_router)      # COA-85
router.include_router(athlete_auth_router)        # COA-93
router.include_router(athlete_onboarding_router)  # COA-94
router.include_router(athlete_files_router)       # COA-95
router.include_router(athlete_workouts_router)    # COA-116
router.include_router(athlete_memory_router)      # COA-117
router.include_router(athlete_profile_router)     # COA-113
router.include_router(athlete_snapshot_router)    # COA-120
