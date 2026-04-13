from __future__ import annotations

from types import SimpleNamespace

from fastapi.testclient import TestClient

from app.main import app


class FakeStripeService:
    def __init__(self) -> None:
        self.calls: list[tuple[str, tuple, dict]] = []

    def create_checkout_session(self, **kwargs):
        self.calls.append(("create_checkout_session", (), kwargs))
        return {
            "id": "cs_test_123",
            "url": "https://checkout.stripe.test/session",
            "status": "open",
            "mode": kwargs.get("mode"),
            "customer": "cus_test_123",
            "subscription": None,
            "payment_status": None,
            "expires_at": 1234567890,
            "raw": {"ok": True},
            "customer_details": {"id": "cus_test_123", "email": kwargs["customer_email"]},
        }

    def retrieve_subscription(self, subscription_id: str):
        self.calls.append(("retrieve_subscription", (subscription_id,), {}))
        return {
            "id": subscription_id,
            "status": "active",
            "cancel_at_period_end": False,
            "current_period_start": 1,
            "current_period_end": 2,
            "trial_end": None,
            "customer": "cus_test_123",
            "items": [{"price": "price_test"}],
            "raw": {"id": subscription_id},
        }

    def list_subscriptions(self, *, customer_id: str, status: str | None = None, limit: int = 10):
        self.calls.append(("list_subscriptions", (), {"customer_id": customer_id, "status": status, "limit": limit}))
        return {
            "customer_id": customer_id,
            "status": status or "all",
            "limit": limit,
            "subscriptions": [
                {
                    "id": "sub_123",
                    "status": "active",
                    "cancel_at_period_end": False,
                    "current_period_start": 1,
                    "current_period_end": 2,
                    "trial_end": None,
                    "customer": customer_id,
                    "items": [],
                    "raw": {"id": "sub_123"},
                }
            ],
        }

    def cancel_subscription(self, subscription_id: str, *, at_period_end: bool = True):
        self.calls.append(("cancel_subscription", (subscription_id,), {"at_period_end": at_period_end}))
        return {
            "id": subscription_id,
            "status": "active",
            "cancel_at_period_end": at_period_end,
            "current_period_start": 1,
            "current_period_end": 2,
            "trial_end": None,
            "customer": "cus_test_123",
            "items": [],
            "raw": {"id": subscription_id},
        }

    def reactivate_subscription(self, subscription_id: str):
        self.calls.append(("reactivate_subscription", (subscription_id,), {}))
        return {
            "id": subscription_id,
            "status": "active",
            "cancel_at_period_end": False,
            "current_period_start": 1,
            "current_period_end": 2,
            "trial_end": None,
            "customer": "cus_test_123",
            "items": [],
            "raw": {"id": subscription_id},
        }

    def create_billing_portal_session(self, *, customer_id: str, return_url: str):
        self.calls.append(("create_billing_portal_session", (), {"customer_id": customer_id, "return_url": return_url}))
        return {"id": "bps_test_123", "url": "https://portal.stripe.test", "customer": customer_id, "return_url": return_url, "raw": {"id": "bps_test_123"}}


client = TestClient(app)


def test_create_checkout_session(monkeypatch) -> None:
    fake_service = FakeStripeService()
    app.state.stripe_service = fake_service

    response = client.post(
        "/api/v1/payments/checkout-sessions",
        json={
            "customer_email": "athlete@example.com",
            "price_id": "price_123",
            "success_url": "https://example.com/success",
            "cancel_url": "https://example.com/cancel",
            "customer_name": "Athlete",
            "metadata": {"coach_id": "coach_123"},
            "subscription_metadata": {"plan": "monthly"},
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["id"] == "cs_test_123"
    assert body["url"] == "https://checkout.stripe.test/session"
    assert body["customer_details"]["email"] == "athlete@example.com"
    assert fake_service.calls[0][0] == "create_checkout_session"


def test_subscription_management_endpoints() -> None:
    fake_service = FakeStripeService()
    app.state.stripe_service = fake_service

    retrieve_response = client.get("/api/v1/payments/subscriptions/sub_123")
    list_response = client.get("/api/v1/payments/customers/cus_123/subscriptions?status=active&limit=5")
    cancel_response = client.post("/api/v1/payments/subscriptions/sub_123/cancel", json={"at_period_end": True})
    reactivate_response = client.post("/api/v1/payments/subscriptions/sub_123/reactivate")
    portal_response = client.post(
        "/api/v1/payments/billing-portal-sessions",
        json={"customer_id": "cus_123", "return_url": "https://example.com/account"},
    )

    assert retrieve_response.status_code == 200
    assert retrieve_response.json()["id"] == "sub_123"

    assert list_response.status_code == 200
    assert list_response.json()["customer_id"] == "cus_123"
    assert list_response.json()["subscriptions"][0]["id"] == "sub_123"

    assert cancel_response.status_code == 200
    assert cancel_response.json()["cancel_at_period_end"] is True

    assert reactivate_response.status_code == 200
    assert reactivate_response.json()["cancel_at_period_end"] is False

    assert portal_response.status_code == 200
    assert portal_response.json()["id"] == "bps_test_123"
