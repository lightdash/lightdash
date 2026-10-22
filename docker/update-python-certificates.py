"""Update installed Python CA bundles after resolving dbt adapter dependencies."""

import importlib.metadata
import subprocess
import sys
from pathlib import Path

from pip._vendor.packaging.version import Version

# Bootstrap through the OS bundle and verify the wheel before using its TLS code.
if Version(importlib.metadata.version("pip")) < Version("26.2.2"):
    subprocess.run(
        [
            sys.executable,
            "-m",
            "pip",
            "install",
            "--no-deps",
            "--cert",
            "/etc/ssl/certs/ca-certificates.crt",
            (
                "pip @ https://files.pythonhosted.org/packages/3f/06/"
                "3e4420302363fbb71be3c7f35ce042f54bfca330e3e66b3a2e3c4cca579f/"
                "pip-26.2.2-py3-none-any.whl"
                "#sha256=fd7f4dfa8190e014013b9f08f3e973f4e4c26ffd179a204895533a7254813a70"
            ),
        ],
        check=True,
    )

for python in [
    Path(sys.executable),
    *sorted(Path("/usr/local").glob("dbt*/bin/python")),
]:
    # dbt-snowflake 1.9-1.11 cap certifi below the patched release.
    subprocess.run(
        [
            sys.executable,
            "-m",
            "pip",
            "--python",
            str(python),
            "install",
            "--upgrade",
            "--no-deps",
            "--only-binary=:all:",
            "pip>=26.2.2",
            "certifi>=2026.10.19",
        ],
        check=True,
    )
    subprocess.run(
        [
            str(python),
            "-c",
            """
import importlib.metadata
import sysconfig
from pathlib import Path

for package, relative in {
    'grpcio': 'grpc/_cython/_credentials/roots.pem',
    'botocore': 'botocore/cacert.pem',
}.items():
    try:
        importlib.metadata.version(package)
    except importlib.metadata.PackageNotFoundError:
        continue
    path = Path(sysconfig.get_path('purelib')) / relative
    path.unlink()
    path.symlink_to('/etc/ssl/certs/ca-certificates.crt')
""",
        ],
        check=True,
    )
