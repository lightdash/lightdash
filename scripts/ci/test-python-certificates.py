#!/usr/bin/env python3
"""Verify the image's Python trust bundles against GHSA-6q48-6c7w-9gw2."""

import argparse
import datetime
import hashlib
import json
import os
import runpy
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path

SECURITY_SCRIPT = "/usr/local/share/lightdash/python-security.py"
# Fixed before fixture expiry: a rejected chain must fail because of its issuer,
# never merely because the test's leaf certificate has expired.
VERIFY_TIME = str(
    int(datetime.datetime(2026, 10, 21, 19, tzinfo=datetime.UTC).timestamp())
)


def run(args, **kwargs):
    return subprocess.run(
        args,
        text=True,
        capture_output=True,
        timeout=kwargs.pop("timeout", 120),
        check=False,
        **kwargs,
    )


def require(result):
    if result.returncode:
        raise RuntimeError(f"{result.args}\n{result.stdout}{result.stderr}")
    return result.stdout


def verify_chain(bundle, chain):
    return run(
        [
            "openssl",
            "verify",
            "-attime",
            VERIFY_TIME,
            "-purpose",
            "sslserver",
            "-verify_hostname",
            chain.name[:-4],
            "-no-CApath",
            "-no-CAstore",
            "-CAfile",
            str(bundle),
            "-untrusted",
            str(chain),
            str(chain),
        ]
    )


def bundles(python):
    probe = """
import certifi, json, pathlib, pip._vendor.certifi, sysconfig
site = pathlib.Path(sysconfig.get_path('purelib'))
paths = [certifi.where(), pip._vendor.certifi.where()]
for relative in ['grpc/_cython/_credentials/roots.pem', 'botocore/cacert.pem']:
    path = site / relative
    if path.is_file():
        paths.append(str(path))
print(json.dumps(paths))
"""
    return json.loads(require(run([str(python), "-I", "-c", probe])))


