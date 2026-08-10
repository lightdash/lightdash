import * as assert from 'assert';
import type { ReleaseSafetyMarker } from './release-safety-contract';
import {
    composeReleaseSafetySpan,
    emptyReleaseSafetyIndex,
    indexEntryFromMarker,
    updateReleaseSafetyIndex,
} from './release-safety-index';

const baseMarker: ReleaseSafetyMarker = {
    schemaVersion: '2',
    version: '1.2.0',
    previousVersion: '1.1.0',
    releaseDate: '2026-08-10T00:00:00.000Z',
    migrations: {
        present: false,
        count: 0,
        coreCount: 0,
        eeCount: 0,
        files: [],
    },
    compatibility: {
        rollingUpdateSafe: true,
        recommendedStrategy: 'RollingUpdate',
    },
    api: {
        rest: { checked: true, breaking: false, changes: [] },
        mcp: { checked: true, breaking: false, changes: [] },
    },
    config: { checked: true, breaking: false, changes: [] },
    upgrade: { minPreviousVersion: null, requiredStops: [] },
    declaredBreaks: [],
};

const markers: ReleaseSafetyMarker[] = [
    { ...baseMarker, version: '1.1.0', previousVersion: '1.0.0' },
    baseMarker,
    {
        ...baseMarker,
        version: '1.3.0',
        previousVersion: '1.2.0',
        compatibility: {
            rollingUpdateSafe: 'unknown',
            recommendedStrategy: 'Recreate',
        },
    },
];

const index = updateReleaseSafetyIndex({
    index: emptyReleaseSafetyIndex('2026-08-10T00:00:00.000Z'),
    entries: markers.map((marker) => indexEntryFromMarker(marker, true)),
    generatedAt: '2026-08-10T00:00:00.000Z',
    backfillFloorVersion: '1.1.0',
});

assert.strictEqual(index.entries[0].syntheticRequiredStop, true);
assert.strictEqual(index.entries.every((entry) => entry.backfilled), true);

const safeSpan = composeReleaseSafetySpan(index, '1.1.0', '1.2.0');
assert.strictEqual(safeSpan.verdict, true);
assert.strictEqual(safeSpan.safe, true);

const unknownSpan = composeReleaseSafetySpan(index, '1.1.0', '1.3.0');
assert.strictEqual(unknownSpan.verdict, 'unknown');
assert.strictEqual(unknownSpan.safe, false);

const unsafeIndex = updateReleaseSafetyIndex({
    index,
    entries: [
        {
            ...index.entries[1],
            rollingUpdateSafe: false,
            backfilled: false,
        },
    ],
    generatedAt: '2026-08-10T01:00:00.000Z',
    backfillFloorVersion: null,
});
const unsafeSpan = composeReleaseSafetySpan(
    unsafeIndex,
    '1.1.0',
    '1.3.0',
);
assert.strictEqual(unsafeSpan.verdict, false);
assert.strictEqual(unsafeSpan.safe, false);
assert.strictEqual(unsafeIndex.entries[1].backfilled, false);

const belowFloor = composeReleaseSafetySpan(index, '1.0.0', '1.2.0');
assert.deepStrictEqual(belowFloor.requiredStops, ['1.1.0']);
assert.strictEqual(belowFloor.safe, false);

const missingTarget = composeReleaseSafetySpan(index, '1.1.0', '1.4.0');
assert.strictEqual(missingTarget.verdict, 'unknown');
assert.strictEqual(missingTarget.safe, false);

console.log('release-safety-index: all tests passed');
