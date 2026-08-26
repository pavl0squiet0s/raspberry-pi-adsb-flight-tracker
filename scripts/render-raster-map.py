#!/usr/bin/env python3
"""Render PMTiles with the repository's vendored Protomaps renderer.

Uses only Python's standard library and an installed Firefox. The browser posts
each rendered WebP back to this temporary localhost server.
"""

import argparse
import json
import math
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse


ROOT = Path(__file__).resolve().parent.parent
PAINT_RULES = [0, 1, 2, 3, 5, 9, 10, 11, 14, 15, 16, 17, 26, 27, 28, 29, 31]
LABEL_RULES = [1, 3, 4, 5, 6, 7, 8]


def tile_range(bounds, zoom):
    west, south, east, north = bounds
    scale = 1 << zoom

    def xy(lon, lat):
        x = int((lon + 180.0) / 360.0 * scale)
        lat = max(-85.05112878, min(85.05112878, lat))
        y = int((1.0 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2.0 * scale)
        return x, y

    min_x, max_y = xy(west, south)
    max_x, min_y = xy(east, north)
    return range(min_x, max_x + 1), range(min_y, max_y + 1)


def render_page(config):
    return f"""<!doctype html><meta charset=utf-8>
<style>html,body,#map{{margin:0;width:256px;height:256px}}</style><div id=map></div>
<script src=/vendor/leaflet.js></script><script src=/vendor/protomaps-leaflet.js></script>
<script>
const cfg={json.dumps(config)};
const status=(text)=>fetch('/status',{{method:'POST',body:text}});
const pause=()=>new Promise(resolve=>setTimeout(resolve,0));
async function tile(layer,z,x,y){{
  const canvas=await new Promise((resolve,reject)=>{{
    const coords=L.point(x,y); coords.z=z;
    layer.createTile(coords,(error,result)=>error?reject(error):resolve(result));
  }});
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',0.86));
  if(!blob) throw new Error('Firefox could not encode WebP');
  const response=await fetch(`/tile?z=${{z}}&x=${{x}}&y=${{y}}`,{{method:'POST',body:blob}});
  if(!response.ok) throw new Error(await response.text());
}}
(async()=>{{
  try{{
    const map=L.map('map',{{center:cfg.center,zoom:cfg.zooms[0],zoomControl:false,
      attributionControl:false,zoomAnimation:false,fadeAnimation:false}});
    const layer=protomapsL.leafletLayer({{url:'/source.pmtiles',flavor:'light',lang:cfg.lang,
      updateWhenZooming:false,updateWhenIdle:true,keepBuffer:0,tileDelay:1}});
    const paints=new Set(cfg.paintRules), labels=new Set(cfg.labelRules);
    layer.paintRules=layer.paintRules.filter((_,i)=>paints.has(i));
    layer.labelRules=layer.labelRules.filter((_,i)=>labels.has(i));
    layer.clearLayout();
    // renderTile needs map projection state, but adding the layer would create
    // competing automatic tile requests and cancel explicit batch renders.
    layer._map=map;
    for(const group of cfg.tiles){{
      map.setView(cfg.center,group.z,{{animate:false}});
      await new Promise(resolve=>setTimeout(resolve,100));
      let done=0;
      for(let offset=0;offset<group.coords.length;offset+=cfg.parallel){{
        await Promise.all(group.coords.slice(offset,offset+cfg.parallel)
          .map(([x,y])=>tile(layer,group.z,x,y)));
        done+=cfg.parallel;
        if(done%32===0) await pause();
      }}
    }}
    await status('done');
  }}catch(error){{ await status('ERROR: '+(error.stack||error)); }}
}})();
</script>"""


class RenderServer(ThreadingHTTPServer):
    daemon_threads = True


def make_handler(source, output, page, finished):
    assets = {
        "/vendor/leaflet.js": ROOT / "vendor/leaflet.js",
        "/vendor/protomaps-leaflet.js": ROOT / "vendor/protomaps-leaflet.js",
        "/source.pmtiles": source,
    }

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, fmt, *args):
            pass

        def do_GET(self):
            path = urlparse(self.path).path
            if path == "/render":
                data = page.encode()
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)
                return
            file_path = assets.get(path)
            if not file_path:
                self.send_error(404)
                return
            size = file_path.stat().st_size
            start, end, code = 0, size - 1, 200
            requested = self.headers.get("Range")
            if requested and requested.startswith("bytes="):
                first, _, last = requested[6:].partition("-")
                start = int(first)
                end = min(int(last) if last else size - 1, size - 1)
                code = 206
            self.send_response(code)
            self.send_header("Content-Type", "application/octet-stream")
            self.send_header("Accept-Ranges", "bytes")
            self.send_header("Content-Length", str(end - start + 1))
            if code == 206:
                self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
            self.end_headers()
            with file_path.open("rb") as handle:
                handle.seek(start)
                remaining = end - start + 1
                while remaining:
                    chunk = handle.read(min(1024 * 1024, remaining))
                    if not chunk:
                        break
                    self.wfile.write(chunk)
                    remaining -= len(chunk)

        def do_POST(self):
            parsed = urlparse(self.path)
            length = int(self.headers.get("Content-Length", "0"))
            body = self.rfile.read(length)
            if parsed.path == "/status":
                message = body.decode(errors="replace")
                finished["message"] = message
                finished["event"].set()
                self.send_response(204)
                self.end_headers()
                return
            if parsed.path != "/tile":
                self.send_error(404)
                return
            query = parse_qs(parsed.query)
            try:
                z, x, y = (int(query[key][0]) for key in ("z", "x", "y"))
            except (KeyError, ValueError):
                self.send_error(400, "Invalid tile coordinates")
                return
            target = output / str(z) / str(x) / f"{y}.webp"
            target.parent.mkdir(parents=True, exist_ok=True)
            temporary = target.with_suffix(".webp.new")
            temporary.write_bytes(body)
            temporary.replace(target)
            self.send_response(204)
            self.end_headers()

    return Handler


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--bounds", required=True, help="west,south,east,north")
    parser.add_argument("--zooms", default="9-12")
    parser.add_argument("--lang", choices=("en", "pl"), default="en")
    parser.add_argument("--sample", action="store_true", help="render only the centre tile at each zoom")
    args = parser.parse_args()
    bounds = tuple(float(value) for value in args.bounds.split(","))
    if len(bounds) != 4:
        parser.error("--bounds needs four comma-separated numbers")
    first, last = (int(value) for value in args.zooms.split("-", 1))
    center = [(bounds[1] + bounds[3]) / 2, (bounds[0] + bounds[2]) / 2]
    groups = []
    for zoom in range(first, last + 1):
        xs, ys = tile_range(bounds, zoom)
        coords = [[x, y] for x in xs for y in ys]
        if args.sample:
            center_xs, center_ys = tile_range((center[1], center[0], center[1], center[0]), zoom)
            coords = [[center_xs.start, center_ys.start]]
        groups.append({"z": zoom, "coords": coords})
    config = {"lang": args.lang, "center": center, "zooms": list(range(first, last + 1)),
              "tiles": groups, "parallel": 8,
              "paintRules": PAINT_RULES, "labelRules": LABEL_RULES}
    args.output.mkdir(parents=True, exist_ok=True)
    finished = {"event": threading.Event(), "message": "renderer stopped without a status"}
    page = render_page(config)
    server = RenderServer(("127.0.0.1", 0), make_handler(args.source.resolve(), args.output.resolve(), page, finished))
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    profile = Path(tempfile.mkdtemp(prefix="mamaloty-firefox-"))
    firefox = shutil.which("firefox")
    if not firefox:
        raise SystemExit("Firefox is required")
    env = os.environ.copy()
    env["MOZ_HEADLESS"] = "1"
    process = subprocess.Popen([firefox, "--no-remote", "--profile", str(profile),
                                f"http://127.0.0.1:{server.server_port}/render"], env=env)
    try:
        if not finished["event"].wait(timeout=max(120, sum(len(g["coords"]) for g in groups) * 10)):
            raise SystemExit("Renderer timed out")
        if finished["message"] != "done":
            raise SystemExit(finished["message"])
    finally:
        process.terminate()
        try:
            process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            process.kill()
        server.shutdown()
        shutil.rmtree(profile, ignore_errors=True)
    print(f"Rendered {sum(len(g['coords']) for g in groups)} tiles to {args.output}")


if __name__ == "__main__":
    main()
