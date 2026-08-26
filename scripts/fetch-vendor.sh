#!/bin/sh
set -eu

root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
mkdir -p "$root/vendor"
mkdir -p "$root/vendor/fonts/Noto Sans Regular"

curl --fail --location --output "$root/vendor/leaflet.js" https://unpkg.com/leaflet@1.9.4/dist/leaflet.js
curl --fail --location --output "$root/vendor/leaflet.css" https://unpkg.com/leaflet@1.9.4/dist/leaflet.css
curl --fail --location --output "$root/vendor/protomaps-leaflet.js" https://unpkg.com/protomaps-leaflet@5.0.0/dist/protomaps-leaflet.js
curl --fail --location --output "$root/vendor/fonts/Noto Sans Regular/0-255.pbf" 'https://raw.githubusercontent.com/protomaps/basemaps-assets/main/fonts/Noto%20Sans%20Regular/0-255.pbf'
curl --fail --location --output "$root/vendor/fonts/Noto Sans Regular/256-511.pbf" 'https://raw.githubusercontent.com/protomaps/basemaps-assets/main/fonts/Noto%20Sans%20Regular/256-511.pbf'

mlat_commit=fe70767be859100176983b948140046b6ecdd34a
mlat_sha256=f1d4081c4c1b9b7b7aa303689f81aed6a3a2406766232f2bf39343a44a6bb36b
mlat_archive="$root/vendor/mlat-client-$mlat_commit.tar.gz"
curl --fail --location --output "$mlat_archive.new" "https://codeload.github.com/mutability/mlat-client/tar.gz/$mlat_commit"
echo "$mlat_sha256  $mlat_archive.new" | sha256sum -c -
mv "$mlat_archive.new" "$mlat_archive"

asyncore_version=1.0.5
asyncore_sha256=269bbc5252671827387636822841a1fb721ec6e858b23a3e12cf92eb1f97da2a
asyncore_wheel="$root/vendor/pyasyncore-$asyncore_version-py3-none-any.whl"
curl --fail --location --output "$asyncore_wheel.new" "https://files.pythonhosted.org/packages/1f/ab/b10cee56269ae150763f3f83b3e9305a11f42f50b3dcd58eeb8f7988f0bb/pyasyncore-$asyncore_version-py3-none-any.whl"
echo "$asyncore_sha256  $asyncore_wheel.new" | sha256sum -c -
mv "$asyncore_wheel.new" "$asyncore_wheel"

echo "Vendor assets downloaded to $root/vendor"
