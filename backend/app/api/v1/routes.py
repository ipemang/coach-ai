from fastapi import APIRouter

from app.agents.check_in import AthleteCheckIn, CheckInRecommendation, assess_check_in, persist_check_in_state

router = APIRouter(tags=["health"])


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@router.post("/check-in", response_model=CheckInRecommendation)
def check_in(payload: AthleteCheckIn) -> CheckInRecommendation:
    recommendation = assess_check_in(payload)
    persist_check_in_state(payload, recommendation)
    return recommendation
