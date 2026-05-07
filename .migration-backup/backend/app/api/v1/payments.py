from __future__ import annotations

from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field

from app.core.security import AuthenticatedPrincipal, require_roles
from app.services.stripe_service import StripeService

router = APIRouter(prefix="/api/v1/payments", tags=["payments"])


class CheckoutSessionCreateRequest(BaseModel):
    customer_email: str = Field(..., min_length=1)
    price_id: str = Field(..., min_length=1)
    success_url: str = Field(..., min_length=1)
    cancel_url: str = Field(..., min_length=1)
    customer_name: str | None = None
    customer_id: str | None = None
    quantity: int = Field(default=1, ge=1, le=100)
    mode: Literal["payment", "subscription"] = "subscription"
    allow_promotion_codes: bool = True
    billing_address_collection: Literal["auto", "required"] = "auto"
    automatic_tax: bool = False
    metadata: dict[str, str] = Field(default_factory=dict)
    subscription_metadata: dict[str, str] = Field(default_factory=dict)
    trial_period_days: int | None = Field(default=None, ge=0, le=730)


class CheckoutSessionResponse(BaseModel):
    id: str | None = None
    url: str | None = None
    status: str | None = None
    mode: str | None = None
    customer: str | None = None
    subscription: str | None = None
    payment_status: str | None = None
    expires_at: int | None = None
    raw: dict[str, Any] = Field(default_factory=dict)
    customer_details: dict[str, Any] | None = None


class SubscriptionResponse(BaseModel):
    id: str | None = None
    status: str | None = None
    cancel_at_period_end: bool | None = None
    current_period_start: int | None = None
    current_period_end: int | None = None
    trial_end: int | None = None
    customer: str | None = None
    items: list[dict[str, Any]] = Field(default_factory=list)
    raw: dict[str, Any] = Field(default_factory=dict)


class SubscriptionsListResponse(BaseModel):
    customer_id: str
    status: str
    limit: int
    subscriptions: list[SubscriptionResponse]


class CancelSubscriptionRequest(BaseModel):
    at_period_end: bool = True


class BillingPortalSessionRequest(BaseModel):
    customer_id: str = Field(..., min_length=1)
    return_url: str = Field(..., min_length=1)


class BillingPortalSessionResponse(BaseModel):
    id: str | None = None
    url: str | None = None
    customer: str | None = None
    return_url: str | None = None
    raw: dict[str, Any] = Field(default_factory=dict)


async def _resolve_stripe_service(request: Request) -> StripeService:
    service = getattr(request.app.state, "stripe_service", None)
    if service is not None and hasattr(service, "create_checkout_session"):
        return service

    client = getattr(request.app.state, "stripe_client", None)
    if client is not None:
        return StripeService(stripe_client=client)

    try:
        return StripeService.from_env()
    except Exception as exc:
        raise HTTPException(status_code=503, detail="Stripe is not configured") from exc


@router.post("/checkout-sessions", response_model=CheckoutSessionResponse)
async def create_checkout_session(request: Request, payload: CheckoutSessionCreateRequest, principal: AuthenticatedPrincipal = Depends(require_roles("coach"))) -> CheckoutSessionResponse:
    service = await _resolve_stripe_service(request)
    try:
        result = service.create_checkout_session(
            customer_email=payload.customer_email,
            price_id=payload.price_id,
            success_url=payload.success_url,
            cancel_url=payload.cancel_url,
            customer_name=payload.customer_name,
            customer_id=payload.customer_id,
            quantity=payload.quantity,
            mode=payload.mode,
            allow_promotion_codes=payload.allow_promotion_codes,
            billing_address_collection=payload.billing_address_collection,
            automatic_tax=payload.automatic_tax,
            metadata=payload.metadata or None,
            subscription_metadata=payload.subscription_metadata or None,
            trial_period_days=payload.trial_period_days,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return CheckoutSessionResponse.model_validate(result)


@router.get("/subscriptions/{subscription_id}", response_model=SubscriptionResponse)
async def retrieve_subscription(request: Request, subscription_id: str, principal: AuthenticatedPrincipal = Depends(require_roles("coach"))) -> SubscriptionResponse:
    service = await _resolve_stripe_service(request)
    try:
        result = service.retrieve_subscription(subscription_id)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return SubscriptionResponse.model_validate(result)


@router.get("/customers/{customer_id}/subscriptions", response_model=SubscriptionsListResponse)
async def list_subscriptions(
    request: Request,
    customer_id: str,
    status: str | None = None,
    limit: int = Query(default=10, ge=1, le=100),
    principal: AuthenticatedPrincipal = Depends(require_roles("coach")),
) -> SubscriptionsListResponse:
    service = await _resolve_stripe_service(request)
    try:
        result = service.list_subscriptions(customer_id=customer_id, status=status, limit=limit)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    result["subscriptions"] = [SubscriptionResponse.model_validate(item) for item in result.get("subscriptions", [])]
    return SubscriptionsListResponse.model_validate(result)


@router.post("/subscriptions/{subscription_id}/cancel", response_model=SubscriptionResponse)
async def cancel_subscription(
    request: Request,
    subscription_id: str,
    payload: CancelSubscriptionRequest,
    principal: AuthenticatedPrincipal = Depends(require_roles("coach")),
) -> SubscriptionResponse:
    service = await _resolve_stripe_service(request)
    try:
        result = service.cancel_subscription(subscription_id, at_period_end=payload.at_period_end)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return SubscriptionResponse.model_validate(result)


@router.post("/subscriptions/{subscription_id}/reactivate", response_model=SubscriptionResponse)
async def reactivate_subscription(request: Request, subscription_id: str, principal: AuthenticatedPrincipal = Depends(require_roles("coach"))) -> SubscriptionResponse:
    service = await _resolve_stripe_service(request)
    try:
        result = service.reactivate_subscription(subscription_id)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return SubscriptionResponse.model_validate(result)


@router.post("/billing-portal-sessions", response_model=BillingPortalSessionResponse)
async def create_billing_portal_session(
    request: Request,
    payload: BillingPortalSessionRequest,
    principal: AuthenticatedPrincipal = Depends(require_roles("coach")),
) -> BillingPortalSessionResponse:
    service = await _resolve_stripe_service(request)
    try:
        result = service.create_billing_portal_session(
            customer_id=payload.customer_id,
            return_url=payload.return_url,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return BillingPortalSessionResponse.model_validate(result)
