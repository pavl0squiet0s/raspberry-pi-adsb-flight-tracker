#!/bin/sh
set -eu

host=${1:-mamaloty}
root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)

"$root/scripts/fetch-vendor.sh"
python3 "$root/scripts/build-aircraft-icons.py"

sync_map_artifact() {
    artifact=$1
    manifest=$2
    [ -e "$root/$artifact" ] || return 0
    [ -f "$root/$manifest" ] || { echo "Missing map checksum: $manifest" >&2; exit 1; }

    local_hash=$(awk 'NR == 1 { print $1 }' "$root/$manifest")
    remote_hash=$(tailscale ssh "root@$host" "head -n 1 '/opt/flight-tracker-src/$manifest' 2>/dev/null | cut -d ' ' -f 1" || true)
    if [ "$local_hash" = "$remote_hash" ]; then
        echo "Map unchanged, skipping: $artifact"
        return 0
    fi

    echo "Map changed, transferring: $artifact"
    tar -C "$root" -cf - "$artifact" "$manifest" | tailscale ssh "root@$host" \
        'install -d -m 0755 /opt/flight-tracker-src/maps && tar -xf - -C /opt/flight-tracker-src'
}

for map_name in sheffield wroclaw; do
    sync_map_artifact "maps/$map_name.pmtiles" "maps/$map_name.pmtiles.sha256"
    for language in en pl; do
        sync_map_artifact "maps/$map_name-raster-$language" "maps/$map_name-raster-$language.sha256"
    done
done

# Maps are transferred separately above only when their checksum changes.
tar -C "$root" --exclude='.git' --exclude='./maps' -cf - . | tailscale ssh "root@$host" \
    'install -d -m 0755 /opt/flight-tracker-src && tar -xf - -C /opt/flight-tracker-src && /opt/flight-tracker-src/scripts/install-alpine.sh /opt/flight-tracker-src'
