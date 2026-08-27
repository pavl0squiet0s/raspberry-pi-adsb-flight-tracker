#!/bin/sh
set -u
config=/var/lib/flight-tracker/mlat.json
status=/run/flight-tracker/mlat-status.json
log=/var/log/flight-tracker/mlat-client.log
pid=""
current_state=""
previous_connected=false
connected_since=0
last_sync_at=0
running_signature=""

write_status() {
    tmp="${status}.tmp.$$"
    now=$(date +%s)
    connected=false
    synchronized=false
    case "$1" in
        connecting) connected=true ;;
        synchronized) connected=true; synchronized=true ;;
    esac
    if [ "$connected" = true ] && [ "$previous_connected" != true ]; then connected_since=$now; fi
    if [ "$connected" != true ]; then connected_since=0; fi
    if [ "$synchronized" = true ]; then last_sync_at=$now; fi
    current_state=$1
    previous_connected=$connected
    public_antenna=${antenna:-null}; public_terrain=${terrain:-null}; public_absolute=${absolute:-null}
    [ -n "$public_antenna" ] || public_antenna=null; [ -n "$public_terrain" ] || public_terrain=null; [ -n "$public_absolute" ] || public_absolute=null
    config_json=$(printf '"config":{"enabled":%s,"antenna_height_m":%s,"terrain_m":%s,"absolute_elevation_m":%s,"ellipsoid_altitude_m":%s,"receiver_lat":%s,"receiver_lon":%s}' "${enabled:-false}" "$public_antenna" "$public_terrain" "$public_absolute" "${ellipsoid_altitude:-190}" "${receiver_lat:-0}" "${receiver_lon:-0}")
    if [ "$#" -gt 1 ]; then
        printf '{"state":"%s","detail":"%s","connected":%s,"synchronized":%s,"connected_since":%s,"last_sync_at":%s,"updated_at":%s,%s}\n' "$1" "$2" "$connected" "$synchronized" "$connected_since" "$last_sync_at" "$now" "$config_json" > "$tmp"
    else
        printf '{"state":"%s","connected":%s,"synchronized":%s,"connected_since":%s,"last_sync_at":%s,"updated_at":%s,%s}\n' "$1" "$connected" "$synchronized" "$connected_since" "$last_sync_at" "$now" "$config_json" > "$tmp"
    fi
    chmod 0644 "$tmp" && mv "$tmp" "$status"
}
stop_client() {
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then kill "$pid" 2>/dev/null || true; wait "$pid" 2>/dev/null || true; fi
    pid=""
}
cleanup() { stop_client; exit 0; }
trap cleanup INT TERM EXIT
mkdir -p /run/flight-tracker
while :; do
    . /etc/flight-tracker/flight-tracker.conf
    enabled=$(sed -n 's/.*"enabled":\(true\|false\).*/\1/p' "$config" 2>/dev/null | head -n1)
    antenna=$(sed -n 's/.*"antenna_height_m":\([-0-9.]*\).*/\1/p' "$config" 2>/dev/null | head -n1)
    terrain=$(sed -n 's/.*"terrain_m":\([-0-9.]*\).*/\1/p' "$config" 2>/dev/null | head -n1)
    absolute=$(sed -n 's/.*"absolute_elevation_m":\([-0-9.]*\).*/\1/p' "$config" 2>/dev/null | head -n1)
    ellipsoid_altitude=$(sed -n 's/.*"ellipsoid_altitude_m":\([-0-9.]*\).*/\1/p' "$config" 2>/dev/null | head -n1)
    [ -n "$ellipsoid_altitude" ] || ellipsoid_altitude=190
    receiver_lat=$(sed -n 's/.*"receiver_lat":\([-0-9.]*\).*/\1/p' "$config" 2>/dev/null | head -n1)
    receiver_lon=$(sed -n 's/.*"receiver_lon":\([-0-9.]*\).*/\1/p' "$config" 2>/dev/null | head -n1)
    [ -n "$receiver_lat" ] || receiver_lat=$RECEIVER_LAT
    [ -n "$receiver_lon" ] || receiver_lon=$RECEIVER_LON
    desired_signature="$receiver_lat|$receiver_lon|$ellipsoid_altitude"
    if [ "$enabled" != true ] || [ -z "$antenna" ]; then stop_client; write_status disabled; sleep 2; continue; fi
    wifi=$(/sbin/wpa_cli -i wlan0 -p /run/wpa_supplicant status 2>/dev/null | sed -n 's/^wpa_state=//p')
    if [ "$wifi" != COMPLETED ]; then stop_client; write_status waiting_wifi; sleep 2; continue; fi
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
        if [ "$running_signature" != "$desired_signature" ]; then stop_client; write_status connecting "zastosowanie nowej lokalizacji"; sleep 1; continue; fi
        if grep -Eq '"mlat":\[[^]]' /run/flight-tracker/aircraft.json 2>/dev/null || tail -n 30 "$log" 2>/dev/null | grep -Eqi 'synchronized|peer_count'; then
            write_status synchronized
        elif tail -n 30 "$log" 2>/dev/null | grep -q 'Handshake complete' && tail -n 30 "$log" 2>/dev/null | grep -q 'results connection.*established'; then
            write_status connecting "połączono z ADSB.lol; oczekiwanie na synchronizację"
        elif tail -n 30 "$log" 2>/dev/null | grep -Eqi 'connection refused|cannot connect|failed to connect|timed out|network is unreachable'; then
            write_status error "nie można połączyć z ADSB.lol"
        else
            write_status connecting "łączenie z ADSB.lol"
        fi
        sleep 2; continue
    fi
    : > "$log"; write_status connecting "łączenie z ADSB.lol"
    PYTHONUNBUFFERED=1 /opt/mlat-client/bin/mlat-client --user mamaloty --uuid-file /var/lib/flight-tracker/feeder-uuid --privacy --lat "$receiver_lat" --lon "$receiver_lon" --alt "${ellipsoid_altitude}m" --input-type dump1090 --input-connect 127.0.0.1:30005 --server feed.adsb.lol:31090 --results beast,connect,127.0.0.1:30104 >> "$log" 2>&1 &
    running_signature=$desired_signature
    pid=$!; sleep 4
    if ! kill -0 "$pid" 2>/dev/null; then wait "$pid" 2>/dev/null || true; pid=""; write_status error; sleep 10; fi
done
