import * as assert from 'assert';
import * as fs from 'fs';

const WORKFLOW_PATH = '.github/workflows/release-safety-pr.yml';
const workflow = fs.readFileSync(WORKFLOW_PATH, 'utf-8');

const lines = workflow.split('\n');
const withoutComments = lines.filter((line) => !/^\s*#/.test(line));

const triggerStart = withoutComments.findIndex((line) => /^on:/.test(line));
assert.notStrictEqual(triggerStart, -1, `no "on:" block in ${WORKFLOW_PATH}`);

const triggerEnd = withoutComments.findIndex(
    (line, index) => index > triggerStart && /^\S/.test(line),
);
const triggerBlock = withoutComments.slice(
    triggerStart,
    triggerEnd === -1 ? undefined : triggerEnd,
);

// SPK-857 removed the trigger-level `paths:` filter; SPK-924 (#27139) restored
// it and SPK-1015 removed it again. A trigger-level filter stops the workflow
// launching at all once a PR revision's diff leaves the watched paths, so the
// sticky comment freezes describing a revision that no longer exists and the
// `retract` job never runs to correct it. It also makes the check impossible to
// mark as required: PRs that touch none of the watched paths would never report
// it and could never merge. The in-job `changes` filter is the supported way to
// skip unwatched diffs.
const offending = triggerBlock.filter((line) => /^\s*paths(-ignore)?:/.test(line));
assert.deepStrictEqual(
    offending,
    [],
    `${WORKFLOW_PATH} must not use a trigger-level paths filter (see SPK-857 / SPK-1015); found:\n${offending.join('\n')}`,
);

// The in-job filter is what decides whether the heavy jobs run, so it has to
// cover every path that can move the release-safety verdict. These two were
// present only in the trigger-level list, which made `retract` unreachable for
// every other watched path.
for (const required of [
    'scripts/breaking-change-declarations.ts',
    'scripts/release-safety-pr-gate.ts',
    'scripts/gen-release-safety.ts',
    'packages/backend/**',
    'packages/common/**',
]) {
    assert.ok(
        workflow.includes(`- '${required}'`),
        `${WORKFLOW_PATH} in-job watched filter is missing ${required}`,
    );
}

// SPK-1012: a merged or closed PR must never receive a verdict. The job-level
// gate alone is not enough — it is evaluated when the job starts, and the run
// takes long enough that a PR can merge mid-run — so the two write steps check
// again immediately before writing.
const openGates = workflow.match(/needs\.changes\.outputs\.open == 'true'/g) ?? [];
assert.ok(
    openGates.length >= 3,
    `expected openapi-specs, preview and retract to be gated on the PR being open; found ${openGates.length} gate(s)`,
);

const mergedChecks = workflow.match(/pr\.merged/g) ?? [];
assert.ok(
    mergedChecks.length >= 3,
    `expected the openness step and both write steps to check pr.merged; found ${mergedChecks.length}`,
);

// SPK-1013: the sticky comment is claimed as pending before the expensive jobs,
// so a run that is cancelled or fails leaves a visible "no verdict yet" notice
// rather than nothing or a stale verdict from an earlier revision.
assert.ok(
    workflow.includes('<!-- release-safety-pending -->'),
    `${WORKFLOW_PATH} must stamp a pending state on the sticky comment (SPK-1013)`,
);

// The pending notice must not carry the describes-stamp, or an `edited` event
// could short-circuit against it and treat "not checked yet" as a live verdict.
// Nothing writes that stamp today (SPK-1017), so this guards the future fix.
const pendingBlock = workflow.slice(
    workflow.indexOf('<!-- release-safety-pending -->'),
    workflow.indexOf('  openapi-specs:'),
);
assert.ok(
    !pendingBlock.includes('release-safety-describes head:'),
    'the pending notice must not emit a release-safety-describes stamp (SPK-1013 / SPK-1017)',
);

// SPK-1017: the short-circuit may only reuse a verdict whose gates PASSED.
// `preview` is skipped when fresh, a skipped job reports SKIPPED, and SKIPPED
// satisfies a required status check — so reusing a failed verdict would clear a
// red gate by editing the pull request title.
assert.ok(
    workflow.includes('steps.sticky.outputs.gate }}" = "pass"'),
    'the freshness check must require the previous run\'s gates to have passed (SPK-1017)',
);
assert.ok(
    /gate:\(pass\|fail\)/.test(workflow),
    'the describes-stamp reader must capture the gate outcome (SPK-1017)',
);

// The condition deciding "did the gates fail" now appears twice: once to fail
// the job, once to stamp the comment. They must stay identical, or the stamp
// will claim a pass the job did not give.
const gateCondition =
    /steps\.rest-result\.outputs\.broken == 'true' \|\| steps\.mcp-result\.outputs\.broken == 'true' \|\| steps\.declaration-gate\.outcome == 'failure' \|\| steps\.sql-declaration-gate\.outcome == 'failure'/g;
const gateConditions = workflow.match(gateCondition) ?? [];
assert.ok(
    gateConditions.length >= 2,
    `the gate-failure condition must be identical where the job fails and where the stamp is written; found ${gateConditions.length} matching occurrence(s)`,
);

// SPK-1021: the preview job's dependency install was 75% of its runtime because
// nothing cached it. Losing the cache costs ~4 minutes per run and fails
// silently — the job still passes, just slowly — so it is asserted here.
// The ordering matters too: setup-node shells out to pnpm to resolve the store
// path, so pnpm must be set up first or the cache cannot be configured at all.
// Comments are stripped first: the prose above this config quotes `cache: 'pnpm'`
// verbatim, so testing the raw text matches the explanation rather than the
// setting, and the assertion passes with the cache deleted.
const configOnly = withoutComments.join('\n');
const previewJob = configOnly.slice(
    configOnly.indexOf('\n  preview:'),
    configOnly.indexOf('\n  retract:'),
);
assert.ok(
    /cache:\s*'pnpm'/.test(previewJob),
    "the preview job's setup-node must cache the pnpm store (SPK-1021)",
);
assert.ok(
    previewJob.indexOf('pnpm/action-setup') < previewJob.indexOf('actions/setup-node'),
    'pnpm must be set up before setup-node, or cache: pnpm cannot resolve the store path (SPK-1021)',
);

// PROD-10253: the base and PR snapshots are generated as two parallel matrix
// legs. Generating them back-to-back in one job put both on the critical path of
// a required check.
const specsJob = configOnly.slice(
    configOnly.indexOf('\n  openapi-specs:'),
    configOnly.indexOf('\n  preview:'),
);
assert.ok(
    /side:\s*\[base,\s*pr\]/.test(specsJob),
    'the base and PR API snapshots must be generated as parallel matrix legs (PROD-10253)',
);
assert.ok(
    /fail-fast:\s*false/.test(specsJob),
    'one snapshot leg failing must not cancel the other (PROD-10253)',
);

// The base snapshot cache is keyed on the RESOLVED comparison base. A key that
// omits it — the PR number, a lockfile hash, a constant — would serve one base's
// spec as another's and certify a break the diff never looked at.
assert.ok(
    specsJob.includes(
        'key: release-safety-api-snapshots-base-${{ needs.changes.outputs.base_sha }}',
    ),
    'the base snapshot cache must be keyed on the resolved base SHA (PROD-10253)',
);

// Each leg uploads its own artifact, so the download must merge every leg's
// artifact. A `name:` download would silently deliver one side of the pair.
assert.ok(
    /pattern:\s*release-safety-api-snapshots-\*/.test(previewJob) &&
        /merge-multiple:\s*true/.test(previewJob),
    "the preview job must merge every snapshot leg's artifact (PROD-10253)",
);

// The preview job clones shallow, so the base commit it diffs against has to be
// fetched explicitly, and the one path that reads release history — expand/
// contract tracing in scripts/expand-version.ts — has to unshallow first or it
// degrades to a more conservative floor than the release will report.
assert.ok(
    /git fetch --no-tags --depth=1 origin/.test(previewJob),
    'the preview job must fetch the comparison base commit (PROD-10253)',
);
assert.ok(
    /git fetch --unshallow/.test(previewJob) && /git fetch --tags/.test(previewJob),
    'the preview job must unshallow before expand/contract tracing (PROD-10253)',
);
assert.ok(
    previewJob.indexOf('id: lint') < previewJob.indexOf('git fetch --unshallow'),
    "the linter's verdict is what decides whether history is needed, so it must run first (PROD-10253)",
);

process.stdout.write('release-safety workflow shape tests passed\n');
