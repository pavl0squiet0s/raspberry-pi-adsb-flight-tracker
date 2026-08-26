#!/usr/bin/python3
"""Minimal localhost-only Wi-Fi control API for the kiosk."""
import json
import os
import subprocess
import sys
import time
from urllib.parse import parse_qs

WPA = ["/sbin/wpa_cli", "-i", "wlan0", "-p", "/run/wpa_supplicant"]


def reply(data, status="200 OK"):
    print(f"Status: {status}")
    print("Content-Type: application/json; charset=utf-8")
    print("Cache-Control: no-store")
    print()
    print(json.dumps(data, ensure_ascii=False))


def wpa(*args):
    result = subprocess.run(WPA + list(args), capture_output=True, text=True, timeout=12)
    if result.returncode or result.stdout.strip() == "FAIL":
        raise RuntimeError("Polecenie Wi-Fi nie powiodło się")
    return result.stdout.strip()


def status():
    values = {}
    for line in wpa("status").splitlines():
        if "=" in line:
            key, value = line.split("=", 1)
            values[key] = value
    connected = values.get("wpa_state") == "COMPLETED"
    signal = None
    if connected:
        try:
            for line in wpa("signal_poll").splitlines():
                if line.startswith("RSSI="):
                    signal = max(0, min(100, 2 * (int(line.split("=", 1)[1]) + 100)))
                    break
        except (RuntimeError, ValueError):
            pass
    return {"connected": connected, "ssid": values.get("ssid", ""), "ip": values.get("ip_address", ""), "signal": signal}


def scan():
    wpa("scan")
    time.sleep(1.5)
    networks = {}
    for line in wpa("scan_results").splitlines()[1:]:
        fields = line.split("\t", 4)
        if len(fields) != 5 or not fields[4] or fields[4].startswith("\\x00"):
            continue
        try:
            signal = max(0, min(100, 2 * (int(fields[2]) + 100)))
        except ValueError:
            signal = 0
        item = {"ssid": fields[4], "signal": signal, "secure": "WPA" in fields[3] or "WEP" in fields[3]}
        if fields[4] not in networks or signal > networks[fields[4]]["signal"]:
            networks[fields[4]] = item
    return sorted(networks.values(), key=lambda item: (-item["signal"], item["ssid"].lower()))


def connect(body):
    ssid = body.get("ssid", "")
    password = body.get("password", "")
    if not isinstance(ssid, str) or not 1 <= len(ssid.encode()) <= 32 or "\x00" in ssid:
        raise ValueError("Nieprawidłowa nazwa sieci")
    if not isinstance(password, str) or (password and not 8 <= len(password) <= 63):
        raise ValueError("Hasło musi mieć od 8 do 63 znaków")
    network_id = wpa("add_network").splitlines()[-1]
    if not network_id.isdigit():
        raise RuntimeError("Nie można utworzyć profilu sieci")
    try:
        wpa("set_network", network_id, "ssid", json.dumps(ssid, ensure_ascii=False))
        if password:
            wpa("set_network", network_id, "psk", json.dumps(password, ensure_ascii=False))
        else:
            wpa("set_network", network_id, "key_mgmt", "NONE")
        wpa("enable_network", network_id)
        wpa("select_network", network_id)
        wpa("save_config")
    except Exception:
        subprocess.run(WPA + ["remove_network", network_id], capture_output=True, timeout=5)
        raise
    time.sleep(2)
    return status()


def disconnect():
    # Leave the saved network intact so the kiosk can reconnect later.
    wpa("disconnect")
    return status()


if os.environ.get("REMOTE_ADDR", "") not in {"127.0.0.1", "::1", "::ffff:127.0.0.1"}:
    reply({"error": "Dostęp tylko z ekranu kiosku"}, "403 Forbidden")
    sys.exit(0)

try:
    action = parse_qs(os.environ.get("QUERY_STRING", "")).get("action", ["status"])[0]
    if action == "status":
        reply(status())
    elif action == "scan":
        reply({"networks": scan()})
    elif action == "connect" and os.environ.get("REQUEST_METHOD") == "POST":
        length = min(int(os.environ.get("CONTENT_LENGTH", "0")), 4096)
        reply(connect(json.loads(sys.stdin.read(length))))
    elif action == "disconnect" and os.environ.get("REQUEST_METHOD") == "POST":
        reply(disconnect())
    else:
        reply({"error": "Nieznana operacja"}, "400 Bad Request")
except (ValueError, json.JSONDecodeError) as error:
    reply({"error": str(error)}, "400 Bad Request")
except Exception as error:
    reply({"error": str(error)}, "500 Internal Server Error")
