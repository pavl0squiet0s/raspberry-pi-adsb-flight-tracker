#!/usr/bin/python3
"""Rate-limited ADSBDB cache warmer for aircraft visible in the local feed."""
import json
import os
import re
import signal
import time
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen

FEED = Path(os.environ.get("ENRICHMENT_FEED", "/run/flight-tracker/aircraft.json"))
CACHE = Path(os.environ.get("ENRICHMENT_CACHE", "/var/lib/flight-tracker/enrichment.json"))
PRIORITY = Path(os.environ.get("ENRICHMENT_PRIORITY", "/var/lib/flight-tracker/enrichment-priority.json"))
SNAPSHOT = Path(os.environ.get("ENRICHMENT_SNAPSHOT", "/run/flight-tracker/enrichment.json"))
POLL_SECONDS = 1
REQUEST_INTERVAL = 5
AIRCRAFT_TTL = 30 * 86400
ROUTE_TTL = 24 * 3600
NEGATIVE_TTL = 6 * 3600
ERROR_RETRY = 15 * 60
RATE_LIMIT_RETRY = 30 * 60
CALLSIGN_RE = re.compile(r"^[A-Z0-9]{3,8}$")
HEX_RE = re.compile(r"^[0-9A-F]{6}$")
RUNNING = True


def empty_cache():
    return {"version": 1, "aircraft": {}, "routes": {}}


def load_cache(path=CACHE):
    try:
        data = json.loads(path.read_text())
        if data.get("version") == 1:
            data.setdefault("aircraft", {})
            data.setdefault("routes", {})
            return data
    except (OSError, ValueError, TypeError):
        pass
    return empty_cache()


def save_cache(data, path=CACHE):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(".new")
    temporary.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")))
    os.chmod(temporary, 0o640)
    temporary.replace(path)


def publish_snapshot(data, path=SNAPSHOT, now=None):
    """Atomically expose the complete cache to the browser without CGI startup."""
    path.parent.mkdir(parents=True, exist_ok=True)
    snapshot = {
        "version": 1,
        "generated": int(time.time() if now is None else now),
        "aircraft": data.get("aircraft", {}),
        "routes": data.get("routes", {}),
    }
    temporary = path.with_suffix(".new")
    temporary.write_text(json.dumps(snapshot, ensure_ascii=False, separators=(",", ":")))
    os.chmod(temporary, 0o644)
    temporary.replace(path)


def fresh(entries, key, now):
    return entries.get(key, {}).get("expires", 0) > now


def airport(item):
    if not isinstance(item, dict):
        return None
    return {
        "iata": item.get("iata_code"), "icao": item.get("icao_code"),
        "name": item.get("name"), "city": item.get("municipality"),
        "country": item.get("country_iso_name"),
    }


def parse_response(payload):
    response = payload.get("response", {}) if isinstance(payload, dict) else {}
    aircraft = response.get("aircraft") if isinstance(response, dict) else None
    route = response.get("flightroute") if isinstance(response, dict) else None
    aircraft_data = None
    route_data = None
    if isinstance(aircraft, dict):
        aircraft_data = {
            "manufacturer": aircraft.get("manufacturer"),
            "model": aircraft.get("type"),
            "owner": aircraft.get("registered_owner"),
        }
    if isinstance(route, dict) and airport(route.get("origin")) and airport(route.get("destination")):
        route_data = {"origin": airport(route["origin"]), "destination": airport(route["destination"])}
    return aircraft_data, route_data


def active_pairs(path=FEED):
    try:
        records = json.loads(path.read_text()).get("aircraft", [])
    except (OSError, ValueError, TypeError):
        return []
    pairs = []
    for item in records:
        hex_code = str(item.get("hex", "")).strip().upper()
        callsign = str(item.get("flight", "")).strip().upper()
        positioned = isinstance(item.get("lat"), (int, float)) and isinstance(item.get("lon"), (int, float))
        if HEX_RE.fullmatch(hex_code) and positioned and float(item.get("seen_pos", 999)) <= 60:
            pairs.append((hex_code, callsign if CALLSIGN_RE.fullmatch(callsign) else ""))
    return pairs