def check_dbt(venvs, temporary):
    project = temporary / "project"
    (project / "models").mkdir(parents=True)
    (project / "models/security_probe.sql").write_text("select 1 as id\n")
    project_config = {
        "name": "security_smoke",
        "version": "1.0.0",
        "config-version": 2,
        "profile": "security_smoke",
        "model-paths": ["models"],
    }
    outputs = {
        "postgres": {
            "type": "postgres",
            "host": "security.invalid",
            "port": 5432,
            "user": "security_probe",
            "password": "unused",
            "dbname": "test",
            "schema": "public",
            "threads": 1,
        },
        "snowflake": {
            "type": "snowflake",
            "account": "security-invalid",
            "user": "security_probe",
            "password": "unused",
            "database": "test",
            "warehouse": "test",
            "schema": "public",
            "threads": 1,
        },
        "bigquery": {
            "type": "bigquery",
            "method": "oauth",
            "project": "security-invalid",
            "dataset": "public",
            "threads": 1,
        },
    }
    (project / "profiles.yml").write_text(
        json.dumps(
            {
                "security_smoke": {"target": "postgres", "outputs": outputs},
            }
        )
    )
    for python in venvs:
        dbt = str(python.parent / "dbt")
        require(run([dbt, "--version"]))
        require(
            run(
                [
                    str(python),
                    "-c",
                    """
import importlib, importlib.metadata, pyarrow
for adapter in ['postgres', 'redshift', 'snowflake', 'bigquery', 'databricks',
                'trino', 'clickhouse', 'athena', 'duckdb']:
    try:
        importlib.metadata.version('dbt-' + adapter)
    except importlib.metadata.PackageNotFoundError:
        continue
    importlib.import_module('dbt.adapters.' + adapter)
""",
                ]
            )
        )
        for target in outputs:
            target_dir = temporary / python.parent.parent.name / target
            # Keep artifact locations explicit across the supported dbt releases.
            (project / "dbt_project.yml").write_text(
                json.dumps(
                    {
                        **project_config,
                        "target-path": str(target_dir),
                    }
                )
            )
            env = {
                **os.environ,
                "DBT_SEND_ANONYMOUS_USAGE_STATS": "false",
                "DBT_PARTIAL_PARSE": "false",
                "DBT_TARGET_PATH": str(target_dir),
                "DBT_LOG_PATH": str(target_dir / "logs"),
            }
            common = [
                "--project-dir",
                str(project),
                "--profiles-dir",
                str(project),
                "--target",
                target,
            ]
            require(run([dbt, "deps", *common], env=env, cwd=project))
            # Before dbt 1.5, parse writes manifest.json only when requested.
            manifest_args = (
                ["--write-manifest"] if python.parent.parent.name == "dbt1.4" else []
            )
            require(run([dbt, "parse", *manifest_args, *common], env=env, cwd=project))
            manifest = json.loads((target_dir / "manifest.json").read_text())
            if "model.security_smoke.security_probe" not in manifest["nodes"]:
                raise RuntimeError(
                    f"dbt parse did not produce the model for {python}: {target}"
                )
            output = require(
                run(
                    [
                        dbt,
                        "ls",
                        "--output",
                        "json",
                        "--resource-type",
                        "model",
                        *common,
                    ],
                    env=env,
                    cwd=project,
                )
            )
            rows = [
                json.loads(line) for line in output.splitlines() if line.startswith("{")
            ]
            if not any(row.get("name") == "security_probe" for row in rows):
                raise RuntimeError(
                    f"dbt ls did not return the model for {python}: {target}"
                )
        print(
            f"dbt version/imports/deps/parse/ls passed for {python.parent.parent.name} with three adapter profiles.",
            flush=True,
        )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--fixtures", type=Path, default=Path(__file__).parent / "fixtures/emudhra"
    )
    parser.add_argument("--expected-venvs", type=int, default=9)
    parser.add_argument("--dbt-smoke", action="store_true")
    args = parser.parse_args()
    venvs = sorted(
        Path("/usr/local").glob("dbt*/bin/python"),
        key=lambda path: tuple(
            map(int, path.parent.parent.name.removeprefix("dbt").split("."))
        ),
    )
    if len(venvs) != args.expected_venvs:
        raise RuntimeError(
            f"Expected {args.expected_venvs} dbt environments, found {len(venvs)}"
        )
    print(require(run([sys.executable, SECURITY_SCRIPT, "check"], timeout=600)), end="")

    fixture_info = json.loads((args.fixtures / "source.json").read_text())
    archive = args.fixtures / "chains.zip"
    if hashlib.sha256(archive.read_bytes()).hexdigest() != fixture_info["sha256"]:
        raise RuntimeError("Certificate fixture archive checksum mismatch")

    with tempfile.TemporaryDirectory() as temporary:
        temporary = Path(temporary)
        with zipfile.ZipFile(archive) as zipped:
            for name in zipped.namelist():
                parts = Path(name).parts
                if len(parts) == 2 and parts[0] == "chains" and name.endswith(".pem"):
                    (temporary / parts[1]).write_bytes(zipped.read(name))
        chains = sorted(temporary.glob("*.pem"))
        if len(chains) != 12:
            raise RuntimeError(f"Expected 12 certificate chains, found {len(chains)}")

        control = args.fixtures / "public-control-roots.pem"
        for chain in chains:
            require(verify_chain(control, chain))
        print(
            "All 12 positive controls validate through the public cross-signing roots."
        )

        paths = {"/etc/ssl/certs/ca-certificates.crt"}
        for python in [Path(sys.executable), *venvs]:
            paths.update(bundles(python))
        checked_hashes = set()
        for name in sorted(paths):
            bundle = Path(name)
            digest = hashlib.sha256(bundle.read_bytes()).hexdigest()
            if digest in checked_hashes:
                continue
            for chain in chains:
                result = verify_chain(bundle, chain)
                if result.returncode == 0 or "error 20 at " not in result.stderr:
                    raise RuntimeError(
                        f"Expected issuer rejection from {bundle}:\n{result.stdout}{result.stderr}"
                    )
            checked_hashes.add(digest)
        print(
            f"All 12 compromised chains rejected across {len(paths)} installed CA files."
        )

        # The fingerprint gate must also fail if an affected root is reintroduced.
        check_bundle = runpy.run_path(SECURITY_SCRIPT)["check_bundle"]
        try:
            check_bundle(control)
        except RuntimeError:
            pass
        else:
            raise RuntimeError(
                "Affected-root fingerprint gate accepted the compromised roots"
            )

        # An unfinished certificate before a valid root must not hide that root.
        first_root = control.read_text().split("-----END CERTIFICATE-----", 1)[0]
        malformed = temporary / "malformed-prefix.pem"
        malformed.write_text(
            "-----BEGIN CERTIFICATE-----\n" + first_root + "-----END CERTIFICATE-----\n"
        )
        try:
            check_bundle(malformed)
        except RuntimeError as error:
            if "Compromised certificate chain" not in str(error):
                raise
        else:
            raise RuntimeError("An unfinished certificate hid a compromised root")

        # Prove the Snowflake exception cannot hide unrelated broken requirements.
        dist = temporary / "lightdash_security_probe-0.dist-info"
        dist.mkdir()
        (dist / "METADATA").write_text(
            "Metadata-Version: 2.1\nName: lightdash-security-probe\nVersion: 0\n"
            "Requires-Dist: lightdash-missing-security-probe==999999.0\n"
        )
        env = {**os.environ, "PYTHONPATH": str(temporary)}
        result = run([str(venvs[-1]), SECURITY_SCRIPT, "check-env"], env=env)
        if (
            result.returncode == 0
            or "lightdash-missing-security-probe" not in result.stderr
        ):
            raise RuntimeError(
                f"Unrelated dependency conflict was not detected:\n{result.stdout}{result.stderr}"
            )
        print("An unrelated dependency conflict correctly fails verification.")
        if args.dbt_smoke:
            check_dbt(venvs, temporary)


if __name__ == "__main__":
    main()
