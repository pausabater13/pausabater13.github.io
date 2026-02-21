"""Scrape or fetch grocery pricing data.

Supports a mock data source (for testing) and an optional live scraper.
Set GROCERY_USE_MOCK=1 to use mock data; otherwise attempts live fetch.
"""
from __future__ import annotations

import logging
import os
import re
from dataclasses import dataclass
from datetime import datetime, timezone

import requests
from bs4 import BeautifulSoup

from grocery_opportunities.config import REQUEST_TIMEOUT

logger = logging.getLogger(__name__)

USE_MOCK = os.environ.get("GROCERY_USE_MOCK", "").strip().lower() in ("1", "true", "yes")


@dataclass
class GroceryPrice:
    """Single grocery price record."""

    product: str
    price: float
    unit: str
    source: str
    fetched_at: datetime

    def to_dict(self) -> dict:
        return {
            "product": self.product,
            "price": self.price,
            "unit": self.unit,
            "source": self.source,
            "fetched_at": self.fetched_at.isoformat(),
        }


def _mock_prices() -> list[GroceryPrice]:
    """Return mock grocery prices for testing without hitting external sites."""
    now = datetime.now(timezone.utc)
    return [
        GroceryPrice("organic vegetables basket", 12.99, "basket", "mock", now),
        GroceryPrice("avocado", 1.49, "each", "mock", now),
        GroceryPrice("olive oil 500ml", 8.99, "bottle", "mock", now),
        GroceryPrice("almond milk 1L", 3.49, "carton", "mock", now),
        GroceryPrice("oat milk 1L", 2.99, "carton", "mock", now),
        GroceryPrice("quinoa 500g", 4.99, "bag", "mock", now),
        GroceryPrice("chia seeds 250g", 5.49, "bag", "mock", now),
        GroceryPrice("kombucha 330ml", 2.49, "bottle", "mock", now),
        GroceryPrice("kefir 500ml", 3.99, "bottle", "mock", now),
    ]


def _parse_price(text: str) -> float | None:
    """Extract numeric price from text like '$2.99' or '2,99 €'."""
    if not text:
        return None
    # Remove currency symbols and spaces, replace comma with dot
    cleaned = re.sub(r"[^\d.,]", "", text.strip()).replace(",", ".")
    match = re.search(r"\d+\.?\d*", cleaned)
    if match:
        try:
            return float(match.group())
        except ValueError:
            return None
    return None


def _scrape_public_prices() -> list[GroceryPrice]:
    """Attempt to fetch prices from a public-friendly source.

    Falls back to mock data if the request fails or parsing yields nothing.
    """
    # Example: USDA AMS has some public data; for robustness we use a simple
    # placeholder URL that may 404 - then we fall back to mock.
    # Replace with your preferred public price source or keep mock for demos.
    url = os.environ.get(
        "GROCERY_SCRAPE_URL",
        "https://www.ams.usda.gov/mnreports/jk_retail.csv",
    )
    now = datetime.now(timezone.utc)
    try:
        resp = requests.get(url, timeout=REQUEST_TIMEOUT)
        resp.raise_for_status()
    except Exception as e:
        logger.warning("Grocery fetch failed (%s), using mock data: %s", url, e)
        return _mock_prices()

    # CSV from USDA or similar: parse and normalize to GroceryPrice
    lines = resp.text.strip().splitlines()
    if not lines:
        return _mock_prices()

    result: list[GroceryPrice] = []
    # Simple CSV: assume header in first line, then data
    for line in lines[1:11]:  # limit rows
        parts = [p.strip().strip('"') for p in line.split(",")]
        if len(parts) >= 2:
            product = parts[0] or "unknown"
            price_val = _parse_price(parts[1]) if len(parts) > 1 else None
            if price_val is not None:
                result.append(
                    GroceryPrice(
                        product=product[:200],
                        price=round(price_val, 2),
                        unit=parts[2] if len(parts) > 2 else "unit",
                        source="usda_ams",
                        fetched_at=now,
                    )
                )
    if not result:
        return _mock_prices()
    return result


def scrape_grocery_prices() -> list[GroceryPrice]:
    """Return list of grocery price records (mock or live)."""
    if USE_MOCK:
        return _mock_prices()
    return _scrape_public_prices()
