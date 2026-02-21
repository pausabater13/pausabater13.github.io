"""Notion API client: create opportunity pages and set Status to Decision Required when score > threshold."""
from __future__ import annotations

import logging
from typing import Any

from notion_client import Client

from grocery_opportunities.config import (
    NOTION_API_KEY,
    NOTION_DATABASE_ID,
    NOTION_PROP_CATEGORY,
    NOTION_PROP_DESCRIPTION,
    NOTION_PROP_KEYWORDS,
    NOTION_PROP_SCORE,
    NOTION_PROP_STATUS,
    NOTION_PROP_TITLE,
    OPPORTUNITY_SCORE_THRESHOLD,
    STATUS_DECISION_REQUIRED,
)
from grocery_opportunities.opportunities.engine import Opportunity

logger = logging.getLogger(__name__)

# Notion rich text content is limited to 2000 chars per block
MAX_RICH_TEXT_LEN = 2000


def _truncate(s: str, max_len: int = MAX_RICH_TEXT_LEN) -> str:
    if len(s) <= max_len:
        return s
    return s[: max_len - 3] + "..."


def _build_page_properties(opp: Opportunity, score_above_threshold: bool) -> dict[str, Any]:
    """Build Notion page properties for one opportunity."""
    props: dict[str, Any] = {
        NOTION_PROP_TITLE: {
            "title": [{"type": "text", "text": {"content": _truncate(opp.title, 2000)}}],
        },
        NOTION_PROP_DESCRIPTION: {
            "rich_text": [{"type": "text", "text": {"content": _truncate(opp.description)}}],
        },
        NOTION_PROP_SCORE: {"number": opp.score},
        NOTION_PROP_CATEGORY: {
            "rich_text": [{"type": "text", "text": {"content": _truncate(opp.category, 200)}}],
        },
        NOTION_PROP_KEYWORDS: {
            "rich_text": [
                {"type": "text", "text": {"content": _truncate(", ".join(opp.keywords), 2000)}}
            ],
        },
    }
    # Status: set to Decision Required when score > threshold
    status_value = STATUS_DECISION_REQUIRED if score_above_threshold else "New"
    props[NOTION_PROP_STATUS] = {"select": {"name": status_value}}
    return props


def push_opportunities_to_notion(
    opportunities: list[Opportunity],
    *,
    database_id: str | None = None,
    threshold: int | None = None,
) -> list[str]:
    """Create a Notion page for each opportunity. Set Status to 'Decision Required' when score > threshold.

    Returns list of created page IDs.
    """
    database_id = database_id or NOTION_DATABASE_ID
    threshold = threshold if threshold is not None else OPPORTUNITY_SCORE_THRESHOLD

    if not NOTION_API_KEY or not database_id:
        logger.error("NOTION_API_KEY and NOTION_DATABASE_ID must be set")
        return []

    client = Client(auth=NOTION_API_KEY)
    created_ids: list[str] = []

    for opp in opportunities:
        score_above = opp.score > threshold
        properties = _build_page_properties(opp, score_above)
        try:
            resp = client.pages.create(
                parent={"database_id": database_id},
                properties=properties,
            )
            page_id = resp.get("id")
            if page_id:
                created_ids.append(page_id)
                status_label = STATUS_DECISION_REQUIRED if score_above else "New"
                logger.info(
                    "Created page %s for '%s' (score=%.1f, status=%s)",
                    page_id[:8],
                    opp.title[:40],
                    opp.score,
                    status_label,
                )
        except Exception as e:
            logger.exception("Failed to create Notion page for '%s': %s", opp.title, e)

    return created_ids
