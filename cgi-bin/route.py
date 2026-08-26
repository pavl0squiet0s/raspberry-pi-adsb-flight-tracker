#!/usr/bin/python3
"""Loopback-only proxy for on-demand ADSBDB flight route lookups."""
import json
import os
import re
import sys
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, quote
from urllib.request import Request, urlopen


def reply(data, status="200 OK"):
    print(f"Status: {status}")
    print("Content-Type: application/json; charset=utf-8")
    print("Cache-Control: no-store")
    print()
    print(json.dumps(data, ensure_ascii=False))


if os.environ.get("REMOTE_ADDR", "") not in {"127.0.0.1", "::1", "::ffff:127.0.0.1"}:
    reply({"error": "Dostęp tylko z ekranu kiosku"}, "403 Forbidden")
    sys.exit(0)

callsign = parse_qs(os.environ.get("QUERY_STRING", "")).get("callsign", [""])[0].strip().upper()
if not re.fullmatch(r"[A-Z0-9]{3,8}", callsign):
    reply({"error": "Nieprawidłowy znak wywoławczy"}, "400 Bad Request")
    sys.exit(0)

try:
    request = Request(
        "https://api.adsbdb.com/v0/callsign/" + quote(callsign),
        headers={"Accept": "application/json", "User-Agent": "Mamaloty/1.0"},
    )
    with urlopen(request, timeout=8) as response:
        payload = json.load(response)
    route = payload.get("response", {}).get("flightroute", {})
    origin, destination = route.get("origin"), route.get("destination")
    if not origin or not destination:
        reply({"found": False})
    else:
        def airport(item):
            return {
                "iata": item.get("iata_code"), "icao": item.get("icao_code"),
                "name": item.get("name"), "city": item.get("municipality"),
                "country": item.get("country_iso_name"),
            }
        reply({"found": True, "origin": airport(origin), "destination": airport(destination)})
except HTTPError as error:
    if error.code == 404:
        reply({"found": False})
    else:
        reply({"error": "Usługa tras jest chwilowo niedostępna"}, "502 Bad Gateway")
except (URLError, TimeoutError, ValueError, OSError):
    reply({"error": "Brak połączenia z usługą tras"}, "502 Bad Gateway")
