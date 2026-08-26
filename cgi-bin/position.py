#!/usr/bin/python3
"""Loopback-only ADSB.lol position fallback for locally received Mode-S targets."""
import json, os, re, sys
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, quote
from urllib.request import Request, urlopen

def reply(data, status="200 OK"):
    print(f"Status: {status}\nContent-Type: application/json; charset=utf-8\nCache-Control: no-store\n")
    print(json.dumps(data, ensure_ascii=False))

if os.environ.get("REMOTE_ADDR", "") not in {"127.0.0.1","::1","::ffff:127.0.0.1"}:
    reply({"error":"Dostęp tylko z ekranu kiosku"}, "403 Forbidden"); sys.exit(0)
query=parse_qs(os.environ.get("QUERY_STRING", ""))
if query.get("nearby", [""])[0] == "helicopters":
    values={}
    with open("/etc/flight-tracker/flight-tracker.conf", encoding="utf-8") as handle:
        for line in handle:
            if "=" in line and not line.lstrip().startswith("#"):
                key,value=line.strip().split("=",1); values[key]=value.strip().strip('"')
    try:
        location=json.load(open("/var/lib/flight-tracker/mlat.json",encoding="utf-8"))
        values["RECEIVER_LAT"]=location.get("receiver_lat",values["RECEIVER_LAT"]); values["RECEIVER_LON"]=location.get("receiver_lon",values["RECEIVER_LON"])
    except (OSError,ValueError,KeyError): pass
    try:
        url=f"https://api.adsb.lol/v2/point/{float(values['RECEIVER_LAT'])}/{float(values['RECEIVER_LON'])}/30"
        with urlopen(Request(url,headers={"Accept":"application/json","User-Agent":"Mamaloty/1.0"}),timeout=8) as response: payload=json.load(response)
        helicopter_types=("R22","R44","R66","A109","A119","A139","A149","A169","A189","B06","B407","EC","H13","H14","S76","S92","AS3","AS5","MD5")
        aircraft=[]
        for item in payload.get("ac",[]):
            if item.get("category")=="A7" or str(item.get("t") or "").upper().startswith(helicopter_types):
                if isinstance(item.get("lat"),(int,float)) and isinstance(item.get("lon"),(int,float)) and item.get("seen_pos",999)<=15:
                    aircraft.append({key:item.get(key) for key in ("hex","flight","r","t","lat","lon","alt_baro","alt_geom","gs","track","baro_rate","squawk","seen","seen_pos","mlat","category")})
        reply({"aircraft":aircraft}); sys.exit(0)
    except (HTTPError,URLError,TimeoutError,ValueError,OSError,KeyError): reply({"aircraft":[]}); sys.exit(0)
codes = query.get("hex", [""])[0].upper().split(",")
if not codes or len(codes) > 16 or any(not re.fullmatch(r"[0-9A-F]{6}", code) for code in codes):
    reply({"error":"Nieprawidłowe kody ICAO"}, "400 Bad Request"); sys.exit(0)
try:
    request = Request("https://api.adsb.lol/v2/hex/" + quote(",".join(codes)), headers={"Accept":"application/json","User-Agent":"Mamaloty/1.0"})
    with urlopen(request, timeout=8) as response: payload=json.load(response)
    allowed=set(codes); positions=[]
    for aircraft in payload.get("ac", []):
        code=str(aircraft.get("hex","")).upper()
        if code in allowed and isinstance(aircraft.get("lat"),(int,float)) and isinstance(aircraft.get("lon"),(int,float)) and aircraft.get("seen_pos",999) <= 15:
            positions.append({"hex":code.lower(),"lat":aircraft["lat"],"lon":aircraft["lon"],"seen_pos":aircraft.get("seen_pos",0),"mlat":aircraft.get("mlat") or ["lat","lon"]})
    reply({"aircraft":positions})
except (HTTPError, URLError, TimeoutError, ValueError, OSError):
    reply({"aircraft":[]})