def priority_pair(path=PRIORITY):
    try:
        item = json.loads(path.read_text())
        if time.time() - float(item.get("requested", 0)) > 30:
            return None
        hex_code = str(item.get("hex", "")).upper()
        callsign = str(item.get("callsign", "")).upper()
        if HEX_RE.fullmatch(hex_code) and (not callsign or CALLSIGN_RE.fullmatch(callsign)):
            return hex_code, callsign
    except (OSError, ValueError, TypeError):
        pass
    return None


def ordered_pairs(pairs, priority=None, seen=None, cursor=0):
    """Selected first, then new callsigns, then a fair rotation of known traffic."""
    seen = seen or set()
    unique = list(dict.fromkeys(pairs))
    ordered = []
    if priority in unique:
        ordered.append(priority)
    remaining = [pair for pair in unique if pair != priority]
    new = [pair for pair in remaining if pair not in seen]
    new.sort(key=lambda pair: (not bool(pair[1]), pair[0]))
    known = [pair for pair in remaining if pair in seen]
    if known:
        offset = cursor % len(known)
        known = known[offset:] + known[:offset]
    return ordered + new + known


def fetch(hex_code, callsign):
    url = "https://api.adsbdb.com/v0/aircraft/" + quote(hex_code)
    if callsign:
        url += "?callsign=" + quote(callsign)
    request = Request(url, headers={
        "Accept": "application/json",
        "User-Agent": "RaspberryPiADSBFlightTracker/1.0 (+https://github.com/pavl0squiet0s/raspberry-pi-adsb-flight-tracker)",
    })
    with urlopen(request, timeout=10) as response:
        return parse_response(json.load(response))


def stop(_signal, _frame):
    global RUNNING
    RUNNING = False


def main():
    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    cache = load_cache()
    publish_snapshot(cache)
    retry_after = {}
    requested_at = 0.0
    seen_pairs = set()
    queue_cursor = 0
    while RUNNING:
        now = int(time.time())
        candidate = None
        active = active_pairs()
        priority = priority_pair()
        pairs = ordered_pairs(active, priority, seen_pairs, queue_cursor)
        seen_pairs.update(active)
        for hex_code, callsign in pairs:
            needs_aircraft = not fresh(cache["aircraft"], hex_code, now)
            needs_route = bool(callsign) and not fresh(cache["routes"], callsign, now)
            key = f"{hex_code}:{callsign}"
            if (needs_aircraft or needs_route) and retry_after.get(key, 0) <= now:
                candidate = (hex_code, callsign, needs_aircraft, needs_route, key)
                break
        if not candidate:
            time.sleep(POLL_SECONDS)
            continue
        wait = REQUEST_INTERVAL - (time.monotonic() - requested_at)
        if wait > 0:
            time.sleep(wait)
        hex_code, callsign, needs_aircraft, needs_route, key = candidate
        queue_cursor += 1
        requested_at = time.monotonic()
        try:
            aircraft_data, route_data = fetch(hex_code, callsign)
            now = int(time.time())
            if needs_aircraft:
                cache["aircraft"][hex_code] = {"expires": now + (AIRCRAFT_TTL if aircraft_data else NEGATIVE_TTL), "data": aircraft_data}
            if needs_route:
                cache["routes"][callsign] = {"expires": now + (ROUTE_TTL if route_data else NEGATIVE_TTL), "data": route_data}
            save_cache(cache)
            publish_snapshot(cache)
            retry_after.pop(key, None)
        except HTTPError as error:
            retry_after[key] = int(time.time()) + (RATE_LIMIT_RETRY if error.code == 429 else ERROR_RETRY)
        except (URLError, TimeoutError, ValueError, OSError):
            retry_after[key] = int(time.time()) + ERROR_RETRY


if __name__ == "__main__":
    main()
