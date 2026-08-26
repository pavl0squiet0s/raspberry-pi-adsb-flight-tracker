#!/usr/bin/python3
import json
import os
import subprocess
import tempfile
import unittest
from pathlib import Path


class BrightnessApiTests(unittest.TestCase):
    def call(self, root, state, method="GET", body=""):
        env = os.environ | {
            "REMOTE_ADDR": "127.0.0.1", "REQUEST_METHOD": method,
            "CONTENT_LENGTH": str(len(body)), "BACKLIGHT_GLOB": str(root / "*"),
            "BRIGHTNESS_STATE": str(state),
        }
        output = subprocess.check_output(["python3", "cgi-bin/brightness.py"], input=body, text=True, env=env)
        return output, json.loads(output.split("\n\n", 1)[1])

    def test_read_and_write(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / "backlight"
            device = root / "display"
            device.mkdir(parents=True)
            (device / "max_brightness").write_text("31")
            (device / "brightness").write_text("31")
            (device / "actual_brightness").write_text("31")
            state = Path(directory) / "brightness-state"
            _, current = self.call(root, state)
            self.assertEqual(current["percent"], 100)
            _, changed = self.call(root, state, "POST", "percent=70")
            self.assertEqual((device / "brightness").read_text(), "22")
            self.assertEqual(state.read_text(), "70")
            self.assertEqual(changed["percent"], 70)

    def test_rejects_unsafe_value(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / "backlight"
            device = root / "display"
            device.mkdir(parents=True)
            for name, value in (("max_brightness", "31"), ("brightness", "31"), ("actual_brightness", "31")):
                (device / name).write_text(value)
            output, _ = self.call(root, Path(directory) / "state", "POST", "percent=0")
            self.assertIn("400 Bad Request", output)


if __name__ == "__main__":
    unittest.main()
