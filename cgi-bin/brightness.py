#!/usr/bin/python3
"""Loopback-only backlight control for the kiosk touchscreen."""
import glob
import json
import os
import sys
from pathlib import Path
from urllib.parse import parse_qs

STATE = Path(os.environ.get("BRIGHTNESS_STATE", "/var/lib/flight-tracker/brightness"))


def reply(data, status="200 OK"):
    print(f"Status: {status}")
    print("Content-Type: application/json; charset=utf-8")
    print("Cache-Control: no-store")
    print()
    print(json.dumps(data, ensure_ascii=False))


if os.environ.get("REMOTE_ADDR", "") not in {"127.0.0.1", "::1", "::ffff:127.0.0.1"}:
    reply({"error": "Dostęp tylko z ekranu kiosku"}, "403 Forbidden")
    sys.exit(0)

devices = sorted(glob.glob(os.environ.get("BACKLIGHT_GLOB", "/sys/class/backlight/*")))
if not devices:
    reply({"error": "Brak obsługi jasności"}, "503 Service Unavailable")
    sys.exit(0)
device = Path(devices[0])
maximum = int((device / "max_brightness").read_text())
if os.environ.get("REQUEST_METHOD") == "POST":
    length = min(int(os.environ.get("CONTENT_LENGTH") or 0), 128)
    params = parse_qs(sys.stdin.read(length))
    try:
        percent = int(params.get("percent", [""])[0])
    except ValueError:
        percent = 0
    if not 10 <= percent <= 100:
        reply({"error": "Jasność musi wynosić 10–100%"}, "400 Bad Request")
        sys.exit(0)
    raw = max(1, round(maximum * percent / 100))
    try:
        (device / "brightness").write_text(str(raw))
        STATE.write_text(str(percent))
    except OSError:
        reply({"error": "Nie można ustawić jasności"}, "503 Service Unavailable")
        sys.exit(0)
current = int((device / "actual_brightness").read_text())
try:
    saved = int(STATE.read_text().strip())
except (OSError, ValueError):
    saved = round(current * 100 / maximum)
reply({"percent": max(10, min(100, saved)), "minimum": 10, "maximum": 100})
