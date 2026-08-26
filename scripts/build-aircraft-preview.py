#!/usr/bin/env python3
"""Build and optionally serve a local-only preview of hand-drawn aircraft PNGs."""

import argparse
import html
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import sys

try:
    from PIL import Image
except ImportError:
    print("Pillow is required: sudo pacman -S python-pillow", file=sys.stderr)
    raise SystemExit(2)


ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "web/icons/aircraft"
OUTPUT = SOURCE / "local-test.html"
AIRCRAFT = (
    ("helicopter", "Helikopter", "Wirnikowce: R22/R44/R66, H135/H145, A109 i S-76."),
    ("fighter", "Myśliwiec", "Szybkie wojskowe samoloty bojowe: F-15, F-16, F-35, Typhoon, Rafale i Hawk."),
    ("militarytransport", "Wojskowy / transportowy", "Transportowce, tankowce i samoloty patrolowe: C-130, C-17, A400M, KC-135 i P-8."),
    ("lightprop", "Lekki śmigłowy", "Małe samoloty tłokowe: Cessna 172/182, Piper, Cirrus i Diamond."),
    ("turboprop", "Turbośmigłowy", "ATR 42/72, Dash 8, Saab 340 i PC-12."),
    ("businessjet", "Odrzutowiec biznesowy", "Gulfstream, Citation, Learjet, Falcon, Challenger i Embraer Legacy."),
    ("narrowbody", "Odrzutowiec pasażerski", "Samoloty regionalne i wąskokadłubowe: Embraer E-Jets, CRJ, Airbus A220/A320/A321 oraz Boeing 737/757."),
    ("widebody", "Szerokokadłubowy liniowiec", "Duże samoloty dalekodystansowe: A330/A350 oraz Boeing 767/777/787 i 747."),
    ("superheavy", "Superciężki", "Największe konstrukcje: Airbus A380, Boeing 747-8 oraz Antonow An-124/225."),
)


def number(value):
    """Map one 96px source coordinate onto the runtime's 32-unit grid."""
    return f"{value / 3:.9f}".rstrip("0").rstrip(".") or "0"


def pixel_path(image):
    """Return a compact path whose 96px raster round-trip is exact."""
    active = {}
    rectangles = []
    for y in range(97):
        runs = []
        if y < 96:
            x = 0
            while x < 96:
                if image.getpixel((x, y)) != (0, 0, 0, 255):
                    x += 1
                    continue
                start = x
                while x < 96 and image.getpixel((x, y)) == (0, 0, 0, 255):
                    x += 1
                runs.append((start, x))
        current = set(runs)
        for run, (start_y, last_y) in list(active.items()):
            if run not in current:
                rectangles.append((run[0], start_y, run[1], last_y + 1))
                del active[run]
        for run in runs:
            active[run] = (active.get(run, (y, y))[0], y)
    path = "".join(
        f"M{number(x0)} {number(y0)}H{number(x1)}V{number(y1)}H{number(x0)}Z"
        for x0, y0, x1, y1 in rectangles
    )
    return path, len(rectangles)


def load_icon(stem):
    path = SOURCE / f"new_{stem}.png"
    if not path.exists():
        return {"path": path, "error": "Brak pliku"}
    image = Image.open(path).convert("RGBA")
    if image.size != (96, 96):
        return {"path": path, "error": f"Nieprawidłowy rozmiar: {image.width}×{image.height}"}
    pixels = image.get_flattened_data()
    invalid = sum(pixel not in ((0, 0, 0, 0), (0, 0, 0, 255)) for pixel in pixels)
    if invalid:
        return {"path": path, "error": f"{invalid} nieprawidłowych pikseli"}
    black = sum(pixel == (0, 0, 0, 255) for pixel in pixels)
    if not black:
        return {"path": path, "error": "Brak czarnych pikseli"}
    xs, ys = zip(*((x, y) for y in range(96) for x in range(96) if image.getpixel((x, y))[3]))
    data, rectangles = pixel_path(image)
    return {
        "path": path, "data": data, "pixels": black, "rectangles": rectangles,
        "bounds": f"x={min(xs)}–{max(xs)}, y={min(ys)}–{max(ys)}",
    }


