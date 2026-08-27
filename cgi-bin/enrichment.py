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
PRIORITY = Path(os.environ.get("ENRICHMENT_PRIORITY", "/var/lib/flight-tracker/enrichment-priority.json"))
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

query = parse_qs(os.environ.get("QUERY_STRING", ""))
items = query.get("items", [""])[0].split(",")[:64]
priority = query.get("priority", [""])[0]
priority_hex, _, priority_callsign = priority.partition(":")
priority_hex, priority_callsign = priority_hex.upper(), priority_callsign.upper()
if HEX_RE.fullmatch(priority_hex) and (not priority_callsign or CALLSIGN_RE.fullmatch(priority_callsign)):
    try:
        temporary = PRIORITY.with_suffix(".new")
        temporary.write_text(json.dumps({"hex": priority_hex, "callsign": priority_callsign, "requested": time.time()}))
        temporary.replace(PRIORITY)
    except OSError:
        pass
if not any(items):
    reply({"accepted": True})
    sys.exit(0)
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
    if "data" in aircraft:
        item["aircraft_cached"] = True
        item["aircraft"] = aircraft.get("data")
        item["aircraft_stale"] = aircraft.get("expires", 0) <= now
    if "data" in route:
        item["route_cached"] = True
        item["route"] = route.get("data")
        item["route_stale"] = route.get("expires", 0) <= now
    results.append(item)
reply({"aircraft": results})
