"""Generate opportunity ideas and scores from grocery prices + trends."""
from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timezone

from grocery_opportunities.scraper.grocery import GroceryPrice
from grocery_opportunities.trends.google_trends import TrendPoint

logger = logging.getLogger(__name__)


@dataclass
class Opportunity:
    """A derived opportunity idea with score and metadata."""

    title: str
    description: str
    score: float  # 0-100
    category: str
    keywords: list[str]
    price_context: str
    trend_context: str
    created_at: datetime

    def to_dict(self) -> dict:
        return {
            "title": self.title,
            "description": self.description,
            "score": self.score,
            "category": self.category,
            "keywords": self.keywords,
            "price_context": self.price_context,
            "trend_context": self.trend_context,
            "created_at": self.created_at.isoformat(),
        }


def _normalize_for_match(text: str) -> str:
    return " ".join(text.lower().split())


def _match_keyword_to_prices(keyword: str, prices: list[GroceryPrice]) -> list[GroceryPrice]:
    """Return prices whose product name overlaps with keyword terms."""
    kws = set(_normalize_for_match(keyword).split())
    out: list[GroceryPrice] = []
    for p in prices:
        prod = _normalize_for_match(p.product)
        if any(w in prod for w in kws):
            out.append(p)
    return out


def _avg_trend_value(points: list[TrendPoint]) -> float:
    if not points:
        return 0.0
    return sum(p.value for p in points) / len(points)


def _trend_trend(points: list[TrendPoint]) -> float:
    """Simple slope: recent vs older average. Positive = rising interest."""
    if len(points) < 4:
        return 0.0
    mid = len(points) // 2
    older = sum(p.value for p in points[:mid]) / mid
    recent = sum(p.value for p in points[mid:]) / (len(points) - mid)
    return recent - older


def derive_opportunities(
    prices: list[GroceryPrice],
    trends: dict[str, list[TrendPoint]],
) -> list[Opportunity]:
    """Build opportunity ideas from grocery prices and trend data.

    Score combines:
    - Trend level (higher interest = higher score)
    - Trend direction (rising = bonus)
    - Price availability (we have price data = more actionable)
    """
    now = datetime.now(timezone.utc)
    opportunities: list[Opportunity] = []

    for keyword, points in trends.items():
        if not points:
            continue
        avg_trend = _avg_trend_value(points)
        trend_slope = _trend_trend(points)
        matching_prices = _match_keyword_to_prices(keyword, prices)

        # Score 0-100: base from trend level (0-100), plus slope bonus, plus price bonus
        base = min(100, avg_trend)
        slope_bonus = max(0, min(20, trend_slope * 2))
        price_bonus = 10 if matching_prices else 0
        score = min(100.0, round(base + slope_bonus + price_bonus, 1))

        price_context = "No direct price in dataset."
        if matching_prices:
            price_context = "; ".join(
                f"{p.product}: {p.price} {p.unit}" for p in matching_prices[:3]
            )

        trend_context = f"Avg interest {avg_trend:.0f}/100"
        if trend_slope > 1:
            trend_context += "; interest rising."
        elif trend_slope < -1:
            trend_context += "; interest declining."

        title = f"Food opportunity: {keyword}"
        description = (
            f"Trend interest for '{keyword}' averages {avg_trend:.0f}/100. "
            f"Prices in dataset: {price_context}. {trend_context}"
        )
        opportunities.append(
            Opportunity(
                title=title,
                description=description,
                score=score,
                category="Food & Beverage",
                keywords=[keyword],
                price_context=price_context,
                trend_context=trend_context,
                created_at=now,
            )
        )

    # Sort by score descending
    opportunities.sort(key=lambda o: o.score, reverse=True)
    return opportunities
