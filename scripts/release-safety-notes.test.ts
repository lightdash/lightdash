import * as assert from 'assert';
import type { ReleaseSafetyMarker } from './release-safety-contract';
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
        },
        mcp: { checked: true, breaking: false, changes: [] },
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
assert.match(rendered, /^## Upgrade safety/m);
assert.match(rendered, /Rolling update unsafe/);
assert.match(rendered, /20260810000000_users\.ts/);
assert.match(rendered, /DELETE \/api\/v1\/legacy/);
assert.match(rendered, /renamed `OLD_ENV` to `NEW_ENV`/);
assert.match(rendered, /Required stops: `1\.115\.0`/);

console.log('release-safety-notes: all tests passed');