def card(stem, title, description):
    icon = load_icon(stem)
    filename = html.escape(icon["path"].name)
    if "error" in icon:
        return f'''<article class="icon-diagnostic invalid">
          <div class="missing">?</div><div><h3>{html.escape(title)}</h3>
          <p>{html.escape(description)}</p><small>{filename} · {html.escape(icon["error"])}</small></div>
        </article>'''
    data = html.escape(icon["data"], quote=True)
    return f'''<article class="icon-diagnostic">
      <div class="views"><svg viewBox="0 0 32 32" aria-label="{html.escape(title)}"><path fill="currentColor" d="{data}"/></svg></div>
      <div><h3>{html.escape(title)}</h3><p>{html.escape(description)}</p>
      <small>{filename} · {icon['pixels']} px · {icon['rectangles']} prostokątów<br>{icon['bounds']}</small></div>
    </article>'''


def build(auto_refresh=False):
    cards = "\n".join(card(*aircraft) for aircraft in AIRCRAFT)
    refresh = '<meta http-equiv="refresh" content="2">' if auto_refresh else ""
    document = f'''<!doctype html>
<html lang="pl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">{refresh}
<title>Lokalna diagnostyka ikon</title><style>
:root{{color-scheme:dark;font-family:"Noto Sans",system-ui,sans-serif}}*{{box-sizing:border-box}}
body{{margin:0;min-height:100vh;padding:28px;background:#07111d;color:#f8fafc}}
.test-card{{width:min(704px,100%);margin:auto;padding:16px;border:1px solid #64748b;border-radius:16px;background:#0b1727;box-shadow:0 12px 45px #000}}
h1{{margin:0 0 3px;font-size:25px}}.intro{{margin:3px 0 13px;color:#94a3b8}}
.icon-diagnostics{{display:grid;grid-template-columns:1fr 1fr;gap:9px}}
.icon-diagnostic{{display:grid;grid-template-columns:76px 1fr;align-items:center;gap:10px;min-height:92px;padding:9px;border:1px solid #294b70;border-radius:10px;background:#102a46}}
.views{{width:68px;height:68px;padding:5px;border-radius:8px;background:#dbeafe;color:#2563a8}}
.views svg{{display:block;width:58px;height:58px}}
.icon-diagnostic h3{{margin:0;font-size:14px}}.icon-diagnostic p{{margin:3px 0;color:#cbd5e1;font-size:11px;line-height:1.3}}
.icon-diagnostic small{{color:#7dd3fc;font:10px monospace}}.invalid{{border-color:#b45309}}.missing{{display:grid;place-items:center;width:68px;height:68px;border-radius:8px;background:#3f2a1d;color:#fbbf24;font-size:32px}}
footer{{margin-top:13px;color:#94a3b8;font-size:11px}}@media(max-width:620px){{body{{padding:8px}}.icon-diagnostics{{grid-template-columns:1fr}}}}
</style></head><body><main class="test-card"><h1>Diagnostyka ikon — lokalna</h1>
<p class="intro">Podgląd SVG generowany bezpośrednio z plików 96×96 PNG. Nie zmienia masterów ani Raspberry Pi.</p>
<section class="icon-diagnostics">{cards}</section>
<footer>Wymagane piksele: wyłącznie #000000/255 albo przezroczyste RGBA 0/0/0/0.</footer></main></body></html>'''
    OUTPUT.write_text(document, encoding="utf-8")
    valid = sum("error" not in load_icon(stem) for stem, _, _ in AIRCRAFT)
    print(f"Generated {OUTPUT.relative_to(ROOT)} ({valid}/{len(AIRCRAFT)} valid PNGs)")


class PreviewHandler(SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path in ("/", "/local-test.html"):
            build(auto_refresh=True)
            self.path = "/local-test.html"
        return super().do_GET()

    def log_message(self, fmt, *args):
        pass


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--serve", action="store_true", help="serve an auto-refreshing preview on localhost")
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()
    build(auto_refresh=args.serve)
    if args.serve:
        handler = lambda *a, **kw: PreviewHandler(*a, directory=str(SOURCE), **kw)
        server = ThreadingHTTPServer(("127.0.0.1", args.port), handler)
        print(f"Local preview: http://127.0.0.1:{args.port}/ (Ctrl+C to stop)")
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            print("\nStopped")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
