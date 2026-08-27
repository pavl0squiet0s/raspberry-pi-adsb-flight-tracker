#!/usr/bin/python3
"""Build the browser preload manifest for all installed country flags."""
import json
import sys
from pathlib import Path


def flag_names(directory):
    return sorted(path.stem for path in Path(directory).glob("*.svg"))


if __name__ == "__main__":
    source = Path(sys.argv[1])
    target = Path(sys.argv[2])
    target.write_text(json.dumps(flag_names(source), separators=(",", ":")))
