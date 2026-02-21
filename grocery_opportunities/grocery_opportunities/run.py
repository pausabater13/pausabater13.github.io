"""Main entrypoint: scrape prices, fetch trends, derive opportunities, push to Notion."""
from __future__ import annotations

import logging
import sys

from grocery_opportunities.config import (
    DEFAULT_FOOD_KEYWORDS,
    NOTION_DATABASE_ID,
    NOTION_API_KEY,
    OPPORTUNITY_SCORE_THRESHOLD,
)
from grocery_opportunities.notion_client import push_opportunities_to_notion
from grocery_opportunities.opportunities import derive_opportunities
from grocery_opportunities.scraper import scrape_grocery_prices
from grocery_opportunities.trends import fetch_trends_for_keywords

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)


def main() -> int:
    """Run the full pipeline: scrape → trends → opportunities → Notion."""
    logger.info("Starting grocery opportunities pipeline")

    # 1. Scrape grocery pricing data
    prices = scrape_grocery_prices()
    logger.info("Scraped %d grocery price records", len(prices))

    # 2. Pull Google Trends for food keywords
    trends = fetch_trends_for_keywords(DEFAULT_FOOD_KEYWORDS)
    total_points = sum(len(pts) for pts in trends.values())
    logger.info("Fetched trends for %d keywords (%d data points)", len(trends), total_points)

    # 3. Generate derived opportunity ideas
    opportunities = derive_opportunities(prices, trends)
    logger.info("Derived %d opportunities", len(opportunities))

    above = sum(1 for o in opportunities if o.score > OPPORTUNITY_SCORE_THRESHOLD)
    logger.info(
        "Opportunities above threshold %d: %d (Status will be set to 'Decision Required')",
        OPPORTUNITY_SCORE_THRESHOLD,
        above,
    )

    # 4. Push structured data into Notion; flags score > threshold → Status 'Decision Required'
    created = push_opportunities_to_notion(opportunities)
    logger.info("Created %d Notion pages", len(created))

    if opportunities and NOTION_API_KEY and NOTION_DATABASE_ID and not created:
        return 1  # Notion was configured but no pages created
    return 0


if __name__ == "__main__":
    sys.exit(main())
