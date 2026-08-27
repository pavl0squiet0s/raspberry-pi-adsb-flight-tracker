#!/bin/sh
set -eu

if [ "$(id -u)" -ne 0 ]; then
    echo "Run as root" >&2
    exit 1
fi
src=${1:-$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)}
conf="$src/config/flight-tracker.local.conf"
[ -f "$conf" ] || conf="$src/config/flight-tracker.conf"
[ -f "$conf" ] || { echo "Missing $conf" >&2; exit 1; }

same_file() { [ -f "$2" ] && cmp -s "$1" "$2"; }
dump1090_changed=false
mlat_changed=false
wifi_route_changed=false
location_watch_changed=false
enrichment_changed=false
same_file "$src/openrc/flight-tracker-dump1090" /etc/init.d/flight-tracker-dump1090 || dump1090_changed=true
same_file "$conf" /etc/flight-tracker/flight-tracker.conf || dump1090_changed=true
same_file "$src/scripts/mlat-supervisor.sh" /usr/libexec/flight-tracker/mlat-supervisor.sh || mlat_changed=true
same_file "$src/openrc/flight-tracker-mlat" /etc/init.d/flight-tracker-mlat || mlat_changed=true
same_file "$src/scripts/wifi-route-watch.sh" /usr/libexec/flight-tracker/wifi-route-watch.sh || wifi_route_changed=true
same_file "$src/openrc/flight-tracker-wifi-route" /etc/init.d/flight-tracker-wifi-route || wifi_route_changed=true
same_file "$src/scripts/location-watch.sh" /usr/libexec/flight-tracker/location-watch.sh || location_watch_changed=true
same_file "$src/openrc/flight-tracker-location-watch" /etc/init.d/flight-tracker-location-watch || location_watch_changed=true
same_file "$src/scripts/enrichment-worker.py" /usr/libexec/flight-tracker/enrichment-worker.py || enrichment_changed=true
same_file "$src/openrc/flight-tracker-enrichment" /etc/init.d/flight-tracker-enrichment || enrichment_changed=true

apk add --no-cache dump1090 rtl-sdr lighttpd python3 py3-pip
python3 "$src/scripts/build-aircraft-icons.py"

mlat_commit=fe70767be859100176983b948140046b6ecdd34a
mlat_sha256=f1d4081c4c1b9b7b7aa303689f81aed6a3a2406766232f2bf39343a44a6bb36b
mlat_build_id="$mlat_commit-uuid1"
if [ ! -x /opt/mlat-client/bin/mlat-client ] || [ "$(cat /opt/mlat-client/.source-commit 2>/dev/null || true)" != "$mlat_build_id" ]; then
    mlat_changed=true
    apk add --no-cache --virtual .mlat-build build-base python3-dev linux-headers py3-virtualenv
    mlat_tmp=$(mktemp -d)
    cleanup_mlat_build() { apk del .mlat-build >/dev/null 2>&1 || true; rm -rf "$mlat_tmp"; }
    trap cleanup_mlat_build EXIT INT TERM
    if [ -f "$src/vendor/mlat-client-$mlat_commit.tar.gz" ]; then
        cp "$src/vendor/mlat-client-$mlat_commit.tar.gz" "$mlat_tmp/mlat-client.tar.gz"
    else
        wget -q -O "$mlat_tmp/mlat-client.tar.gz" "https://codeload.github.com/mutability/mlat-client/tar.gz/$mlat_commit"
    fi
    echo "$mlat_sha256  $mlat_tmp/mlat-client.tar.gz" | sha256sum -c -
    tar -xzf "$mlat_tmp/mlat-client.tar.gz" -C "$mlat_tmp"
    patch -d "$mlat_tmp/mlat-client-$mlat_commit" -p1 < "$src/patches/mlat-client-uuid.patch"
    rm -rf /opt/mlat-client.new
    virtualenv /opt/mlat-client.new
    /opt/mlat-client.new/bin/pip install --no-cache-dir --no-deps "$mlat_tmp/mlat-client-$mlat_commit"
    echo "$mlat_build_id" > /opt/mlat-client.new/.source-commit
    rm -rf /opt/mlat-client
    mv /opt/mlat-client.new /opt/mlat-client
    cleanup_mlat_build
    trap - EXIT INT TERM
fi
# virtualenv console scripts record the temporary build path in their shebang.
# Repair it after the atomic directory rename (and on upgrades from older installs).
for mlat_script in /opt/mlat-client/bin/mlat-client /opt/mlat-client/bin/fa-mlat-client /opt/mlat-client/bin/pip /opt/mlat-client/bin/pip3; do
    [ -f "$mlat_script" ] && sed -i '1s|mlat-client\.new|mlat-client|' "$mlat_script"
