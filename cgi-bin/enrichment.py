#!/usr/bin/python3
"""Return cached enrichment for a batch of visible aircraft; never uses the network."""
import json
import os
import re
import sys
import time
from pathlib import Path
from urllib.parse import parse_qs

CACHE = Path(os.environ.get("ENRICHMENT_CACHE", "/var/lib/flight-tracker/enrichment.json"))
HEX_RE = re.compile(r"^[0-9A-F]{6}$")
CALLSIGN_RE = re.compile(r"^[A-Z0-9]{3,8}$")


def reply(data, status="200 OK"):
    print(f"Status: {status}")
    print("Content-Type: application/json; charset=utf-8")
    print("Cache-Control: no-store")
    print()
    print(json.dumps(data, ensure_ascii=False))


if os.environ.get("REMOTE_ADDR", "") not in {"127.0.0.1", "::1", "::ffff:127.0.0.1"}:
    reply({"error": "Dostęp tylko z ekranu kiosku"}, "403 Forbidden")
    sys.exit(0)

items = parse_qs(os.environ.get("QUERY_STRING", "")).get("items", [""])[0].split(",")[:64]
try:
    cache = json.loads(CACHE.read_text())
except (OSError, ValueError, TypeError):
    cache = {"aircraft": {}, "routes": {}}
now = int(time.time())
results = []
for raw in items:
    hex_code, _, callsign = raw.partition(":")
    hex_code, callsign = hex_code.upper(), callsign.upper()
    if not HEX_RE.fullmatch(hex_code):
        continue
    item = {"hex": hex_code, "callsign": callsign if CALLSIGN_RE.fullmatch(callsign) else ""}
    aircraft = cache.get("aircraft", {}).get(hex_code, {})
    route = cache.get("routes", {}).get(item["callsign"], {}) if item["callsign"] else {}
    if aircraft.get("expires", 0) > now:
        item["aircraft_cached"] = True
        item["aircraft"] = aircraft.get("data")
    if route.get("expires", 0) > now:
        item["route_cached"] = True
        item["route"] = route.get("data")
    results.append(item)
reply({"aircraft": results})
