"""Run the product's own explore compiler and cross-source resolver from a checkout.

The checkout defaults to the repository that contains this fixture. Point
``LAST_GOOD_PRODUCT_ROOT`` at another checkout (for example a detached
worktree of the product tip) to measure against that revision. The checkout
needs an installed ``node_modules`` with ``tsx``; nothing is built.
"""

import json
import os
import subprocess
from pathlib import Path

FIXTURE = Path(__file__).resolve().parent
SIM = FIXTURE.parent
DEFAULT_ROOT = SIM.parents[1]
SCRIPT = FIXTURE / "product_path.ts"
DBT_COMMAND_NAME = "dbt1.12"
HARNESS_ENV = {
    "LIGHTDASH_SECRET": "last-good-harness",
    "SITE_URL": "http://localhost:3000",
    "NODE_ENV": "development",
    "LIGHTDASH_LOG_LEVEL": "error",
    "S3_ENDPOINT": "http://127.0.0.1:1",
    "S3_BUCKET": "last-good-harness",
    "S3_REGION": "local",
    "S3_ACCESS_KEY": "harness",
    "S3_SECRET_KEY": "harness",
}


class ProductPathError(RuntimeError):
    """The product checkout could not run the requested step."""


def product_root():
    return Path(os.environ.get("LAST_GOOD_PRODUCT_ROOT") or DEFAULT_ROOT).resolve()


def product_sha(root=None):
    root = root or product_root()
    completed = subprocess.run(
        ["git", "-C", str(root), "rev-parse", "HEAD"],
        text=True,
        capture_output=True,
        check=False,
    )
    return completed.stdout.strip() if completed.returncode == 0 else None


def tsx_executable(root=None):
    root = root or product_root()
    tsx = root / "node_modules" / ".bin" / "tsx"
    if not tsx.exists():
        raise ProductPathError(f"tsx is not installed in the product checkout: {tsx}")
    return tsx


def dbt_bin_dir(work, dbt):
    """Expose the harness dbt as the ``dbt1.12`` command the product client runs."""
    bin_dir = Path(work) / "product-bin"
    bin_dir.mkdir(parents=True, exist_ok=True)
    for name in (DBT_COMMAND_NAME, "dbt"):
        link = bin_dir / name
        if link.is_symlink() or link.exists():
            link.unlink()
        link.symlink_to(Path(dbt).resolve())
    return bin_dir


def run(command, payload, work, *, timeout=900):
    root = product_root()
    work = Path(work)
    work.mkdir(parents=True, exist_ok=True)
    input_path = work / f"{command}.input.json"
    output_path = work / f"{command}.output.json"
    if output_path.exists():
        output_path.unlink()
    input_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    env = os.environ.copy()
    for key, value in HARNESS_ENV.items():
        env.setdefault(key, value)
    env["LAST_GOOD_PRODUCT_ROOT"] = str(root)
    completed = subprocess.run(
        [
            str(tsx_executable(root)),
            str(SCRIPT),
            command,
            str(input_path),
            str(output_path),
        ],
        cwd=root,
        env=env,
        text=True,
        capture_output=True,
        timeout=timeout,
        check=False,
    )
    (work / f"{command}.stdout.log").write_text(completed.stdout, encoding="utf-8")
    (work / f"{command}.stderr.log").write_text(completed.stderr, encoding="utf-8")
    if completed.returncode != 0 or not output_path.is_file():
        tail = "\n".join(completed.stderr.splitlines()[-20:])
        raise ProductPathError(
            f"product {command} failed ({completed.returncode}):\n{tail}"
        )
    return json.loads(output_path.read_text(encoding="utf-8"))


def compile_explores(sources, work, adapter_type="postgres"):
    """``sources`` is a list of ``{"name", "uuid", "manifestPath"}``; ``uuid`` may be None."""
    return run(
        "compile-explores",
        {"adapterType": adapter_type, "sources": list(sources)},
        work,
    )


def resolve_refs(
    *,
    work,
    dbt,
    profiles_dir,
    profile_name,
    target,
    environment,
    tasks,
    cache,
    concurrency=1,
):
    """``tasks`` is ``[{"key", "projectDir", "bindings"}]``; ``cache`` is ``[{"key", "manifestPath"}]`` or None."""
    return run(
        "resolve-refs",
        {
            "binDir": str(dbt_bin_dir(work, dbt)),
            "profilesDir": str(profiles_dir),
            "profileName": profile_name,
            "target": target,
            "environment": dict(environment),
            "concurrency": concurrency,
            "tasks": list(tasks),
            "cache": None if cache is None else list(cache),
        },
        work,
    )


def parse_missing(text, work):
    return run("parse-missing", {"text": text}, work)["missingRefs"]


def cli_hint(*, work, dbt, project_dir, profiles_dir, profile_name, target, dbt_texts):
    """Run the CLI's dbtList handler in-process and apply withCrossSourceDbtCliHint to each dbt text."""
    return run(
        "cli-hint",
        {
            "binDir": str(dbt_bin_dir(work, dbt)),
            "projectDir": str(project_dir),
            "profilesDir": str(profiles_dir),
            "profileName": profile_name,
            "target": target,
            "dbtTexts": dict(dbt_texts),
        },
        work,
    )


WORDING_TEST_FILE = "src/projectAdapters/crossSourceRefs.realDbt.test.ts"
WORDING_TEST_NAME = "names the consumer, provider and missing numeric version"


def run_wording_test(work, dbt, *, timeout=900):
    """Run the product's own real-dbt wording test; report the expected and received text."""
    root = product_root()
    work = Path(work)
    work.mkdir(parents=True, exist_ok=True)
    backend = root / "packages" / "backend"
    vitest = backend / "node_modules" / ".bin" / "vitest"
    if not vitest.exists():
        raise ProductPathError(
            f"vitest is not installed in the product checkout: {vitest}"
        )
    env = os.environ.copy()
    for key, value in HARNESS_ENV.items():
        env.setdefault(key, value)
    env["LIGHTDASH_TEST_DBT_EXECUTABLES"] = f"1.12={Path(dbt).resolve()}"
    for key, value in (
        ("PGHOST", "127.0.0.1"),
        ("PGPORT", "1"),
        ("PGUSER", "sim"),
        ("PGPASSWORD", "sim"),
        ("PGDATABASE", "sim"),
    ):
        env.setdefault(key, value)
    completed = subprocess.run(
        [
            str(vitest),
            "run",
            "--config",
            "vitest.config.ts",
            WORDING_TEST_FILE,
            "-t",
            WORDING_TEST_NAME,
        ],
        cwd=backend,
        env=env,
        text=True,
        capture_output=True,
        timeout=timeout,
        check=False,
    )
    output = completed.stdout + "\n" + completed.stderr
    (work / "product-wording-test.log").write_text(output, encoding="utf-8")

    def quoted(prefix):
        for line in output.splitlines():
            stripped = line.strip()
            if stripped.startswith(prefix):
                return stripped[len(prefix) :].strip().strip('"')
        return None

    return {
        "test": f"{WORDING_TEST_FILE} > {WORDING_TEST_NAME}",
        "returncode": completed.returncode,
        "passed": completed.returncode == 0 and "1 passed" in output,
        "expected": quoted("Expected:"),
        "received": quoted("Received:"),
    }
