#!/usr/bin/python3
"""Loopback-only proxy for on-demand ADSBDB aircraft details."""
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

hex_code = parse_qs(os.environ.get("QUERY_STRING", "")).get("hex", [""])[0].strip().upper()
if not re.fullmatch(r"[0-9A-F]{6}", hex_code):
    reply({"error": "Nieprawidłowy kod ICAO"}, "400 Bad Request")
    sys.exit(0)

try:
    request = Request(
        "https://api.adsbdb.com/v0/aircraft/" + quote(hex_code),
        headers={"Accept": "application/json", "User-Agent": "Mamaloty/1.0"},
    )
    with urlopen(request, timeout=8) as response:
        payload = json.load(response)
    aircraft = payload.get("response", {}).get("aircraft", {})
    if not aircraft:
        reply({"found": False})
    else:
        reply({
            "found": True,
            "manufacturer": aircraft.get("manufacturer"),
            "model": aircraft.get("type"),
            "owner": aircraft.get("registered_owner"),
        })
except HTTPError as error:
    if error.code == 404:
        reply({"found": False})
    else:
        reply({"error": "Usługa danych samolotu jest chwilowo niedostępna"}, "502 Bad Gateway")
except (URLError, TimeoutError, ValueError, OSError):
    reply({"error": "Brak połączenia z usługą danych samolotu"}, "502 Bad Gateway")
