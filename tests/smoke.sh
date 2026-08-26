#!/bin/sh
set -eu

base=${1:-http://mamaloty:8080}
tmp=${TMPDIR:-/tmp}/mamaloty-smoke.$$
trap 'rm -f "$tmp"' EXIT INT TERM

curl --fail --silent --show-error "$base/" > "$tmp"
grep -q '<title>Mamaloty</title>' "$tmp"
curl --fail --silent --show-error "$base/config.js" | grep -q 'FLIGHT_TRACKER_CONFIG'
curl --fail --silent --show-error "$base/features.js" | grep -q 'MamalotyFeatures'
curl --fail --silent --show-error "$base/data/receiver.json" | grep -q '"version"'
curl --fail --silent --show-error "$base/data/aircraft.json" | grep -q '"aircraft"'
curl --fail --silent --show-error --range 0-126 "$base/maps/sheffield.pmtiles" >/dev/null 2>&1 || echo "NOTE: Sheffield offline map not deployed"

echo "Smoke tests passed: $base"
