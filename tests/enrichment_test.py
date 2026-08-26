#!/usr/bin/python3
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

SPEC = importlib.util.spec_from_file_location("enrichment_worker", "scripts/enrichment-worker.py")
WORKER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(WORKER)


class EnrichmentTests(unittest.TestCase):
    def test_combined_response(self):
        aircraft, route = WORKER.parse_response({"response": {
            "aircraft": {"manufacturer": "Boeing", "type": "737-800", "registered_owner": "Example"},
            "flightroute": {
                "origin": {"iata_code": "MAN", "icao_code": "EGCC", "municipality": "Manchester", "name": "Manchester Airport", "country_iso_name": "GB"},
                "destination": {"iata_code": "WAW", "icao_code": "EPWA", "municipality": "Warsaw", "name": "Chopin Airport", "country_iso_name": "PL"},
            },
        }})
        self.assertEqual(aircraft["manufacturer"], "Boeing")
        self.assertEqual(route["origin"]["country"], "GB")
        self.assertEqual(route["destination"]["iata"], "WAW")

    def test_only_recent_positioned_aircraft_are_queued(self):
        with tempfile.TemporaryDirectory() as directory:
            feed = Path(directory) / "aircraft.json"
            feed.write_text(json.dumps({"aircraft": [
                {"hex": "abc123", "flight": "BAW123", "lat": 53.0, "lon": -1.0, "seen_pos": 2},
                {"hex": "def456", "flight": "OLD1", "lat": 53.0, "lon": -1.0, "seen_pos": 90},
                {"hex": "fedcba", "flight": "NOPOS"},
            ]}))
            self.assertEqual(WORKER.active_pairs(feed), [("ABC123", "BAW123")])

    def test_cache_round_trip(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "cache.json"
            data = WORKER.empty_cache()
            data["aircraft"]["ABC123"] = {"expires": 10, "data": {"model": "Test"}}
            WORKER.save_cache(data, path)
            self.assertEqual(WORKER.load_cache(path), data)
            self.assertEqual(path.stat().st_mode & 0o777, 0o640)


if __name__ == "__main__":
    unittest.main()
