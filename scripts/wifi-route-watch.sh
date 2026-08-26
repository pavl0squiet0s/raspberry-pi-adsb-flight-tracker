#!/bin/sh
set -u
while :; do
    state=$(/sbin/wpa_cli -i wlan0 -p /run/wpa_supplicant status 2>/dev/null | sed -n 's/^wpa_state=//p')
    if [ "$state" = COMPLETED ] && ! ip -4 route show default | grep -q '^default '; then
        pid=$(cat /var/run/udhcpc.wlan0.pid 2>/dev/null || true)
        case "$pid" in *[!0-9]*|'') ;; *) kill -USR1 "$pid" 2>/dev/null || true ;; esac
    fi
    sleep 5
done
