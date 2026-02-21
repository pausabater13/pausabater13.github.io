#!/usr/bin/env bash
# Run the grocery opportunities pipeline weekly.
# Install: add to crontab with `crontab -e`:
#   0 9 * * 1 /path/to/grocery_opportunities/scripts/cron_weekly.sh >> /path/to/logs/grocery_opportunities.log 2>&1
# (Runs every Monday at 09:00.)

set -e
cd "$(dirname "$0")/.."
export PATH="/usr/bin:/bin:/usr/local/bin:$PATH"

# Use project venv if present
if [ -d "venv/bin" ]; then
  source venv/bin/activate
elif [ -d ".venv/bin" ]; then
  source .venv/bin/activate
fi

exec python -m grocery_opportunities.run
