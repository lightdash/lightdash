#!/usr/bin/env python3
"""Apply and verify the Docker images' Python certificate security overrides."""

import argparse
import hashlib
import importlib.metadata
import json
import os
import re
import ssl
import subprocess
import sys
import sysconfig
import tarfile
import zipfile
from pathlib import Path

REQUIREMENTS = "/usr/local/share/lightdash/python-security-requirements.txt"
SYSTEM_BUNDLE = Path("/etc/ssl/certs/ca-certificates.crt")
PRIVATE_BUNDLES = {
    "grpcio": "grpc/_cython/_credentials/roots.pem",
    "botocore": "botocore/cacert.pem",
}
# Direct issuers and cross-signers of the eight compromised intermediate keys.
# https://emudhra.we-have-a-problem.com/roots.json
BLOCKED_ROOTS = {
    "7DD78D5F4F13459A83DFF9ABBBA62EDBAF6F2D102BF257FD712F4D9F2746ED8D",
    "F2EDAAFF3D9B701FB4D14C9F285F8C0BAD90FC3BCC1FA07D47F4718EDABA34A5",
    "D7A7A0FB5D7E2731D771E9484EBCDEF71D5F0C3E0A2948782BC83EE0EA699EF4",
    "86A1ECBA089C4A8D3BBE2734C612BA341D813E043CF9E8A862CD5C57A36BBE6B",
}


def interpreters():
    return [
        Path("/usr/local/bin/python3"),
        *sorted(Path("/usr/local").glob("dbt*/bin/python")),
    ]


def private_bundles():
    site_packages = Path(sysconfig.get_path("purelib"))
    for package, relative_path in PRIVATE_BUNDLES.items():
        try:
            importlib.metadata.version(package)
        except importlib.metadata.PackageNotFoundError:
            continue
        path = site_packages / relative_path
        if not path.is_file():
            raise RuntimeError(f"Missing {package} CA bundle: {path}")
        yield path


def install():
    for python in interpreters():
        subprocess.run([str(python), __file__, "bootstrap-pip"], check=True)
        # dbt-snowflake 1.9-1.11 still cap certifi. Apply the floor after resolving
        # adapters; remove this override when no installed adapter caps certifi.
        subprocess.run(
            [
                str(python),
                "-m",
                "pip",
                "install",
                "--no-deps",
                "--upgrade",
                "--only-binary=:all:",
                "certifi>=2026.10.19",
            ],
            check=True,
        )
        subprocess.run([str(python), __file__, "link-bundles"], check=True)


def bootstrap_pip():
    from pip._vendor.packaging.version import Version

    if Version(importlib.metadata.version("pip")) >= Version("26.2.2"):
        return
    # The old pip bundle is affected. Use the OS bundle and verify the wheel hash
    # before allowing this interpreter to download any adapter dependencies.
    subprocess.run(
        [
            sys.executable,
            "-m",
            "pip",
            "install",
            "--cert",
            str(SYSTEM_BUNDLE),
            "--no-deps",
            "--require-hashes",
            "-r",
            REQUIREMENTS,
        ],
        check=True,
    )


def link_bundles():
    for path in private_bundles():
        path.unlink()
        path.symlink_to(SYSTEM_BUNDLE)


def fingerprints(data, *, ignore_invalid=False):
    certificates = re.findall(
        rb"-----BEGIN CERTIFICATE-----[A-Za-z0-9+/=\s]+-----END CERTIFICATE-----",
        data,
        re.DOTALL,
    )
    roots = set()
    for certificate in certificates:
        try:
            der = ssl.PEM_cert_to_DER_cert(certificate.decode("ascii"))
        except ValueError:
            if ignore_invalid:
                continue
            raise
        roots.add(hashlib.sha256(der).hexdigest().upper())
    return roots


def check_bundle(path):
    roots = fingerprints(path.read_bytes())
    if not roots:
        raise RuntimeError(f"Empty CA bundle: {path}")
    if roots & BLOCKED_ROOTS:
        raise RuntimeError(f"Compromised certificate chain is still trusted by {path}")


