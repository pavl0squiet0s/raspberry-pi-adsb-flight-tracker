#!/bin/sh
set -eu

percent=$(cat /var/lib/flight-tracker/brightness 2>/dev/null || echo 70)
case "$percent" in ''|*[!0-9]*) percent=70 ;; esac
[ "$percent" -ge 10 ] 2>/dev/null || percent=10
[ "$percent" -le 100 ] 2>/dev/null || percent=100
for device in /sys/class/backlight/*; do
    [ -f "$device/max_brightness" ] || continue
    chgrp flighttracker "$device/brightness"
    chmod g+w "$device/brightness"
    maximum=$(cat "$device/max_brightness")
    value=$(((maximum * percent + 50) / 100))
    [ "$value" -ge 1 ] || value=1
    echo "$value" > "$device/brightness"
done
install -o lighttpd -g flighttracker -m 0660 /dev/null /var/lib/flight-tracker/brightness.new
printf '%s\n' "$percent" > /var/lib/flight-tracker/brightness.new
mv /var/lib/flight-tracker/brightness.new /var/lib/flight-tracker/brightness
