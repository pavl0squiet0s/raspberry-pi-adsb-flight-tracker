#!/usr/bin/python3
import json, os, subprocess, tempfile, unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
class MlatApiTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(); base=Path(self.temp.name)
        self.config=base/"mlat.json"; self.status=base/"status.json"; self.receiver=base/"receiver.conf"
        self.receiver.write_text("RECEIVER_LAT=53.4\nRECEIVER_LON=-1.4\n")
    def tearDown(self): self.temp.cleanup()
    def call(self,action="status",body=None):
        env={**os.environ,"REMOTE_ADDR":"127.0.0.1","QUERY_STRING":f"action={action}","REQUEST_METHOD":"POST" if body is not None else "GET","MAMALOTY_MLAT_CONFIG":str(self.config),"MAMALOTY_MLAT_STATUS":str(self.status),"MAMALOTY_RECEIVER_CONFIG":str(self.receiver)}
        raw=json.dumps(body).encode() if body is not None else b""; env["CONTENT_LENGTH"]=str(len(raw))
        output=subprocess.check_output([str(ROOT/"cgi-bin/mlat.py")],input=raw,env=env).decode(); return json.loads(output.split("\n\n",1)[1])
    def test_disabled_by_default(self): self.assertEqual(self.call()["state"],"disabled")
    def test_valid_setup_is_atomic_and_reported(self):
        self.config.write_text('{"enabled":false,"terrain_m":125.0}')
        self.call("configure",{"enabled":True,"antenna_height_m":7.5})
        saved=json.loads(self.config.read_text()); self.assertEqual(saved["absolute_elevation_m"],132.5); self.assertEqual(saved["ellipsoid_altitude_m"],190.0)
        self.status.write_text('{"state":"waiting_wifi"}')
        result=self.call(); self.assertEqual(result["state"],"waiting_wifi"); self.assertNotIn("uuid",result["config"])
    def test_incomplete_consent_rejected(self):
        result=self.call("configure",{"enabled":True,"antenna_height_m":None}); self.assertIn("error",result); self.assertFalse(self.config.exists())
    def test_manual_terrain_fallback(self):
        self.call("configure",{"enabled":True,"antenna_height_m":8.2,"terrain_m":142})
        saved=json.loads(self.config.read_text()); self.assertEqual(saved["absolute_elevation_m"],150.2); self.assertEqual(saved["ellipsoid_altitude_m"],190.0)
    def test_location_is_loaded_and_only_saved_on_submit(self):
        self.config.write_text('{"enabled":true,"antenna_height_m":3,"ellipsoid_altitude_m":190}')
        before=self.call(); self.assertEqual(before["config"]["receiver_lat"],53.4); self.assertEqual(before["config"]["ellipsoid_altitude_m"],190)
        self.call("location",{"lat":51.1079,"lon":17.0385,"ellipsoid_altitude_m":168.4})
        saved=json.loads(self.config.read_text()); self.assertEqual(saved["receiver_lat"],51.1079); self.assertEqual(saved["receiver_lon"],17.0385); self.assertEqual(saved["ellipsoid_altitude_m"],168.4); self.assertTrue(saved["enabled"])
if __name__=="__main__": unittest.main()