def check_certificate_files():
    affected = []
    seed = (
        Path(sysconfig.get_path("stdlib"))
        / "ensurepip/_bundled/pip-24.0-py3-none-any.whl"
    )
    for directory in ["/etc/ssl", "/usr/share/ca-certificates", "/usr/local"]:
        for parent, _, names in os.walk(directory):
            for name in names:
                path = Path(parent) / name
                entries = []
                if path.suffix in {".pem", ".crt", ".cer"}:
                    entries = [(str(path), path.read_bytes())]
                elif path.suffix in {".whl", ".zip"}:
                    with zipfile.ZipFile(path) as archive:
                        entries = [
                            (f"{path}!{entry}", archive.read(entry))
                            for entry in archive.namelist()
                            if Path(entry).suffix in {".pem", ".crt", ".cer"}
                        ]
                elif name.endswith((".tar", ".tar.gz", ".tgz", ".tar.bz2", ".tar.xz")):
                    with tarfile.open(path) as archive:
                        for entry in archive.getmembers():
                            if entry.isfile() and Path(entry.name).suffix in {
                                ".pem",
                                ".crt",
                                ".cer",
                            }:
                                entries.append(
                                    (
                                        f"{path}!{entry.name}",
                                        archive.extractfile(entry).read(),
                                    )
                                )
                for label, data in entries:
                    # Some dependencies ship deliberately malformed certificate
                    # fixtures. They cannot be trusted issuers; inspect every
                    # parseable certificate, including siblings in the same file.
                    if fingerprints(data, ignore_invalid=True) & BLOCKED_ROOTS:
                        # CPython's dormant venv seed is not used by the application.
                        # Every managed venv upgrades it before installing adapters.
                        if path == seed:
                            print(
                                f"Dormant ensurepip seed exception: {label}", flush=True
                            )
                        else:
                            affected.append(label)
    if affected:
        raise RuntimeError(
            f"Compromised roots in {len(affected)} certificate files:\n"
            + "\n".join(affected)
        )


def check_node():
    from pip._vendor.packaging.version import Version

    version, roots = json.loads(
        subprocess.check_output(
            [
                "node",
                "-e",
                "console.log(JSON.stringify([process.versions.node, require('tls').rootCertificates.join('\\n')]))",
            ],
            text=True,
        )
    )
    if Version(version) < Version("24.22.1"):
        raise RuntimeError(f"Node {version} is below 24.22.1")
    if fingerprints(roots.encode()) & BLOCKED_ROOTS:
        raise RuntimeError("Node still trusts an affected certificate root")


def check_dependencies():
    result = subprocess.run(
        [sys.executable, "-m", "pip", "--no-cache-dir", "check"],
        text=True,
        capture_output=True,
        check=False,
    )
    if (
        result.returncode == 0
        and result.stdout.strip() == "No broken requirements found."
        and not result.stderr.strip()
    ):
        return
    # This is the only permitted dependency conflict. Keep upstream metadata
    # intact and fail on any additional conflict rather than ignoring pip check.
    try:
        snowflake = importlib.metadata.distribution("dbt-snowflake")
    except importlib.metadata.PackageNotFoundError:
        raise RuntimeError(
            f"Unexpected dependency conflict:\n{result.stdout}{result.stderr}"
        )
    certifi_version = importlib.metadata.version("certifi")
    expected = (
        f"dbt-snowflake {snowflake.version} has requirement certifi<2025.4.26, "
        f"but you have certifi {certifi_version}."
    )
    if (
        result.returncode == 1
        and ".".join(snowflake.version.split(".")[:2])
        in {"1.9", "1.10", "1.11", "1.12"}
        and "certifi<2025.4.26" in (snowflake.requires or [])
        and result.stdout.strip() == expected
        and not result.stderr.strip()
    ):
        print(f"Security override: {expected}", flush=True)
        return
    raise RuntimeError(
        f"Unexpected dependency conflict:\n{result.stdout}{result.stderr}"
    )


def check_environment():
    import certifi
    import pip._vendor.certifi
    from pip._vendor.packaging.version import Version

    versions = {
        "pip": (importlib.metadata.version("pip"), "26.2.2"),
        "certifi": (importlib.metadata.version("certifi"), "2026.10.19"),
        "pip's certifi": (pip._vendor.certifi.__version__, "2026.10.19"),
    }
    for package, (version, minimum) in versions.items():
        if Version(version) < Version(minimum):
            raise RuntimeError(f"{sys.prefix}: {package} {version} is below {minimum}")
    check_dependencies()
    for path in private_bundles():
        if (
            not path.is_symlink()
            or path.readlink() != SYSTEM_BUNDLE
            or not path.is_file()
        ):
            raise RuntimeError(
                f"CA bundle must resolve to the absolute OS bundle: {path}"
            )
    for path in [
        SYSTEM_BUNDLE,
        Path(certifi.where()),
        Path(pip._vendor.certifi.where()),
        *private_bundles(),
    ]:
        check_bundle(path)
    print(f"Verified Python certificates: {sys.prefix}", flush=True)


def check():
    ca_version = subprocess.check_output(
        ["dpkg-query", "-W", "-f=${Version}", "ca-certificates"], text=True
    )
    subprocess.run(
        ["dpkg", "--compare-versions", ca_version, "ge", "20250419+deb13u1"], check=True
    )
    check_node()
    check_certificate_files()
    for python in interpreters():
        subprocess.run([str(python), __file__, "check-env"], check=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "action",
        choices=["install", "check", "check-env", "link-bundles", "bootstrap-pip"],
    )
    action = parser.parse_args().action
    {
        "install": install,
        "check": check,
        "check-env": check_environment,
        "link-bundles": link_bundles,
        "bootstrap-pip": bootstrap_pip,
    }[action]()
