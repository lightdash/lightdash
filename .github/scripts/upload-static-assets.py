#!/usr/bin/env python3
"""Retain the exact assets from an image, without executing that image.

Used by release CI and cloud deployment CI. Re-uploading unchanged files is
intentional: lifecycle age must start again when a pinned version is retired.
A successful exit means every supplied bucket accepted the complete asset set.
"""

import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess
import tempfile

CACHE_CONTROL = "Cache-Control:public, max-age=31536000, immutable"


def run(args):
    return subprocess.check_output(args, text=True).strip()


def prepare_assets(directory):
    files = []
    for path in sorted(directory.rglob("*")):
        if path.is_symlink():
            raise ValueError(f"Asset symlink is not allowed: {path.name}")
        if not path.is_file():
            continue
        if path.suffix in {".map", ".gzip", ".gz", ".br"}:
            path.unlink()
            continue
        relative = path.relative_to(directory).as_posix()
        if len(relative) > 512 or any(
            not re.fullmatch(r"[\w.-]+", part, flags=re.ASCII) or part in {".", ".."}
            for part in relative.split("/")
        ):
            raise ValueError(f"Unsupported asset path: {relative}")
        files.append({"path": relative, "sha256": hashlib.sha256(path.read_bytes()).hexdigest()})
    if not files or not any(item["path"].endswith(".js") for item in files):
        raise ValueError("Image contains no JavaScript assets; refusing an empty publication")
    return files


def upload(image, buckets):
    if not re.fullmatch(r"[a-zA-Z0-9][a-zA-Z0-9._/:@-]+", image):
        raise ValueError("Invalid image reference")
    if not buckets or any(not re.fullmatch(r"[a-z0-9][a-z0-9._-]{1,220}[a-z0-9]", b) for b in buckets):
        raise ValueError("Invalid bucket name")
    with tempfile.TemporaryDirectory(prefix="lightdash-static-assets-") as temp:
        root = Path(temp)
        run(["docker", "pull", "--platform", "linux/amd64", image])
        image_id = run(["docker", "image", "inspect", "--format", "{{.Id}}", image])
        container = run(["docker", "create", "--platform", "linux/amd64", image_id])
        try:
            run(["docker", "cp", f"{container}:/usr/app/packages/frontend/build/assets", str(root / "assets")])
        finally:
            run(["docker", "rm", container])
        files = prepare_assets(root / "assets")
        manifest = root / "manifest.json"
        manifest.write_text(json.dumps({"image": image, "imageId": image_id, "assets": files}, sort_keys=True))
        publication = hashlib.sha256(image.encode()).hexdigest()
        for bucket in dict.fromkeys(buckets):
            # gsutil verifies upload checksums. Do not use rsync or no-clobber:
            # even unchanged assets must be rewritten to renew lifecycle age.
            run(["gsutil", "-m", "-h", CACHE_CONTROL, "cp", "-r", str(root / "assets"), f"gs://{bucket}/"])
            run(["gsutil", "-h", "Cache-Control:no-store", "cp", str(manifest), f"gs://{bucket}/releases/{publication}.json"])
            print(f"Published {len(files)} assets from {image} to gs://{bucket}/assets/", flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--image", required=True)
    parser.add_argument("--bucket", action="append", required=True)
    args = parser.parse_args()
    upload(args.image, args.bucket)


if __name__ == "__main__":
    main()