done
if ! /opt/mlat-client/bin/python -c 'import asyncore' >/dev/null 2>&1; then
    asyncore_wheel="$src/vendor/pyasyncore-1.0.5-py3-none-any.whl"
    asyncore_sha256=269bbc5252671827387636822841a1fb721ec6e858b23a3e12cf92eb1f97da2a
    [ -f "$asyncore_wheel" ] || { echo "Missing pinned pyasyncore wheel" >&2; exit 1; }
    echo "$asyncore_sha256  $asyncore_wheel" | sha256sum -c -
    /opt/mlat-client/bin/python -m pip install --no-cache-dir --no-deps "$asyncore_wheel"
fi

getent group flighttracker >/dev/null 2>&1 || addgroup -S flighttracker
getent group plugdev >/dev/null 2>&1 || addgroup -S plugdev
if ! getent passwd flighttracker >/dev/null 2>&1; then
    adduser -S -D -H -G flighttracker -h /nonexistent -s /sbin/nologin flighttracker
else
    addgroup flighttracker flighttracker >/dev/null 2>&1 || true
fi
addgroup flighttracker plugdev >/dev/null 2>&1 || true
addgroup lighttpd flighttracker >/dev/null 2>&1 || true
addgroup flighttracker lighttpd >/dev/null 2>&1 || true

install -d -m 0755 /etc/flight-tracker /etc/chromium/policies/managed /etc/chromium-browser/policies/managed /usr/share/flight-tracker/web/vendor /usr/share/flight-tracker/web/maps /usr/share/flight-tracker/web/flags /usr/libexec/flight-tracker /var/log/flight-tracker
install -d -o lighttpd -g flighttracker -m 2770 /var/lib/flight-tracker
chown root:root /var/log/flight-tracker
install -m 0644 "$conf" /etc/flight-tracker/flight-tracker.conf
install -m 0644 "$src/lighttpd/flight-tracker.conf" /etc/flight-tracker/lighttpd.conf
install -m 0644 "$src/web/index.html" "$src/web/style.css" "$src/web/app.js" "$src/web/i18n.js" "$src/web/features.js" "$src/web/generated-aircraft-icons.js" /usr/share/flight-tracker/web/
install -m 0755 "$src/cgi-bin/wifi.py" /usr/libexec/flight-tracker/wifi.py
install -m 0755 "$src/cgi-bin/mlat.py" /usr/libexec/flight-tracker/mlat.py
install -m 0755 "$src/cgi-bin/position.py" /usr/libexec/flight-tracker/position.py
install -m 0755 "$src/cgi-bin/enrichment.py" /usr/libexec/flight-tracker/enrichment.py
install -m 0755 "$src/cgi-bin/brightness.py" /usr/libexec/flight-tracker/brightness.py
rm -f /usr/libexec/flight-tracker/route.py /usr/libexec/flight-tracker/aircraft.py
install -m 0755 "$src/scripts/mlat-supervisor.sh" /usr/libexec/flight-tracker/mlat-supervisor.sh
install -m 0755 "$src/scripts/kiosk-browser.sh" /usr/libexec/flight-tracker/kiosk-browser
install -m 0755 "$src/scripts/wifi-route-watch.sh" /usr/libexec/flight-tracker/wifi-route-watch.sh
install -m 0755 "$src/scripts/location-watch.sh" /usr/libexec/flight-tracker/location-watch.sh
install -m 0755 "$src/scripts/enrichment-worker.py" /usr/libexec/flight-tracker/enrichment-worker.py
install -m 0755 "$src/scripts/brightness-restore.sh" /usr/libexec/flight-tracker/brightness-restore.sh
install -m 0755 "$src/scripts/zram-swap.sh" /usr/libexec/flight-tracker/zram-swap.sh
install -m 0644 "$src/config/chromium-policy.json" /etc/chromium/policies/managed/mamaloty.json
install -m 0644 "$src/config/chromium-policy.json" /etc/chromium-browser/policies/managed/mamaloty.json
cp -R "$src/web/flags/." /usr/share/flight-tracker/web/flags/
find /usr/share/flight-tracker/web/flags -type f -exec chmod 0644 {} \;
[ -s /var/lib/flight-tracker/feeder-uuid ] || cat /proc/sys/kernel/random/uuid > /var/lib/flight-tracker/feeder-uuid
chown flighttracker:flighttracker /var/lib/flight-tracker/feeder-uuid
chmod 0640 /var/lib/flight-tracker/feeder-uuid
if [ -s /var/lib/flight-tracker/mlat.json ] && ! grep -q '"ellipsoid_altitude_m"' /var/lib/flight-tracker/mlat.json; then
    sed 's/}$/,"ellipsoid_altitude_m":190.0}/' /var/lib/flight-tracker/mlat.json > /var/lib/flight-tracker/mlat.json.new
    chown flighttracker:flighttracker /var/lib/flight-tracker/mlat.json.new
    chmod 0640 /var/lib/flight-tracker/mlat.json.new
    mv /var/lib/flight-tracker/mlat.json.new /var/lib/flight-tracker/mlat.json
    mlat_changed=true
