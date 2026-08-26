#!/bin/sh
set -eu

if [ "$#" -lt 1 ] || [ "$#" -gt 2 ]; then
    echo "Usage: $0 SOURCE.pmtiles-or-URL [sheffield|wroclaw]" >&2
    exit 2
fi

root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
mkdir -p "$root/maps"
command -v pmtiles >/dev/null 2>&1 || { echo "Install the pmtiles CLI first" >&2; exit 1; }

map_name=${2:-wroclaw}
case "$map_name" in
    sheffield) bbox=-5.93,50.72,3.07,56.12 ;;
    wroclaw) bbox=12.60,48.42,21.30,53.82 ;;
    *) echo "Unknown map: $map_name" >&2; exit 2 ;;
esac

# Approximate 300 km bounding box centred on the configured antenna location.
pmtiles extract "$1" "$root/maps/$map_name.pmtiles" --bbox="$bbox" --minzoom=5 --maxzoom=12
pmtiles verify "$root/maps/$map_name.pmtiles"
hash=$(sha256sum "$root/maps/$map_name.pmtiles" | awk '{print $1}')
printf '%s  maps/%s.pmtiles\n' "$hash" "$map_name" > "$root/maps/$map_name.pmtiles.sha256"
