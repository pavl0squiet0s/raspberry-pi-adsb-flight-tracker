#!/bin/sh
set -u
status_file=/run/flight-tracker/wifi-status.json
write_status() {
    raw=$(/sbin/wpa_cli -i wlan0 -p /run/wpa_supplicant status 2>/dev/null || true)
    state=$(printf '%s\n' "$raw" | sed -n 's/^wpa_state=//p')
    ssid=$(printf '%s\n' "$raw" | sed -n 's/^ssid=//p' | sed 's/["\\]/_/g')
    ip=$(printf '%s\n' "$raw" | sed -n 's/^ip_address=//p' | sed 's/["\\]/_/g')
    connected=false; signal=null
    if [ "$state" = COMPLETED ]; then
        connected=true
        rssi=$(/sbin/wpa_cli -i wlan0 -p /run/wpa_supplicant signal_poll 2>/dev/null | sed -n 's/^RSSI=//p')
        case "$rssi" in -[0-9]*) signal=$((2 * (rssi + 100))); [ "$signal" -lt 0 ] && signal=0; [ "$signal" -gt 100 ] && signal=100 ;; esac
    fi
    tmp="${status_file}.tmp.$$"
    printf '{"connected":%s,"ssid":"%s","ip":"%s","signal":%s,"updated_at":%s}\n' "$connected" "$ssid" "$ip" "$signal" "$(date +%s)" > "$tmp"
    chmod 0644 "$tmp" && mv "$tmp" "$status_file"
}
while :; do
    state=$(/sbin/wpa_cli -i wlan0 -p /run/wpa_supplicant status 2>/dev/null | sed -n 's/^wpa_state=//p')
    if [ "$state" = COMPLETED ] && ! ip -4 route show default | grep -q '^default '; then
        pid=$(cat /var/run/udhcpc.wlan0.pid 2>/dev/null || true)
        case "$pid" in *[!0-9]*|'') ;; *) kill -USR1 "$pid" 2>/dev/null || true ;; esac
    fi
    write_status
    sleep 5
done
