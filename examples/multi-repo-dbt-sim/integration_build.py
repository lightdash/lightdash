import hashlib
import json
import os
import tempfile
from pathlib import Path

from tooling import command

ROOT = Path(__file__).resolve().parent
CHECKOUT = ROOT.parents[1]
BASE = "66a39c038857c709a1d628dbd0c530c5f558ab35"
HEAD = "6e35424935013c5c2fc5ceb7174b4abca62a0014"
FIX = "b4fbe779561f8077259dc6beb504f45b6dfe3238"
SOURCE = "packages/backend/src/projectAdapters/crossSourceRefs.ts"
WORK = ROOT / ".work/large-org/integration"


def git(*arguments, env=None):
    return command(
        ["git", *arguments], CHECKOUT, dict(os.environ) if env is None else env, 60
    ).stdout.strip()


def combine_additions(merged, main, head):
    first_start = merged.index("<<<<<<< ")
    first_end = merged.index("\n", merged.index(">>>>>>> ", first_start))
    closing = "\n        };\n"
    if merged[first_end : first_end + len(closing)] != closing:
        raise RuntimeError("The integration conflict has an unknown closing block")
    boundary = "        let contradictions = 0;"
    main_addition = main[
        main.index("        const skipFailedConsumers = async") : main.index(boundary)
    ]
    head_addition = head[
        head.index("        const referenceTargetsPackage = (") : head.index(boundary)
    ]
    resolved = (
        merged[:first_start]
        + main_addition
        + head_addition
        + merged[first_end + len(closing) :].lstrip("\n")
    )
    start = resolved.index("<<<<<<< ")
    end = resolved.index("\n", resolved.index(">>>>>>> ", start))
    conflict = resolved[start:end]
    expected = (
        f"<<<<<<< {BASE}\n"
        "            await skipFailedConsumers(queued);\n"
        "=======\n"
        "            validateModelCycles();\n"
        f">>>>>>> {HEAD}"
    )
    if conflict != expected:
        raise RuntimeError("The integration has an unknown call-site conflict")
    resolved = (
        resolved[:start]
        + "            await skipFailedConsumers(queued);\n"
        + "            validateModelCycles();"
        + resolved[end:]
    )
    if any(marker in resolved for marker in ("<<<<<<<", "=======", ">>>>>>>")):
        raise RuntimeError("The integration retains unresolved conflict markers")
    if main_addition not in resolved or head_addition not in resolved:
        raise RuntimeError("The integration changed an upstream function body")
    return resolved


def prepare():
    from tooling import CommandError

    if not WORK.resolve().is_relative_to(CHECKOUT):
        raise ValueError("The integration must stay inside this harness worktree")
    git("merge-base", "--is-ancestor", FIX, BASE)
    marker = WORK / "build.json"
    if marker.exists():
        existing = json.loads(marker.read_text())
        if existing["base_sha"] != BASE or existing["pr_head_sha"] != HEAD:
            raise RuntimeError("The local integration belongs to different inputs")
        git("verify-commit", existing["revision"])
        if git("rev-parse", existing["revision"] + "^{tree}") != existing["tree"]:
            raise RuntimeError("The local integration tree changed")
        return existing
    branch = git("rev-parse", "HEAD")
    try:
        output = git("merge-tree", "--write-tree", "--name-only", BASE, HEAD)
    except CommandError as error:
        if error.returncode != 1:
            raise
        output = error.stdout.strip()
    lines = output.splitlines()
    if lines[1 : lines.index("")] != [SOURCE]:
        raise RuntimeError("The integration has unexpected conflict paths")
    merged_tree = lines[0]
    resolved = combine_additions(
        git("show", merged_tree + ":" + SOURCE) + "\n",
        git("show", BASE + ":" + SOURCE) + "\n",
        git("show", HEAD + ":" + SOURCE) + "\n",
    )
    WORK.mkdir(parents=True, exist_ok=True)
    source = WORK / "crossSourceRefs.ts"
    source.write_text(resolved)
    blob = git("hash-object", "-w", str(source))
    with tempfile.TemporaryDirectory(prefix="index-", dir=WORK) as directory:
        env = {**os.environ, "GIT_INDEX_FILE": str(Path(directory) / "index")}
        git("read-tree", merged_tree, env=env)
        git("update-index", "--cacheinfo", "100644," + blob + "," + SOURCE, env=env)
        tree = git("write-tree", env=env)
    revision = git(
        "commit-tree",
        "-S",
        tree,
        "-p",
        BASE,
        "-p",
        HEAD,
        "-m",
        "test: combine cycle probe fixes locally",
        "-m",
        "Refs #31323\nRefs #31113",
    )
    git("verify-commit", revision)
    if git("rev-parse", "HEAD") != branch:
        raise RuntimeError("The integration changed the checkout branch")
    result = {
        "revision": revision,
        "tree": tree,
        "base_sha": BASE,
        "pr_head_sha": HEAD,
        "includes_31313": True,
        "method": "Local merge-tree and signed commit-tree; no branch update or push",
        "conflict_resolution": "Keep both upstream function additions unchanged; call source skipping before cycle validation",
        "resolved_source_sha256": hashlib.sha256(resolved.encode()).hexdigest(),
    }
    marker.write_text(json.dumps(result, indent=2) + "\n")
    return result


if __name__ == "__main__":
    print(json.dumps(prepare(), indent=2))
