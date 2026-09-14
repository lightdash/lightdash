import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("upload_assets", Path(__file__).with_name("upload-static-assets.py"))
uploader = importlib.util.module_from_spec(spec)
spec.loader.exec_module(uploader)


class UploadAssetsTests(unittest.TestCase):
    def test_filters_debug_files_and_refuses_empty_publication(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / "chunk-abc.js").write_text("export default 1")
            for suffix in (".map", ".gzip", ".gz", ".br"):
                (root / ("chunk-abc.js" + suffix)).write_text("excluded")
            files = uploader.prepare_assets(root)
            self.assertEqual([item["path"] for item in files], ["chunk-abc.js"])
            self.assertEqual(len(files[0]["sha256"]), 64)
            (root / "chunk-abc.js").unlink()
            with self.assertRaisesRegex(ValueError, "no JavaScript"):
                uploader.prepare_assets(root)

    def test_republishes_identical_bytes_and_marks_only_successful_uploads(self):
        commands = []
        manifests = []

        def execute(args):
            commands.append(args)
            if args[:3] == ["docker", "image", "inspect"]:
                return "sha256:exact-image"
            if args[:2] == ["docker", "create"]:
                self.assertEqual(args[-1], "sha256:exact-image")
                return "container"
            if args[:2] == ["docker", "cp"]:
                assets = Path(args[-1])
                assets.mkdir()
                (assets / "chunk-abc.js").write_text("export default 1")
            if args[0] == "gsutil" and args[-1].endswith(".json"):
                manifests.append(json.loads(Path(args[-2]).read_text()))
            return ""

        with patch.object(uploader, "run", side_effect=execute):
            for _ in range(2):
                uploader.upload("registry.example/app:1", ["bucket-us", "bucket-eu"])
        copies = [c for c in commands if c[0] == "gsutil" and "-r" in c]
        self.assertEqual(len(copies), 4)
        self.assertTrue(all("-n" not in c for c in copies))
        self.assertEqual(len(manifests), 4)
        self.assertTrue(all(m["imageId"] == "sha256:exact-image" for m in manifests))

        commands.clear()
        def fail_upload(args):
            result = execute(args)
            if args[0] == "gsutil" and "-r" in args:
                raise subprocess.CalledProcessError(1, args)
            return result
        with patch.object(uploader, "run", side_effect=fail_upload):
            with self.assertRaises(subprocess.CalledProcessError):
                uploader.upload("registry.example/app:1", ["bucket-us"])
        self.assertFalse(any(c[-1].endswith(".json") for c in commands))

    def test_failed_extraction_removes_container_without_upload(self):
        commands = []
        def execute(args):
            commands.append(args)
            if args[:2] == ["docker", "create"]:
                return "container"
            if args[:2] == ["docker", "cp"]:
                raise subprocess.CalledProcessError(1, args)
            return "image"
        with patch.object(uploader, "run", side_effect=execute):
            with self.assertRaises(subprocess.CalledProcessError):
                uploader.upload("registry.example/app:1", ["bucket-us"])
        self.assertIn(["docker", "rm", "container"], commands)
        self.assertFalse(any(c[0] == "gsutil" for c in commands))


if __name__ == "__main__":
    unittest.main()
