"""Configuration loaded from environment."""
import os
from pathlib import Path

from dotenv import load_dotenv

# Load .env from project root (directory containing grocery_opportunities package)
_load_dir = Path(__file__).resolve().parent.parent
load_dotenv(_load_dir / ".env")

NOTION_API_KEY: str = os.environ.get("NOTION_API_KEY", "").strip()
NOTION_DATABASE_ID: str = os.environ.get("NOTION_DATABASE_ID", "").strip()
OPPORTUNITY_SCORE_THRESHOLD: int = int(os.environ.get("OPPORTUNITY_SCORE_THRESHOLD", "70"))

# Notion database property names (must match your database schema)
NOTION_PROP_TITLE: str = os.environ.get("NOTION_PROP_TITLE", "Name")
NOTION_PROP_DESCRIPTION: str = os.environ.get("NOTION_PROP_DESCRIPTION", "Description")
NOTION_PROP_SCORE: str = os.environ.get("NOTION_PROP_SCORE", "Score")
NOTION_PROP_CATEGORY: str = os.environ.get("NOTION_PROP_CATEGORY", "Category")
NOTION_PROP_KEYWORDS: str = os.environ.get("NOTION_PROP_KEYWORDS", "Keywords")
NOTION_PROP_STATUS: str = os.environ.get("NOTION_PROP_STATUS", "Status")
STATUS_DECISION_REQUIRED: str = os.environ.get("STATUS_DECISION_REQUIRED", "Decision Required")
REQUEST_TIMEOUT: int = int(os.environ.get("REQUEST_TIMEOUT", "30"))

# Food keywords used for Google Trends
DEFAULT_FOOD_KEYWORDS: list[str] = [
    "organic vegetables",
    "plant based food",
    "avocado",
    "olive oil",
    "almond milk",
    "kombucha",
    "oat milk",
    "quinoa",
    "chia seeds",
    "kefir",
]
