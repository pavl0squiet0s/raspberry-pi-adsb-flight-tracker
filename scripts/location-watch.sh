#!/bin/sh
set -u
config=/var/lib/flight-tracker/mlat.json

signature() {
    lat=$(sed -n 's/.*"receiver_lat":\([-0-9.]*\).*/\1/p' "$config" 2>/dev/null | head -n1)
    lon=$(sed -n 's/.*"receiver_lon":\([-0-9.]*\).*/\1/p' "$config" 2>/dev/null | head -n1)
    printf '%s|%s' "$lat" "$lon"
}

previous=$(signature)
while :; do
    sleep 2
    current=$(signature)
    if [ "$current" != "$previous" ]; then
        previous=$current
        rc-service flight-tracker-dump1090 restart
    fi
done
