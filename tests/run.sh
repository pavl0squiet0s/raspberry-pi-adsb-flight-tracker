#!/bin/sh
set -eu
python3 scripts/build-aircraft-icons.py --check
if command -v node >/dev/null 2>&1; then node tests/features.test.js; else deno run tests/features.test.js; fi
python3 tests/mlat_api_test.py
python3 tests/enrichment_test.py
python3 tests/brightness_api_test.py
for file in scripts/*.sh openrc/* tests/*.sh; do sh -n "$file"; done
python3 -m py_compile cgi-bin/*.py scripts/*.py tests/*.py
echo "Local tests passed"
