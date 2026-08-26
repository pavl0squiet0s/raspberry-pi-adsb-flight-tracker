#!/bin/sh
exec chromium-browser \
    --lang=pl-PL \
    --no-first-run \
    --no-default-browser-check \
    --disable-translate \
    --disable-background-networking \
    --disable-component-update \
    --disable-domain-reliability \
    --disable-prompt-on-repost \
    "$@"
