#!/usr/bin/python3
"""Loopback-only MLAT configuration and status API."""
import json
import math
import os
import sys
import tempfile
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, urlencode
from urllib.request import Request, urlopen

CONFIG = os.environ.get("MAMALOTY_MLAT_CONFIG", "/var/lib/flight-tracker/mlat.json")
STATUS = os.environ.get("MAMALOTY_MLAT_STATUS", "/run/flight-tracker/mlat-status.json")
RECEIVER = os.environ.get("MAMALOTY_RECEIVER_CONFIG", "/etc/flight-tracker/flight-tracker.conf")

def reply(data, status="200 OK"):
    print(f"Status: {status}\nContent-Type: application/json; charset=utf-8\nCache-Control: no-store\n")
    print(json.dumps(data, ensure_ascii=False))

def load(path, default):
    try:
        with open(path, encoding="utf-8") as handle: return json.load(handle)
    except (OSError, ValueError): return default

def receiver_position():
    config = load(CONFIG, {})
    if isinstance(config.get("receiver_lat"),(int,float)) and isinstance(config.get("receiver_lon"),(int,float)):
        return float(config["receiver_lat"]), float(config["receiver_lon"])
    values = {}
    with open(RECEIVER, encoding="utf-8") as handle:
        for raw in handle:
            if "=" in raw and not raw.lstrip().startswith("#"):
                key, value = raw.strip().split("=", 1); values[key] = value.strip().strip('"')
    return float(values["RECEIVER_LAT"]), float(values["RECEIVER_LON"])

def elevation(lat, lon):
    url = "https://api.open-meteo.com/v1/elevation?" + urlencode({"latitude":lat,"longitude":lon})
    with urlopen(Request(url, headers={"Accept":"application/json","User-Agent":"Mamaloty/1.0"}), timeout=10) as response:
        value = json.load(response).get("elevation", [None])[0]
    if not isinstance(value, (int,float)) or not math.isfinite(value): raise ValueError("Usługa nie zwróciła prawidłowej wysokości terenu")
    return float(value)

def atomic_save(data):
    directory = os.path.dirname(CONFIG)
    fd, temporary = tempfile.mkstemp(prefix="mlat.", suffix=".tmp", dir=directory)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(data, handle, ensure_ascii=False, separators=(",",":")); handle.flush(); os.fsync(handle.fileno())
        os.chmod(temporary, 0o640); os.replace(temporary, CONFIG)
    finally:
        try: os.unlink(temporary)
        except FileNotFoundError: pass

if os.environ.get("REMOTE_ADDR", "") not in {"127.0.0.1","::1","::ffff:127.0.0.1"}:
    reply({"error":"Dostęp tylko z ekranu kiosku"}, "403 Forbidden"); sys.exit(0)
try:
    action = parse_qs(os.environ.get("QUERY_STRING", "")).get("action", ["status"])[0]
    config = load(CONFIG, {})
    if action == "status":
        status = load(STATUS, {"state":"disabled" if not config.get("enabled") else "connecting"})
        public = {key:config.get(key) for key in ("enabled","antenna_height_m","terrain_m","absolute_elevation_m","ellipsoid_altitude_m") if key in config}
        if config.get("enabled") and "ellipsoid_altitude_m" not in public: public["ellipsoid_altitude_m"] = 190.0
        lat, lon = receiver_position(); public.update({"receiver_lat":lat,"receiver_lon":lon})
        reply({**status,"config":public})
    elif action == "location" and os.environ.get("REQUEST_METHOD") == "POST":
        length = min(int(os.environ.get("CONTENT_LENGTH", "0")), 4096)
        body = json.loads(sys.stdin.read(length)); lat=body.get("lat"); lon=body.get("lon"); altitude=body.get("ellipsoid_altitude_m")
        if not isinstance(lat,(int,float)) or isinstance(lat,bool) or not math.isfinite(lat) or not -90 <= lat <= 90: raise ValueError("Nieprawidłowa szerokość geograficzna")
        if not isinstance(lon,(int,float)) or isinstance(lon,bool) or not math.isfinite(lon) or not -180 <= lon <= 180: raise ValueError("Nieprawidłowa długość geograficzna")
        if not isinstance(altitude,(int,float)) or isinstance(altitude,bool) or not math.isfinite(altitude) or not -500 <= altitude <= 10000: raise ValueError("Nieprawidłowa wysokość WGS84")
        config={**config,"receiver_lat":float(lat),"receiver_lon":float(lon),"ellipsoid_altitude_m":float(altitude)}
        atomic_save(config); reply({"saved":True,"config":{"receiver_lat":float(lat),"receiver_lon":float(lon),"ellipsoid_altitude_m":float(altitude)}})
    elif action == "configure" and os.environ.get("REQUEST_METHOD") == "POST":
        length = min(int(os.environ.get("CONTENT_LENGTH", "0")), 4096)
        body = json.loads(sys.stdin.read(length)); enabled = body.get("enabled") is True
        antenna = body.get("antenna_height_m")
        if enabled and (not isinstance(antenna,(int,float)) or isinstance(antenna,bool) or not math.isfinite(antenna) or not 0 <= antenna <= 200):
            raise ValueError("Podaj wysokość anteny od 0 do 200 m")
        if enabled:
            supplied_terrain = body.get("terrain_m")
            if supplied_terrain is not None and (not isinstance(supplied_terrain,(int,float)) or isinstance(supplied_terrain,bool) or not math.isfinite(supplied_terrain) or not -500 <= supplied_terrain <= 9000):
                raise ValueError("Podaj wysokość terenu od -500 do 9000 m n.p.m.")
            lat, lon = receiver_position(); terrain = supplied_terrain if supplied_terrain is not None else config.get("terrain_m")
            if not isinstance(terrain,(int,float)) or not math.isfinite(terrain): terrain = elevation(lat,lon)
            ellipsoid_altitude = body.get("ellipsoid_altitude_m", config.get("ellipsoid_altitude_m", 190.0))
            if not isinstance(ellipsoid_altitude,(int,float)) or isinstance(ellipsoid_altitude,bool) or not math.isfinite(ellipsoid_altitude) or not -500 <= ellipsoid_altitude <= 10000:
                raise ValueError("Podaj wysokość anteny WGS84 od -500 do 10000 m")
            config = {"enabled":True,"antenna_height_m":float(antenna),"terrain_m":float(terrain),"absolute_elevation_m":float(terrain)+float(antenna),"ellipsoid_altitude_m":float(ellipsoid_altitude)}
        else: config = {**config,"enabled":False}
        atomic_save(config); reply({"saved":True})
    else: reply({"error":"Nieznana operacja"}, "400 Bad Request")
except (ValueError, json.JSONDecodeError) as error: reply({"error":str(error)}, "400 Bad Request")
except (HTTPError, URLError, TimeoutError, OSError) as error: reply({"error":"Nie udało się pobrać wysokości terenu; spróbuj po połączeniu z Internetem"}, "502 Bad Gateway")
