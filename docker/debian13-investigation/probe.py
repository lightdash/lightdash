"""Generate isolated Docker build probes from the shipped dbt requirements.

Run from the repository root: python3 docker/debian13-investigation/probe.py generate
Generated files and results belong in .migration-evidence (not version control).
No database credentials are used. Build-time probes are not application E2E tests.
"""

import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time


def requirements(text):
    return {
        match[1]: re.findall(r'"([^"\n]+)"', match[2])
        for match in re.finditer(
            r"/usr/local/dbt(1\.\d+)/bin/pip install\s*\\(.*?)(?=&&|\n\n|\nFROM)",
            text,
            re.S,
        )
    }


def generate():
    ROOT = Path(__file__).resolve().parents[2]
    output = ROOT / ".migration-evidence"
    output.mkdir(exist_ok=True)
    production = (ROOT / "dockerfile").read_text()
    preview = (ROOT / "dockerfile-prs").read_text()
    matrix = requirements(production)
    matrix["preview"] = requirements(preview)["1.12"]
    assert len(matrix) == 10, matrix
    (output / "requirements.json").write_text(json.dumps(matrix, indent=2) + "\n")
    prefix = production.split("# Installing multiple versions of dbt")[0]
    for distro in ("bookworm", "trixie"):
        base = re.sub(r"node:24-(?:bookworm|trixie)-slim", f"node:24-{distro}-slim", prefix)
        if distro == "trixie":
            base = base.replace("    software-properties-common \\\n", "")
        for version, packages in matrix.items():
            recipe = base + "\nCOPY docker/debian13-investigation/probe.py /probe.py\n"
            recipe += "RUN mkdir /evidence && printf '%s' '" + json.dumps(packages) + "' > /requirements.json\n"
            recipe += "RUN python3 /probe.py run\nFROM scratch AS evidence\nCOPY --from=base /evidence /\n"
            (output / f"{distro}-{version}.Dockerfile").write_text(recipe)
            if distro == "trixie" and version in ("1.4", "1.8"):
                python_stage = (
                    "FROM python:3.11-slim-trixie@sha256:da047cb8f9d1d98e5c070f5300ba9f7274e33b8fc0e5be5ed88740aed1b95ba9 AS python311\n\n"
                )
                alternative = recipe.replace("FROM ghcr.io/pnpm/pnpm:", python_stage + "FROM ghcr.io/pnpm/pnpm:")
                alternative = alternative.replace(
                    "FROM node:24-trixie-slim AS pnpm-base",
                    "FROM node:24-trixie-slim AS pnpm-base\nCOPY --from=python311 /usr/local /usr/local\nRUN ldconfig",
                )
                (output / f"trixie-python311-{version}.Dockerfile").write_text(alternative)
            if version == "preview":
                sample = "COPY examples/full-jaffle-shop-demo/dbt/dbt_project.yml /jaffle/dbt_project.yml\n"
                for directory in ("models", "macros", "data"):
                    sample += f"COPY examples/full-jaffle-shop-demo/dbt/{directory}/ /jaffle/{directory}/\n"
                (output / f"{distro}-demo-preview.Dockerfile").write_text(
                    recipe.replace("RUN python3 /probe.py run", sample + "RUN python3 /probe.py run")
                )
        if distro == "trixie":
            for name in ("perl", "perl-optional", "perl-tamper", "perl-shadow"):
                setup = ""
                check = "sh /check-perl.sh > /perl-check.txt && cat /perl-check.txt"
                if name == "perl-optional":
                    setup = "RUN apt-get update && apt-get install -y --no-install-recommends libio-compress-perl\n"
                elif name == "perl-tamper":
                    check = (
                        "printf '\\n# checksum-test\\n' >> /usr/share/perl/5.40.1/File/GlobMapper.pm && "
                        "if sh /check-perl.sh > /perl-check.txt 2>&1; then exit 1; "
                        "else grep 'FAILED' /perl-check.txt; fi"
                    )
                elif name == "perl-shadow":
                    check = (
                        "mkdir -p /tmp/shadow/File && printf '1;\\n' > /tmp/shadow/File/GlobMapper.pm && "
                        "if PERL5LIB=/tmp/shadow sh /check-perl.sh > /perl-check.txt 2>&1; then exit 1; "
                        "else grep 'Unverified active module:' /perl-check.txt; fi"
                    )
                (output / f"{name}.Dockerfile").write_text(
                    base + setup + "COPY docker/debian13-investigation/check-perl.sh /check-perl.sh\n"
                    + f"RUN {check}\nFROM scratch\nCOPY --from=base /perl-check.txt /\n"
                )


