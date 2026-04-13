from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Any

try:  # pragma: no cover - optional runtime dependency
    import stripe  # type: ignore
except Exception:  # pragma: no cover - stripe is optional in the test environment
    stripe = None


@dataclass(slots=True)
class StripeService:
    """Encapsulates Stripe customer, checkout, and subscription operations."""

    api_key: str | None = None
    stripe_client: Any | None = None

    def __post_init__(self) -> None:
        client = self._client()
        if self.api_key and client is not None:
            client.api_key = self.api_key

    @classmethod
    def from_env(cls) -> "StripeService":
        api_key = os.getenv("STRIPE_SECRET_KEY")
        if not api_key:
            raise RuntimeError("STRIPE_SECRET_KEY is not configured")
        return cls(api_key=api_key)

    def create_or_update_customer(
        self,
        *,
        email: str,
        name: str | None = None,
        metadata: dict[str, str] | None = None,
    ) -> dict[str, Any]:
        client = self._require_client()
        params: dict[str, Any] = {"email": email}
        if name:
            params["name"] = name
        if metadata:
            params["metadata"] = metadata
        customer = client.Customer.create(**params)
        return self._normalize_customer(customer)

    def create_checkout_session(
        self,
        *,
        customer_email: str,
        price_id: str,
        success_url: str,
        cancel_url: str,
        customer_name: str | None = None,
        customer_id: str | None = None,
        quantity: int = 1,
        mode: str = "subscription",
        allow_promotion_codes: bool = True,
        billing_address_collection: str = "auto",
        automatic_tax: bool = False,
        metadata: dict[str, str] | None = None,
        subscription_metadata: dict[str, str] | None = None,
        trial_period_days: int | None = None,
    ) -> dict[str, Any]:
        client = self._require_client()
        resolved_customer_id = customer_id
        customer: dict[str, Any] | None = None

        if resolved_customer_id is None:
            customer = self.create_or_update_customer(
                email=customer_email,
                name=customer_name,
                metadata=metadata,
            )
            resolved_customer_id = customer["id"]

        session_payload: dict[str, Any] = {
            "mode": mode,
            "customer": resolved_customer_id,
            "line_items": [{"price": price_id, "quantity": quantity}],
            "success_url": success_url,
            "cancel_url": cancel_url,
            "allow_promotion_codes": allow_promotion_codes,
            "billing_address_collection": billing_address_collection,
            "automatic_tax": {"enabled": automatic_tax},
        }

        if metadata:
            session_payload["metadata"] = metadata
        if subscription_metadata or trial_period_days is not None:
            session_payload["subscription_data"] = {}
            if subscription_metadata:
                session_payload["subscription_data"]["metadata"] = subscription_metadata
            if trial_period_days is not None:
                session_payload["subscription_data"]["trial_period_days"] = trial_period_days

        session = client.checkout.Session.create(**session_payload)
        normalized_session = self._normalize_session(session)
        if customer is not None:
            normalized_session["customer_details"] = customer
        return normalized_session

    def retrieve_subscription(self, subscription_id: str) -> dict[str, Any]:
        client = self._require_client()
        subscription = client.Subscription.retrieve(subscription_id)
        return self._normalize_subscription(subscription)

    def list_subscriptions(
        self,
        *,
        customer_id: str,
        status: str | None = None,
        limit: int = 10,
    ) -> dict[str, Any]:
        client = self._require_client()
        params: dict[str, Any] = {"customer": customer_id, "limit": limit}
        if status and status != "all":
            params["status"] = status
        subscriptions = client.Subscription.list(**params)
        data = getattr(subscriptions, "data", subscriptions)
        if not isinstance(data, list):
            data = []
        return {
            "customer_id": customer_id,
            "status": status or "all",
            "limit": limit,
            "subscriptions": [self._normalize_subscription(item) for item in data],
        }

    def cancel_subscription(self, subscription_id: str, *, at_period_end: bool = True) -> dict[str, Any]:
        client = self._require_client()
        if at_period_end:
            subscription = client.Subscription.modify(subscription_id, cancel_at_period_end=True)
        else:
            subscription = client.Subscription.cancel(subscription_id)
        return self._normalize_subscription(subscription)

    def reactivate_subscription(self, subscription_id: str) -> dict[str, Any]:
        client = self._require_client()
        subscription = client.Subscription.modify(subscription_id, cancel_at_period_end=False)
        return self._normalize_subscription(subscription)

    def create_billing_portal_session(self, *, customer_id: str, return_url: str) -> dict[str, Any]:
        client = self._require_client()
        session = client.billing_portal.Session.create(customer=customer_id, return_url=return_url)
        return self._normalize_billing_portal_session(session)

    def _client(self) -> Any | None:
        if self.stripe_client is not None:
            return self.stripe_client
        return stripe

    def _require_client(self) -> Any:
        client = self._client()
        if client is None:
            raise RuntimeError(
                "stripe is not installed; add the stripe package to the backend environment to enable payments"
            )
        return client

    @staticmethod
    def _normalize_customer(customer: Any) -> dict[str, Any]:
        payload = StripeService._to_mapping(customer)
        return {
            "id": payload.get("id"),
            "email": payload.get("email"),
            "name": payload.get("name"),
            "metadata": payload.get("metadata", {}),
            "raw": payload,
        }

    @staticmethod
    def _normalize_session(session: Any) -> dict[str, Any]:
        payload = StripeService._to_mapping(session)
        return {
            "id": payload.get("id"),
            "url": payload.get("url"),
            "status": payload.get("status"),
            "mode": payload.get("mode"),
            "customer": payload.get("customer"),
            "subscription": payload.get("subscription"),
            "payment_status": payload.get("payment_status"),
            "expires_at": payload.get("expires_at"),
            "raw": payload,
        }

    @staticmethod
    def _normalize_subscription(subscription: Any) -> dict[str, Any]:
        payload = StripeService._to_mapping(subscription)
        items = payload.get("items") or {}
        data = items.get("data") if isinstance(items, dict) else []
        if not isinstance(data, list):
            data = []
        return {
            "id": payload.get("id"),
            "status": payload.get("status"),
            "cancel_at_period_end": payload.get("cancel_at_period_end"),
            "current_period_start": payload.get("current_period_start"),
            "current_period_end": payload.get("current_period_end"),
            "trial_end": payload.get("trial_end"),
            "customer": payload.get("customer"),
            "items": data,
            "raw": payload,
        }

    @staticmethod
    def _normalize_billing_portal_session(session: Any) -> dict[str, Any]:
        payload = StripeService._to_mapping(session)
        return {
            "id": payload.get("id"),
            "url": payload.get("url"),
            "customer": payload.get("customer"),
            "return_url": payload.get("return_url"),
            "raw": payload,
        }

    @staticmethod
    def _to_mapping(value: Any) -> dict[str, Any]:
        if value is None:
            return {}
        if isinstance(value, dict):
            return value
        for method_name in ("to_dict_recursive", "to_dict"):
            method = getattr(value, method_name, None)
            if callable(method):
                try:
                    result = method()
                    if isinstance(result, dict):
                        return result
                except Exception:
                    pass
        if hasattr(value, "__dict__"):
            return {k: v for k, v in vars(value).items() if not k.startswith("_")}
        result: dict[str, Any] = {}
        for key in ("id", "email", "name", "url", "status", "customer", "subscription", "metadata"):
            if hasattr(value, key):
                result[key] = getattr(value, key)
        return result
