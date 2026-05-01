"""
Tests for POST /v1/webhooks/clerk (Clerk user lifecycle webhooks).

Svix signature verification is mocked; persistence uses in-memory SQLite via conftest.
Includes one end-to-end test with real Svix sign/verify (no mock).
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from unittest.mock import patch

import pytest
from svix.webhooks import Webhook, WebhookVerificationError

from app.models.analysis_job import AnalysisJob, JobStatus
from app.models.analysis_result import AnalysisResult
from app.models.user import User
from app.routers import webhooks as webhooks_module

SVIX_HEADERS = {
    "svix-id": "msg_01test",
    "svix-timestamp": "1234567890",
    "svix-signature": "v1,placeholder",
}

WEBHOOK_SECRET = "whsec_test_automation"


def _post_webhook(client, body: bytes = b"{}") -> object:
    return client.post(
        "/v1/webhooks/clerk",
        content=body,
        headers={
            **SVIX_HEADERS,
            "content-type": "application/json",
        },
    )


def _http_error_message(response) -> str:
    return response.json()["error"]["message"]


@pytest.fixture
def webhook_secret_configured(monkeypatch):
    monkeypatch.setattr(
        webhooks_module.settings,
        "clerk_webhook_signing_secret",
        WEBHOOK_SECRET,
    )


@patch("app.routers.webhooks.Webhook")
def test_user_deleted_deletes_matching_user_and_related_rows(
    mock_webhook_class,
    webhook_secret_configured,
    db_session,
    client,
):
    clerk_id = "user_clerk_del_001"
    mock_webhook_class.return_value.verify.return_value = {
        "type": "user.deleted",
        "data": {"id": clerk_id},
    }

    user = User(
        id=clerk_id,
        email="delme@example.com",
        name="Del Me",
    )
    db_session.add(user)
    db_session.commit()

    job_id = str(uuid.uuid4())
    job = AnalysisJob(
        id=job_id,
        user_id=clerk_id,
        baseline_s3_key="k/baseline.pdf",
        renewal_s3_key=None,
        baseline_filename="b.pdf",
        renewal_filename=None,
        status=JobStatus.COMPLETED,
    )
    db_session.add(job)
    result = AnalysisResult(
        job_id=job_id,
        total_changes=1,
        model_version="test-model",
    )
    db_session.add(result)
    db_session.commit()

    response = _post_webhook(client)
    assert response.status_code == 200
    body = response.json()
    assert body["received"] is True
    assert body["user_id"] == clerk_id
    assert body["local_user_existed"] is True
    assert body["deleted"] is True

    assert db_session.query(User).filter(User.id == clerk_id).first() is None
    assert db_session.query(AnalysisJob).filter(AnalysisJob.id == job_id).first() is None
    assert (
        db_session.query(AnalysisResult).filter(AnalysisResult.job_id == job_id).first()
        is None
    )


@patch("app.routers.webhooks.Webhook")
def test_user_deleted_idempotent_when_no_local_user(
    mock_webhook_class,
    webhook_secret_configured,
    client,
):
    mock_webhook_class.return_value.verify.return_value = {
        "type": "user.deleted",
        "data": {"id": "user_never_synced"},
    }

    response = _post_webhook(client)
    assert response.status_code == 200
    data = response.json()
    assert data["received"] is True
    assert data["user_id"] == "user_never_synced"
    assert data["local_user_existed"] is False
    assert data["deleted"] is False


@patch("app.routers.webhooks.Webhook")
def test_invalid_signature_returns_400(
    mock_webhook_class,
    webhook_secret_configured,
    client,
):
    mock_webhook_class.return_value.verify.side_effect = WebhookVerificationError(
        "invalid signature"
    )

    response = _post_webhook(client)
    assert response.status_code == 400
    assert _http_error_message(response) == "Invalid webhook signature"


def test_missing_webhook_signing_secret_returns_503(monkeypatch, client):
    monkeypatch.setattr(webhooks_module.settings, "clerk_webhook_signing_secret", "")

    response = _post_webhook(client)
    assert response.status_code == 503
    assert _http_error_message(response) == "Webhook endpoint not configured"


@patch("app.routers.webhooks.Webhook")
def test_unsupported_event_type_returns_200_ignored(
    mock_webhook_class,
    webhook_secret_configured,
    client,
):
    mock_webhook_class.return_value.verify.return_value = {
        "type": "user.created",
        "data": {"id": "user_x"},
    }

    response = _post_webhook(client)
    assert response.status_code == 200
    assert response.json() == {"received": True, "ignored": "user.created"}


@patch("app.routers.webhooks.Webhook")
def test_user_deleted_commit_failure_returns_500(
    mock_webhook_class,
    webhook_secret_configured,
    db_session,
    client,
):
    clerk_id = "user_commit_fail"
    mock_webhook_class.return_value.verify.return_value = {
        "type": "user.deleted",
        "data": {"id": clerk_id},
    }

    user = User(
        id=clerk_id,
        email="fail@example.com",
        name="Fail",
    )
    db_session.add(user)
    db_session.commit()

    with patch.object(
        db_session,
        "commit",
        side_effect=RuntimeError("database unavailable"),
    ):
        response = _post_webhook(client)

    assert response.status_code == 500
    assert _http_error_message(response) == "Failed to delete user data"
    db_session.rollback()


def test_user_deleted_invalid_signing_secret_format_returns_503(
    monkeypatch, client
):
    monkeypatch.setattr(
        webhooks_module.settings,
        "clerk_webhook_signing_secret",
        # Not valid base64 after stripping whsec_; Webhook() raises during init.
        "short",
    )
    response = _post_webhook(client)
    assert response.status_code == 503
    assert (
        _http_error_message(response) == "Invalid webhook signing secret configuration"
    )


def test_user_deleted_with_real_svix_signature_no_mock_roundtrip(
    webhook_secret_configured,
    db_session,
    client,
):
    """Ensures verify() + handler work with a real Svix signature (catches secret/header/body bugs)."""
    clerk_id = "user_svix_roundtrip_001"
    user = User(
        id=clerk_id,
        email="roundtrip@example.com",
        name="Round Trip",
    )
    db_session.add(user)
    db_session.commit()

    event = {"type": "user.deleted", "data": {"id": clerk_id}}
    body_bytes = json.dumps(event, separators=(",", ":")).encode("utf-8")
    msg_id = "msg_svix_roundtrip_test"
    ts = datetime.now(timezone.utc)

    wh = Webhook(WEBHOOK_SECRET)
    sig = wh.sign(msg_id, ts, body_bytes.decode("utf-8"))
    headers = {
        "svix-id": msg_id,
        "svix-timestamp": str(int(ts.timestamp())),
        "svix-signature": sig,
        "content-type": "application/json",
    }

    response = client.post("/v1/webhooks/clerk", content=body_bytes, headers=headers)
    assert response.status_code == 200
    j = response.json()
    assert j["user_id"] == clerk_id
    assert j["deleted"] is True

    assert db_session.query(User).filter(User.id == clerk_id).first() is None


@patch("app.routers.webhooks.Webhook")
def test_user_deleted_missing_data_id_returns_400(
    mock_webhook_class,
    webhook_secret_configured,
    client,
):
    mock_webhook_class.return_value.verify.return_value = {
        "type": "user.deleted",
        "data": {},
    }

    response = _post_webhook(client)
    assert response.status_code == 400
    assert _http_error_message(response) == "Missing user id in event data"