def run():
    evidence = Path("/evidence")
    results = {}

    def command(name, args, timeout=240):
        start = time.monotonic()
        proc = subprocess.run(
            ["timeout", "--kill-after=10s", str(timeout), *args],
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
        )
        code, log = proc.returncode, proc.stdout
        if code == 124:
            log += "\nPROBE TIMEOUT\n"
        (evidence / f"{name}.txt").write_text(log)
        results[name] = {"exit": code, "seconds": round(time.monotonic() - start, 2)}
        print(f"{name}: {results[name]}\n{log[-2500:]}", flush=True)

    command("system", ["sh", "-c", "cat /etc/os-release; node --version; python3 --version; perl -v; openssl version; ldd --version; apt-cache policy perl perl-base perl-modules-5.40 libio-compress-perl"])
    command("dpkg", ["dpkg-query", "-W", "-f=${binary:Package}\t${Version}\t${Architecture}\n"])
    command("venv", ["python3", "-m", "venv", "/probe-venv"])
    packages = json.loads(Path("/requirements.json").read_text())
    command("install", ["/probe-venv/bin/pip", "install", "--no-cache-dir", *packages])
    command("freeze", ["/probe-venv/bin/pip", "freeze", "--all"])
    command("pip-check", ["/probe-venv/bin/pip", "check"])
    modules = ["dbt.version", "psycopg2", "cryptography", "numpy", "pyarrow"]
    modules += [
        "dbt.adapters." + re.split(r"[~=<>]", package)[0][4:]
        for package in packages
        if package.startswith("dbt-") and not package.startswith("dbt-core")
    ]
    for module in modules:
        command(
            "import-" + module,
            ["/probe-venv/bin/python", "-c", f"import importlib; importlib.import_module({module!r}); print('OK')"],
        )
    command("version", ["/probe-venv/bin/python", "-m", "dbt.cli.main", "--version"])
    # Older dbt releases have no dbt.cli.main; use the shipped executable too.
    if Path("/probe-venv/bin/dbt").exists():
        command("cli-version", ["/probe-venv/bin/dbt", "--version"])
    project = Path("/probe-project")
    (project / "models").mkdir(parents=True)
    (project / "dbt_project.yml").write_text("name: migration_probe\nversion: '1.0'\nconfig-version: 2\nprofile: migration_probe\n")
    (project / "profiles.yml").write_text("migration_probe:\n  target: probe\n  outputs:\n    probe:\n      type: postgres\n      host: 127.0.0.1\n      port: 1\n      user: probe\n      password: probe\n      dbname: probe\n      schema: public\n      threads: 1\n      connect_timeout: 2\n")
    (project / "models" / "base.sql").write_text("select 1 as id\n")
    (project / "models" / "dependent.sql").write_text("select id from {{ ref('base') }}\n")
    os.environ["DBT_SEND_ANONYMOUS_USAGE_STATS"] = "false"
    os.chdir(project)
    cli = (
        ["/probe-venv/bin/dbt"]
        if Path("/probe-venv/bin/dbt").exists()
        else ["/probe-venv/bin/python", "-m", "dbt.cli.main"]
    )
    command("parse", [*cli, "parse", "--profiles-dir", str(project)])
    command("compile", [*cli, "--no-populate-cache", "compile", "--no-introspect", "--profiles-dir", str(project)])
    if Path("/jaffle").exists():
        sample = Path("/jaffle")
        (sample / "profiles.yml").write_text(
            (project / "profiles.yml").read_text().replace("migration_probe:", "jaffle_shop:")
        )
        os.chdir(sample)
        command("jaffle-parse", [*cli, "parse", "--profiles-dir", str(sample)])
        command("jaffle-compile", [*cli, "--no-populate-cache", "compile", "--no-introspect", "--profiles-dir", str(sample)])
    (evidence / "results.json").write_text(json.dumps({"requirements": packages, "checks": results}, indent=2) + "\n")
    # Do not retain ten large environments in the BuildKit cache.
    subprocess.run(["rm", "-rf", "/probe-venv", "/probe-project"], check=True)


if __name__ == "__main__":
    if sys.argv[1:] == ["generate"]:
        generate()
    elif sys.argv[1:] == ["run"]:
        run()
    else:
        raise SystemExit("Usage: probe.py generate|run")
