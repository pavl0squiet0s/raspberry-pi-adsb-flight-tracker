# Master aircraft icons

- One icon per `.svg`, pointing up, with `viewBox="0 0 32 32"`.
- Use exactly one filled `<path fill="currentColor">`; no strokes, text, scripts, images or external references.
- Use the shared design grid: centre line at `x=16`, visible bounds `x=2..30` and `y=2..30`.
- Keep left and right geometry mirrored around `x=16`; asymmetric reference-image artefacts must not be reproduced.
- PNG files in this directory are design references only. They are not deployed or read by the application.
- Run `python3 scripts/build-aircraft-icons.py` after editing. Deployment also runs it automatically.

## Local hand-drawn PNG preview

Name 96×96 black/transparent working files `new_<category>.png`, using the
unhyphenated category names in the table below. Generate a local TEST-style
page without changing any SVG master or deployed file:

```sh
python3 scripts/build-aircraft-preview.py
```

Open `web/icons/aircraft/local-test.html`, or run an auto-refreshing local-only
server while drawing:

```sh
python3 scripts/build-aircraft-preview.py --serve
```

Then open `http://127.0.0.1:8765/`. The server listens on localhost only and
regenerates the page on each browser refresh; while serving, the page refreshes
itself every two seconds.

| File | Aircraft category |
| --- | --- |
| `helicopter.svg` | Helicopters and rotorcraft: R22/R44/R66, H135/H145, A109, S-76 |
| `fighter.svg` | Military fighters and fast jets: F-15, F-16, F-35, Typhoon, Rafale, Hawk |
| `military-transport.svg` | Military transports, tankers and patrol aircraft: C-130, C-17, A400M, KC-135, P-8 |
| `light-prop.svg` | Small piston aircraft: Cessna 172/182, Piper, Cirrus, Diamond |
| `turboprop.svg` | Turboprops: ATR 42/72, Dash 8, Saab 340, PC-12 |
| `business-jet.svg` | Business jets: Gulfstream, Citation, Learjet, Falcon, Challenger, Legacy |
| `narrowbody.svg` | Regional and narrow-body jets: Embraer E-Jets, CRJ, Airbus A220/A320/A321, Boeing 737/757 |
| `widebody.svg` | Wide-body airliners: Airbus A330/A350, Boeing 747/767/777/787 |
| `super-heavy.svg` | Largest aircraft: Airbus A380, Boeing 747-8, Antonov An-124/225 |
