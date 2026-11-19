"""
Water & Climate Risk Monitor: data pipeline
============================================

Pulls water, emissions and disaster indicators for the USA, Mexico and Canada
from the World Bank Indicators API (v2) and writes them to ../data/:

    indicators.csv   tidy long table: indicator, country, year, value + quality flags
    indicators.json  same data plus metadata (source organization, last updated)
    data.js          the JSON wrapped as `window.MONITOR_DATA = ...` so the
                     dashboard also works when index.html is opened from disk

Run it from the project root:

    python pipeline/fetch_data.py

Only the Python standard library is used, so there is nothing to install.
"""

from __future__ import annotations

import csv
import json
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

API = "https://api.worldbank.org/v2"
COUNTRIES = ["USA", "MEX", "CAN"]
START_YEAR, END_YEAR = 2000, datetime.now(timezone.utc).year
OUT_DIR = Path(__file__).resolve().parent.parent / "data"

# key -> World Bank indicator code, plus how the dashboard should label it.
INDICATORS = {
    "water_stress": {
        "code": "ER.H2O.FWST.ZS",
        "label": "Water stress: freshwater withdrawn as % of available resources",
        "unit": "%",
        "source_short": "FAO AQUASTAT",
    },
    "water_per_capita": {
        "code": "ER.H2O.INTR.PC",
        "label": "Renewable internal freshwater per person",
        "unit": "m³ per person",
        "source_short": "FAO AQUASTAT",
    },
    "withdrawal_agriculture": {
        "code": "ER.H2O.FWAG.ZS",
        "label": "Freshwater withdrawals: agriculture",
        "unit": "% of total withdrawals",
        "source_short": "FAO AQUASTAT",
    },
    "withdrawal_industry": {
        "code": "ER.H2O.FWIN.ZS",
        "label": "Freshwater withdrawals: industry",
        "unit": "% of total withdrawals",
        "source_short": "FAO AQUASTAT",
    },
    "methane": {
        "code": "EN.GHG.CH4.MT.CE.AR5",
        "label": "Methane emissions, excluding land use",
        "unit": "Mt CO2e",
        "source_short": "EDGAR (EU Joint Research Centre)",
    },
    "disaster_displacement": {
        "code": "VC.IDP.NWDS",
        "label": "New internal displacements caused by disasters",
        "unit": "displacements",
        "source_short": "IDMC",
    },
}

# A year-over-year move larger than this is flagged as a possible
# methodology change or data revision, to be checked before drawing conclusions.
STEP_CHANGE_THRESHOLD = 0.25
# Disaster displacement is volatile by nature (one hurricane), so it is exempt.
STEP_CHANGE_EXEMPT = {"disaster_displacement"}


def get_json(url: str, retries: int = 3) -> object:
    """GET a URL and parse JSON, retrying on transient network errors."""
    for attempt in range(1, retries + 1):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "water-climate-risk-monitor"})
            with urllib.request.urlopen(req, timeout=30) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except (urllib.error.URLError, TimeoutError) as err:
            if attempt == retries:
                raise RuntimeError(f"Could not reach {url}: {err}") from err
            time.sleep(2 * attempt)
    raise AssertionError("unreachable")


def check_api_error(payload: object, url: str) -> None:
    """The World Bank API returns HTTP 200 with an error message in the body."""
    if isinstance(payload, list) and payload and isinstance(payload[0], dict) and "message" in payload[0]:
        raise RuntimeError(f"World Bank API error for {url}: {payload[0]['message']}")


def fetch_series(code: str) -> tuple[list[dict], str]:
    """Return (records, last_updated) for one indicator, following pagination."""
    records, page, pages, last_updated = [], 1, 1, ""
    while page <= pages:
        url = (
            f"{API}/country/{';'.join(COUNTRIES)}/indicator/{code}"
            f"?format=json&date={START_YEAR}:{END_YEAR}&per_page=500&page={page}"
        )
        payload = get_json(url)
        check_api_error(payload, url)
        meta, rows = payload[0], payload[1] or []
        pages = int(meta.get("pages", 1))
        last_updated = meta.get("lastupdated", last_updated)
        records.extend(rows)
        page += 1
    return records, last_updated


def fetch_source(code: str) -> str:
    """The organization the World Bank credits as the original data source."""
    url = f"{API}/indicator/{code}?format=json"
    payload = get_json(url)
    check_api_error(payload, url)
    return (payload[1][0].get("sourceOrganization") or "").strip()


def tidy(key: str, records: list[dict]) -> list[dict]:
    """Keep non-null values, sort, and add data-quality flags.

    carried_forward: the value is identical to the previous year's. AQUASTAT
        reports some countries only every few years and the series repeats the
        last known value in between, so these years are not new measurements.
    step_change: the value moved more than STEP_CHANGE_THRESHOLD versus the
        previous year, which usually signals a revision rather than a real shift.
    """
    rows = sorted(
        (
            {"indicator": key, "country": r["countryiso3code"], "year": int(r["date"]), "value": float(r["value"])}
            for r in records
            if r.get("value") is not None and r.get("countryiso3code") in COUNTRIES
        ),
        key=lambda r: (r["country"], r["year"]),
    )
    previous: dict[str, dict] = {}
    for row in rows:
        prev = previous.get(row["country"])
        consecutive = prev is not None and prev["year"] == row["year"] - 1
        row["carried_forward"] = bool(consecutive and prev["value"] == row["value"])
        row["step_change"] = bool(
            consecutive
            and key not in STEP_CHANGE_EXEMPT
            and prev["value"]
            and abs(row["value"] / prev["value"] - 1) > STEP_CHANGE_THRESHOLD
        )
        previous[row["country"]] = row
    return rows


def main() -> int:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    all_rows, meta = [], {}

    for key, spec in INDICATORS.items():
        print(f"Fetching {spec['code']:<22} {spec['label']}")
        records, last_updated = fetch_series(spec["code"])
        rows = tidy(key, records)
        if not rows:
            raise RuntimeError(f"{spec['code']} returned no data; the code may have been retired.")
        meta[key] = {
            **spec,
            "source": fetch_source(spec["code"]),
            "source_last_updated": last_updated,
            "latest_year": max(r["year"] for r in rows),
        }
        all_rows.extend(rows)
        flagged = sum(r["carried_forward"] or r["step_change"] for r in rows)
        print(f"   {len(rows)} values, latest year {meta[key]['latest_year']}, {flagged} flagged")

    fields = ["indicator", "country", "year", "value", "carried_forward", "step_change"]
    with open(OUT_DIR / "indicators.csv", "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fields)
        writer.writeheader()
        writer.writerows(all_rows)

    bundle = {
        "fetched_at": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "countries": COUNTRIES,
        "indicators": meta,
        "rows": all_rows,
    }
    (OUT_DIR / "indicators.json").write_text(json.dumps(bundle, indent=1), encoding="utf-8")
    (OUT_DIR / "data.js").write_text(
        "// Generated by pipeline/fetch_data.py. Do not edit by hand.\n"
        f"window.MONITOR_DATA = {json.dumps(bundle)};\n",
        encoding="utf-8",
    )
    print(f"Wrote {len(all_rows)} rows to {OUT_DIR}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
