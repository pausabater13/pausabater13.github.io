"""Fetch Google Trends interest over time for food keywords."""
from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from pytrends.request import TrendReq

from grocery_opportunities.config import DEFAULT_FOOD_KEYWORDS, REQUEST_TIMEOUT

logger = logging.getLogger(__name__)


@dataclass
class TrendPoint:
    """Trend value for a keyword at a point in time."""

    keyword: str
    value: int  # 0-100 scale from Google
    date: datetime

    def to_dict(self) -> dict:
        return {
            "keyword": self.keyword,
            "value": self.value,
            "date": self.date.isoformat(),
        }


def fetch_trends_for_keywords(
    keywords: list[str] | None = None,
    *,
    timeframe_days: int = 90,
) -> dict[str, list[TrendPoint]]:
    """Fetch Google Trends interest over time for each keyword.

    Returns a dict mapping keyword -> list of TrendPoint (date, value 0-100).
    """
    keywords = keywords or DEFAULT_FOOD_KEYWORDS
    # pytrends can only do 5 keywords per request
    chunk = 5
    result: dict[str, list[TrendPoint]] = {}

    end = datetime.now(timezone.utc)
    start = end - timedelta(days=timeframe_days)
    timeframe = f"{start.strftime('%Y-%m-%d')} {end.strftime('%Y-%m-%d')}"

    for i in range(0, len(keywords), chunk):
        batch = keywords[i : i + chunk]
        try:
            pytrends = TrendReq(hl="en-US", tz=360, timeout=(REQUEST_TIMEOUT, REQUEST_TIMEOUT))
            pytrends.build_payload(batch, cat=0, timeframe=timeframe, geo="")
            df = pytrends.interest_over_time()
        except Exception as e:
            logger.warning("Trends request failed for %s: %s", batch, e)
            for kw in batch:
                result[kw] = []
            continue

        if df is None or df.empty:
            for kw in batch:
                result[kw] = []
            continue

        for kw in batch:
            if kw not in df.columns:
                result[kw] = []
                continue
            points: list[TrendPoint] = []
            for ts, val in df[kw].items():
                if hasattr(ts, "to_pydatetime"):
                    ts = ts.to_pydatetime()
                if ts.tzinfo is None:
                    ts = ts.replace(tzinfo=timezone.utc)
                points.append(TrendPoint(keyword=kw, value=int(val), date=ts))
            result[kw] = points

    return result
