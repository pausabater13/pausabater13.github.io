# Grocery Opportunities Pipeline

Python system that:

1. **Scrapes grocery pricing data** (mock or live via config)
2. **Pulls Google Trends** for configurable food keywords
3. **Generates derived opportunity ideas** with a 0–100 score
4. **Pushes structured data into Notion** (creates database pages)
5. **Runs weekly** via GitHub Actions (or cron on your own machine)
6. **Flags opportunities** where score > threshold
7. **Sets Status to "Decision Required"** for those opportunities in Notion

## Setup

### 1. Install dependencies

From the project root (`grocery_opportunities/`):

```bash
cd /path/to/grocery_opportunities
python -m venv venv
source venv/bin/activate   # or venv\Scripts\activate on Windows
pip install -e .
```

Or with uv:

```bash
uv venv && source .venv/bin/activate
uv pip install -e .
```

### 2. Notion database

1. Create a [Notion integration](https://www.notion.so/my-integrations) and copy the **Internal Integration Secret**.
2. Create a **database** in Notion (table view) and share it with the integration (database → ... → Add connections).
3. Add these properties to the database (names can be overridden via env):

| Property name | Type    | Used for                          |
|---------------|---------|------------------------------------|
| Name          | Title   | Opportunity title                 |
| Description   | Text    | Full description                  |
| Score         | Number  | 0–100 opportunity score           |
| Category      | Text    | e.g. "Food & Beverage"            |
| Keywords      | Text    | Comma-separated trend keywords    |
| Status        | Select  | "New" or "Decision Required"      |

4. Copy the **database ID** from the database URL:  
   `https://notion.so/workspace/DATABASE_ID?v=...` (the 32-char hex with optional hyphens).

### 3. Environment variables

Copy the example env and edit:

```bash
cp .env.example .env
```

Set in `.env`:

- `NOTION_API_KEY` – your Notion integration secret
- `NOTION_DATABASE_ID` – the database ID from step 2
- `OPPORTUNITY_SCORE_THRESHOLD` – optional; default `70`. Opportunities with score above this get Status **Decision Required**.

Optional:

- `GROCERY_USE_MOCK=1` – use mock grocery data instead of live fetch (recommended for testing)
- `REQUEST_TIMEOUT` – timeout in seconds (default 30)
- `NOTION_PROP_*` / `STATUS_DECISION_REQUIRED` – override Notion property names and status value (see `config.py`)

### 4. Run manually

```bash
python -m grocery_opportunities.run
```

Or after `pip install -e .`:

```bash
grocery-opportunities
```

### 5. Run weekly on GitHub (free)

This repo is set up to run the pipeline **weekly on GitHub Actions** (no server needed).

1. In your GitHub repo: **Settings → Secrets and variables → Actions**.
2. Add repository secrets:
   - `NOTION_API_KEY` – your Notion integration secret
   - `NOTION_DATABASE_ID` – your Notion database ID
3. The workflow runs every **Monday at 09:00 UTC** (see `.github/workflows/grocery-opportunities.yml`). You can also trigger it manually from the **Actions** tab → **Grocery Opportunities** → **Run workflow**.

The pipeline runs in the cloud; results are pushed to your Notion database. A static project page is available at `https://<your-username>.github.io/grocery_opportunities/` when the site is published from this repo.

### 6. Run weekly via cron (optional, e.g. on your own server)

Make the script executable and add a cron entry:

```bash
chmod +x scripts/cron_weekly.sh
crontab -e
```

Add (adjust paths and timezone):

```cron
# Every Monday at 09:00
0 9 * * 1 /path/to/grocery_opportunities/scripts/cron_weekly.sh >> /path/to/logs/grocery_opportunities.log 2>&1
```

Create the log directory if needed:

```bash
mkdir -p /path/to/logs
```

## Behaviour

- **Grocery data**: With `GROCERY_USE_MOCK=1` (or if the configured URL fails), mock prices are used. Otherwise the scraper tries the URL in `GROCERY_SCRAPE_URL` (default: USDA AMS CSV).
- **Trends**: Uses `pytrends` for Google Trends; keywords come from `config.DEFAULT_FOOD_KEYWORDS` (overridable in code or by adding env-based config).
- **Scoring**: Each keyword gets an opportunity. Score combines trend level (0–100), trend direction (rising = bonus), and whether we have matching price data.
- **Notion**: One new page per opportunity. If `score > OPPORTUNITY_SCORE_THRESHOLD`, the page’s **Status** is set to **Decision Required**; otherwise **New**.

## Project layout

```
grocery_opportunities/
├── .env.example
├── pyproject.toml
├── README.md
├── grocery_opportunities/
│   ├── __init__.py
│   ├── config.py            # Env and Notion config
│   ├── run.py               # Entrypoint
│   ├── scraper/             # Grocery pricing
│   ├── trends/              # Google Trends
│   ├── opportunities/       # Derivation + scoring
│   └── notion_client/       # Notion API
└── scripts/
    └── cron_weekly.sh       # Weekly cron runner
```
