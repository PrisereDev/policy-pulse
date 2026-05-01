"""
Clerk webhooks — sync account lifecycle to the local database.

Configure in Clerk Dashboard → Webhooks → Add Endpoint:
  URL: https://<your-api-host>/v1/webhooks/clerk
  Subscribe to: user.deleted
  Copy the signing secret into CLERK_WEBHOOK_SIGNING_SECRET (starts with whsec_).
"""
from __future__ import annotations

import json
import logging
from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session
from svix.webhooks import Webhook, WebhookVerificationError

from app.config import settings
from app.database import get_db
from app.models.user import User

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1/webhooks", tags=["webhooks"])


def _svix_header_dict(request: Request) -> Dict[str, str]:
    """Collect Svix verification headers (lowercase keys per ASGI)."""
    headers: Dict[str, str] = {}
    for key in ("svix-id", "svix-timestamp", "svix-signature"):
        val = request.headers.get(key)
        if not val:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Missing webhook header: {key}",
            )
        headers[key] = val
    return headers


@router.post("/clerk")
async def clerk_webhook(request: Request, db: Session = Depends(get_db)):
    """
    Receive Clerk webhooks. On user.deleted, remove the user and cascaded data from Postgres.
    """
    logger.info(
        "Clerk webhook POST received path=%s content_length=%s",
        request.url.path,
        request.headers.get("content-length"),
    )

    if not settings.clerk_webhook_signing_secret:
        logger.error("CLERK_WEBHOOK_SIGNING_SECRET is empty; rejecting with 503")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Webhook endpoint not configured",
        )

    body = await request.body()
    try:
        headers = _svix_header_dict(request)
    except HTTPException as e:
        logger.warning(
            "Clerk webhook missing Svix headers after read: detail=%s body_len=%s",
            e.detail,
            len(body),
        )
        raise

    logger.info(
        "Clerk webhook Svix headers present svix-id=%s...",
        (headers.get("svix-id") or "")[:12],
    )

    try:
        wh = Webhook(settings.clerk_webhook_signing_secret)
    except Exception as e:
        logger.exception(
            "Invalid CLERK_WEBHOOK_SIGNING_SECRET (expect whsec_ + valid base64 payload): %s",
            e,
        )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Invalid webhook signing secret configuration",
        ) from e

    try:
        payload: Any = wh.verify(body, headers)
    except WebhookVerificationError as e:
        logger.warning(
            "Clerk webhook signature verification failed: %s (body_len=%s)",
            e,
            len(body),
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid webhook signature",
        ) from e

    logger.info("Clerk webhook signature verified successfully")

    if isinstance(payload, (bytes, str)):
        try:
            event = json.loads(payload)
        except json.JSONDecodeError as e:
            logger.error("Clerk webhook payload is not valid JSON")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid JSON payload",
            ) from e
    elif isinstance(payload, dict):
        event = payload
    else:
        logger.error("Unexpected webhook payload type: %s", type(payload))
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unexpected payload type",
        )

    event_type = event.get("type")
    logger.info("Clerk webhook parsed event_type=%s", event_type)

    if event_type != "user.deleted":
        # Acknowledge other events so Clerk does not retry indefinitely.
        logger.info("Clerk webhook ignoring unsupported event_type=%s", event_type)
        return {"received": True, "ignored": event_type}

    data = event.get("data") or {}
    clerk_user_id = data.get("id")
    if not clerk_user_id or not isinstance(clerk_user_id, str):
        logger.error("user.deleted webhook missing data.id: %s", event)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing user id in event data",
        )

    # Local PK `users.id` is the Clerk user id string (same as JWT `sub`). No separate `clerk_id` column.
    user = db.query(User).filter(User.id == clerk_user_id).first()
    if user:
        logger.info(
            "Clerk user.deleted: lookup key=users.id match=yes clerk_user_id=%s; deleting row",
            clerk_user_id,
        )
        try:
            db.delete(user)
            db.commit()
            logger.info(
                "Clerk user.deleted: committed delete for clerk_user_id=%s (ORM cascades analysis_jobs/results)",
                clerk_user_id,
            )
        except Exception as e:
            db.rollback()
            logger.exception("Failed to delete user %s from webhook: %s", clerk_user_id, e)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to delete user data",
            ) from e
        logger.info(
            "Clerk webhook handler completed OK for clerk_user_id=%s deleted=true",
            clerk_user_id,
        )
        return {
            "received": True,
            "user_id": clerk_user_id,
            "local_user_existed": True,
            "deleted": True,
        }

    logger.warning(
        "Clerk user.deleted: lookup key=users.id match=no clerk_user_id=%s — "
        "no local User row (returns 200 idempotent; user may never have hit an API that creates rows)",
        clerk_user_id,
    )
    logger.info("Clerk webhook handler completed OK for clerk_user_id=%s deleted=false", clerk_user_id)
    return {
        "received": True,
        "user_id": clerk_user_id,
        "local_user_existed": False,
        "deleted": False,
    }
