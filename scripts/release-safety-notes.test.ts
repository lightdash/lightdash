import * as assert from 'assert';
import type { ReleaseSafetyMarker } from './release-safety-contract';
import type { AdvisoryDeclaration } from './release-safety-declarations';
import { renderReleaseSafetyNotes } from './release-safety-notes';

const marker: ReleaseSafetyMarker = {
    schemaVersion: '2',
    version: '1.115.0',
    previousVersion: '1.114.0',
    releaseDate: '2026-08-10T00:00:00.000Z',
    migrations: {
        present: true,
        count: 1,
        coreCount: 1,
        eeCount: 0,
        files: [
            {
                name: '20260810000000_users.ts',
                edition: 'core',
                tables: ['users'],
                heaviness: {
                    locksTable: true,
                    rewritesTable: false,
                    scansTable: false,
                },
            },
        ],
    },
    compatibility: {
        rollingUpdateSafe: false,
        recommendedStrategy: 'Recreate',
    },
    api: {
        rest: {
            checked: true,
            breaking: true,
            changes: ['DELETE /api/v1/legacy — endpoint removed'],
            breakingCount: 1,
            advisories: [],
            advisoryCount: 0,
        },
        mcp: {
            checked: true,
            breaking: false,
            changes: [],
            breakingCount: 0,
            advisories: [],
            advisoryCount: 0,
        },
    },
    config: {
        checked: true,
        breaking: true,
        changes: [
            {
                type: 'renamed',
                name: 'NEW_ENV',
                previousName: 'OLD_ENV',
                defaultValue: null,
            },
        ],
    },
    upgrade: {
        minPreviousVersion: '1.100.0',
        requiredStops: ['1.115.0'],
    },
    declaredAdvisories: [],
    declaredBreaks: [
        {
            id: 'coordinated-users-rollout',
            reason: 'requires a coordinated rollout',
            requiredStop: true,
            migration:
                'packages/backend/src/database/migrations/20260810000000_users.ts',
        },
    ],
};

const rendered = renderReleaseSafetyNotes(marker);
const mainOutput = [
    '## Upgrade safety',
    '',
    '**Rolling update unsafe.** Recommended strategy: **Recreate**.',
    '',
    'Database migrations: 1 (1 core, 0 Enterprise).',
    '- `20260810000000_users.ts` (core; users)',
    '',
    'Declared breaking changes:',
    '- `coordinated-users-rollout` (packages/backend/src/database/migrations/20260810000000_users.ts): requires a coordinated rollout (required stop)',
    '',
    'Compatibility changes:',
    '- REST: DELETE /api/v1/legacy — endpoint removed',
    '- Configuration: renamed `OLD_ENV` to `NEW_ENV`',
    '',
    'Required stops: `1.115.0`.',
    'Minimum previous version: `1.100.0`.',
    '',
].join('\n');
assert.strictEqual(rendered, mainOutput);
assert.match(rendered, /^## Upgrade safety/m);
assert.match(rendered, /Rolling update unsafe/);
assert.match(rendered, /20260810000000_users\.ts/);
assert.match(rendered, /DELETE \/api\/v1\/legacy/);
assert.match(rendered, /renamed `OLD_ENV` to `NEW_ENV`/);
assert.match(rendered, /Required stops: `1\.115\.0`/);

const accepted: AdvisoryDeclaration = {
    id: 'internal-operation',
    reason: 'The flag is off by default on Cloud and self-hosted.',
    requiredStop: false,
    impact: {
        kind: 'no-external-callers',
        featureFlag: 'agent-identity',
        covers: { rest: ['DELETE /api/v1/legacy'], mcp: ['legacy'] },
    },
};
const acceptedClaim =
    'No external callers is a claim the PR author and reviewer accepted; release-safety did not verify it.';
const advisoryNotes = renderReleaseSafetyNotes({
    ...marker,
    declaredBreaks: [],
    declaredAdvisories: [accepted],
});
assert.ok(advisoryNotes.includes(acceptedClaim));
assert.match(advisoryNotes, /No external callers \(accepted claim\)/);
assert.match(advisoryNotes, /internal-operation/);
assert.match(advisoryNotes, /agent-identity/);
assert.match(advisoryNotes, /REST `DELETE \/api\/v1\/legacy`/);
assert.match(advisoryNotes, /MCP `legacy`/);
assert.doesNotMatch(advisoryNotes, /Declared breaking changes/);
const firstPartyNotes = renderReleaseSafetyNotes({
    ...marker,
    declaredBreaks: [],
    declaredAdvisories: [
        {
            ...accepted,
            impact: {
                kind: accepted.impact.kind,
                firstPartyOnly:
                    'Only the Lightdash settings page calls this operation.',
                covers: accepted.impact.covers,
            },
        },
    ],
});
assert.match(
    firstPartyNotes,
    /First-party only: Only the Lightdash settings page/,
);
const { declaredAdvisories: ignoredAdvisories, ...oldMarker } = marker;
assert.strictEqual(renderReleaseSafetyNotes(oldMarker as ReleaseSafetyMarker), mainOutput);

console.log('release-safety-notes: all tests passed');