fi

wifi_conf_changed=false
if ! grep -q '^ctrl_interface=' /etc/wpa_supplicant/wpa_supplicant.conf; then
    sed -i '1i ctrl_interface=DIR=/run/wpa_supplicant GROUP=lighttpd\nupdate_config=1' /etc/wpa_supplicant/wpa_supplicant.conf
    wifi_conf_changed=true
fi

set -a
. "$conf"
set +a
sed \
    -e 's/mode: "[^"]*"/mode: "'"$FLIGHT_TRACKER_MODE"'"/' \
    -e "s/lat: [0-9.-]*/lat: $RECEIVER_LAT/" \
    -e "s/lon: [0-9.-]*/lon: $RECEIVER_LON/" \
    -e 's/name: "[^"]*"/name: "'"$RECEIVER_NAME"'"/' \
    -e "s/maxRangeKm: [0-9]*/maxRangeKm: $MAX_RANGE_KM/" \
    -e "s/minZoom: [0-9]*/minZoom: $MAP_MIN_ZOOM/" \
    -e "s/maxZoom: [0-9]*/maxZoom: $MAP_MAX_ZOOM/" \
    -e "s/staleSeconds: [0-9]*/staleSeconds: $STALE_SECONDS/" \
    -e "s/trailMinutes: [0-9]*/trailMinutes: $TRAIL_MINUTES/" \
    "$src/web/config.js" > /usr/share/flight-tracker/web/config.js

for asset in leaflet.js leaflet.css protomaps-leaflet.js; do
    [ -f "$src/vendor/$asset" ] && install -m 0644 "$src/vendor/$asset" "/usr/share/flight-tracker/web/vendor/$asset"
done
if [ -d "$src/vendor/fonts" ]; then
    cp -R "$src/vendor/fonts" /usr/share/flight-tracker/web/vendor/
    find /usr/share/flight-tracker/web/vendor/fonts -type d -exec chmod 0755 {} \;
    find /usr/share/flight-tracker/web/vendor/fonts -type f -exec chmod 0644 {} \;
fi
map_name=${FLIGHT_TRACKER_MODE%-offline}
if [ "$map_name" != "$FLIGHT_TRACKER_MODE" ] && { [ ! -f "$src/maps/$map_name.pmtiles" ] || [ ! -f "$src/maps/$map_name.pmtiles.sha256" ]; }; then
    echo "Missing offline map archive or checksum for $map_name" >&2
    exit 1
fi
if [ "$map_name" != "$FLIGHT_TRACKER_MODE" ]; then
    map_hash=$(awk '{print $1}' "$src/maps/$map_name.pmtiles.sha256")
    installed_hash=$(awk '{print $1}' "/usr/share/flight-tracker/web/maps/$map_name.pmtiles.sha256" 2>/dev/null || true)
    if [ "$map_hash" != "$installed_hash" ]; then
        install -m 0644 "$src/maps/$map_name.pmtiles" "/usr/share/flight-tracker/web/maps/$map_name.pmtiles.new"
        echo "$map_hash  /usr/share/flight-tracker/web/maps/$map_name.pmtiles.new" | sha256sum -c -
        mv "/usr/share/flight-tracker/web/maps/$map_name.pmtiles.new" "/usr/share/flight-tracker/web/maps/$map_name.pmtiles"
        install -m 0644 "$src/maps/$map_name.pmtiles.sha256" "/usr/share/flight-tracker/web/maps/$map_name.pmtiles.sha256"
    fi
fi

for lang in en pl; do
    raster_name="${map_name}-raster-$lang"
    raster_src="$src/maps/$raster_name"
    raster_checksum="$src/maps/$raster_name.sha256"
    [ -d "$raster_src" ] || continue
    [ -f "$raster_checksum" ] || { echo "Missing checksum for $raster_name" >&2; exit 1; }
    raster_hash=$(awk '{print $1}' "$raster_checksum")
    installed_hash=$(awk '{print $1}' "/usr/share/flight-tracker/web/maps/$raster_name.sha256" 2>/dev/null || true)
    if [ "$raster_hash" != "$installed_hash" ]; then
        rm -rf "/usr/share/flight-tracker/web/maps/$raster_name.new"
        cp -R "$raster_src" "/usr/share/flight-tracker/web/maps/$raster_name.new"
        find "/usr/share/flight-tracker/web/maps/$raster_name.new" -type d -exec chmod 0755 {} \;
        find "/usr/share/flight-tracker/web/maps/$raster_name.new" -type f -exec chmod 0644 {} \;
        rm -rf "/usr/share/flight-tracker/web/maps/$raster_name"
        mv "/usr/share/flight-tracker/web/maps/$raster_name.new" "/usr/share/flight-tracker/web/maps/$raster_name"
        install -m 0644 "$raster_checksum" "/usr/share/flight-tracker/web/maps/$raster_name.sha256"
    fi
