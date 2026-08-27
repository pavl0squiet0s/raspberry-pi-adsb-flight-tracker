#!/bin/sh
set -eu

device=/dev/zram0
size=${ZRAM_SIZE_BYTES:-268435456}

case "${1:-start}" in
    start)
        grep -q "^$device " /proc/swaps 2>/dev/null && exit 0
        modprobe zram
        [ -e /sys/block/zram0/comp_algorithm ] && grep -qw zstd /sys/block/zram0/comp_algorithm && echo zstd > /sys/block/zram0/comp_algorithm
        echo "$size" > /sys/block/zram0/disksize
        mkswap "$device" >/dev/null
        swapon -p 100 "$device"
        ;;
    stop)
        grep -q "^$device " /proc/swaps 2>/dev/null && swapoff "$device"
        [ -e /sys/block/zram0/reset ] && echo 1 > /sys/block/zram0/reset
        ;;
    *)
        echo "Usage: $0 {start|stop}" >&2
        exit 2
        ;;
esac
