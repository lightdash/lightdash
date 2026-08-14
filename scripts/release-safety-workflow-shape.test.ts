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

process.stdout.write('release-safety workflow shape tests passed\n');