done

install -m 0755 "$src/openrc/flight-tracker-dump1090" /etc/init.d/flight-tracker-dump1090
install -m 0755 "$src/openrc/flight-tracker-web" /etc/init.d/flight-tracker-web
install -m 0755 "$src/openrc/flight-tracker-mlat" /etc/init.d/flight-tracker-mlat
install -m 0755 "$src/openrc/flight-tracker-wifi-route" /etc/init.d/flight-tracker-wifi-route
install -m 0755 "$src/openrc/flight-tracker-location-watch" /etc/init.d/flight-tracker-location-watch
install -m 0755 "$src/openrc/flight-tracker-enrichment" /etc/init.d/flight-tracker-enrichment
install -m 0755 "$src/openrc/flight-tracker-brightness" /etc/init.d/flight-tracker-brightness
install -m 0755 "$src/openrc/flight-tracker-zram" /etc/init.d/flight-tracker-zram
rc-update add flight-tracker-dump1090 default >/dev/null 2>&1 || true
rc-update add flight-tracker-web default >/dev/null 2>&1 || true
rc-update add flight-tracker-mlat default >/dev/null 2>&1 || true
rc-update add flight-tracker-wifi-route default >/dev/null 2>&1 || true
rc-update add flight-tracker-location-watch default >/dev/null 2>&1 || true
rc-update add flight-tracker-enrichment default >/dev/null 2>&1 || true
rc-update add flight-tracker-brightness default >/dev/null 2>&1 || true
rc-update add flight-tracker-zram default >/dev/null 2>&1 || true
/usr/libexec/flight-tracker/zram-swap.sh start
/usr/libexec/flight-tracker/brightness-restore.sh
udevadm control --reload-rules 2>/dev/null || true
udevadm trigger --subsystem-match=usb 2>/dev/null || true

home=$(getent passwd mamaloty | cut -d: -f6)
if [ -n "$home" ] && [ -f "$home/.xinitrc" ]; then
    [ -f "$home/.xinitrc.pre-flight-tracker" ] || cp -p "$home/.xinitrc" "$home/.xinitrc.pre-flight-tracker"
    sed -i 's#https://www.openstreetmap.org#http://127.0.0.1:8080/#' "$home/.xinitrc"
    sed -i 's#^chromium-browser #/usr/libexec/flight-tracker/kiosk-browser #' "$home/.xinitrc"
    sed -i 's/--disk-cache-size=[0-9]*/--disk-cache-size=134217728/' "$home/.xinitrc"
    sed -i 's/--media-cache-size=[0-9]*/--media-cache-size=16777216/' "$home/.xinitrc"
fi

rm -f /usr/share/flight-tracker/web/vendor/maplibre-gl.js /usr/share/flight-tracker/web/vendor/maplibre-gl.css /usr/share/flight-tracker/web/vendor/pmtiles.js
if [ ! -s /usr/share/flight-tracker/web/vendor/leaflet.js ] || [ ! -s /usr/share/flight-tracker/web/vendor/protomaps-leaflet.js ]; then
    echo "Browser vendor assets are missing; run scripts/fetch-vendor.sh before deployment" >&2
    exit 1
fi

if [ "$wifi_conf_changed" = true ]; then
    rc-service wpa_supplicant restart
fi
rc-service flight-tracker-web restart
if [ "$wifi_route_changed" = true ] || ! rc-service flight-tracker-wifi-route status >/dev/null 2>&1; then
    rc-service flight-tracker-wifi-route restart
fi
if [ "$dump1090_changed" = true ] || ! rc-service flight-tracker-dump1090 status >/dev/null 2>&1; then
    if lsusb | grep -Eiq 'RTL2832|RTL2838|Realtek|0bda:283[28]'; then
        rc-service flight-tracker-dump1090 restart
    else
        rc-service flight-tracker-dump1090 stop >/dev/null 2>&1 || true
        echo "WARNING: RTL-SDR not detected; decoder service left stopped" >&2
    fi
fi
if [ "$mlat_changed" = true ] || ! rc-service flight-tracker-mlat status >/dev/null 2>&1; then
    rc-service flight-tracker-mlat restart
fi
if [ "$location_watch_changed" = true ] || ! rc-service flight-tracker-location-watch status >/dev/null 2>&1; then
    rc-service flight-tracker-location-watch restart
fi
if [ "$enrichment_changed" = true ] || ! rc-service flight-tracker-enrichment status >/dev/null 2>&1; then
    rc-service flight-tracker-enrichment restart
fi

echo "Installed. UI: http://127.0.0.1:${WEB_PORT}/"
