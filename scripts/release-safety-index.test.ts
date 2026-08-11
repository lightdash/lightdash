import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { ReleaseSafetyMarker } from './release-safety-contract';
import {
    appendReleaseSafetyMarker,
    composeReleaseSafetySpan,
    emptyReleaseSafetyIndex,
    indexEntryFromMarker,
    loadReleaseSafetyIndex,
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

const appendedHistoricalMarker = appendReleaseSafetyMarker({
    index: emptyReleaseSafetyIndex('1970-01-01T00:00:00.000Z'),
    marker: {
        ...baseMarker,
        releaseDate: '2026-04-09T16:07:20.000Z',
    },
    backfilled: true,
    backfillFloorVersion: null,
    now: new Date('2026-08-10T20:53:28.712Z'),
});
assert.strictEqual(
    appendedHistoricalMarker.generatedAt,
    '2026-08-10T20:53:28.712Z',
);
assert.strictEqual(
    appendedHistoricalMarker.entries[0].releaseDate,
    '2026-04-09T16:07:20.000Z',
);

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
assert.deepStrictEqual(safeSpan.missingRanges, []);

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
assert.deepStrictEqual(missingTarget.missingRanges, [
    { afterVersion: '1.3.0', beforeVersion: '1.4.0' },
]);

const contiguousEntries = ['1.0.0', '1.1.0', '1.2.0', '1.3.0', '1.4.0'].map(
    (version, entryIndex) =>
        indexEntryFromMarker(
            {
                ...baseMarker,
                version,
                previousVersion:
                    entryIndex === 0 ? '0.9.0' : `1.${entryIndex - 1}.0`,
            },
            true,
        ),
);
const contiguousIndex = updateReleaseSafetyIndex({
    index: emptyReleaseSafetyIndex('2026-08-10T00:00:00.000Z'),
    entries: contiguousEntries,
    generatedAt: '2026-08-10T00:00:00.000Z',
    backfillFloorVersion: null,
});

const contiguousSpan = composeReleaseSafetySpan(
    contiguousIndex,
    '1.0.0',
    '1.4.0',
);
assert.strictEqual(contiguousSpan.verdict, true);
assert.strictEqual(contiguousSpan.safe, true);
assert.deepStrictEqual(contiguousSpan.missingRanges, []);

const middleGapSpan = composeReleaseSafetySpan(
    {
        ...contiguousIndex,
        entries: contiguousIndex.entries.filter(
            (entry) => entry.version !== '1.2.0',
        ),
    },
    '1.0.0',
    '1.4.0',
);
assert.strictEqual(middleGapSpan.verdict, 'unknown');
assert.strictEqual(middleGapSpan.safe, false);
assert.deepStrictEqual(middleGapSpan.missingRanges, [
    { afterVersion: '1.1.0', beforeVersion: '1.3.0' },
]);

const startGapSpan = composeReleaseSafetySpan(
    {
        ...contiguousIndex,
        entries: contiguousIndex.entries.filter(
            (entry) => entry.version !== '1.1.0',
        ),
    },
    '1.0.0',
    '1.4.0',
);
assert.strictEqual(startGapSpan.verdict, 'unknown');
assert.strictEqual(startGapSpan.safe, false);
assert.deepStrictEqual(startGapSpan.missingRanges, [
    { afterVersion: '1.0.0', beforeVersion: '1.2.0' },
]);

const endGapSpan = composeReleaseSafetySpan(
    {
        ...contiguousIndex,
        entries: contiguousIndex.entries.filter(
            (entry) => entry.version !== '1.4.0',
        ),
    },
    '1.0.0',
    '1.4.0',
);
assert.strictEqual(endGapSpan.verdict, 'unknown');
assert.strictEqual(endGapSpan.safe, false);
assert.deepStrictEqual(endGapSpan.missingRanges, [
    { afterVersion: '1.3.0', beforeVersion: '1.4.0' },
]);

const temporaryDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'release-safety-index-test-'),
);
try {
    const malformedEntryPath = path.join(
        temporaryDirectory,
        'malformed-entry.json',
    );
    const malformedEntry = {
        ...contiguousIndex,
        entries: contiguousIndex.entries.map((entry, entryIndex) =>
            entryIndex === 0
                ? {
                      version: entry.version,
                      previousVersion: entry.previousVersion,
                      releaseDate: entry.releaseDate,
                      rollingUpdateSafe: entry.rollingUpdateSafe,
                      requiredStops: entry.requiredStops,
                      minPreviousVersion: entry.minPreviousVersion,
                      backfilled: entry.backfilled,
                  }
                : entry,
        ),
    };
    fs.writeFileSync(malformedEntryPath, JSON.stringify(malformedEntry));
    assert.throws(
        () => loadReleaseSafetyIndex(malformedEntryPath),
        /Invalid release-safety index/,
    );

    const invalidTriStatePath = path.join(
        temporaryDirectory,
        'invalid-tri-state.json',
    );
    const invalidTriState = {
        ...contiguousIndex,
        entries: contiguousIndex.entries.map((entry, entryIndex) =>
            entryIndex === 0 ? { ...entry, rollingUpdateSafe: 'safe' } : entry,
        ),
    };
    fs.writeFileSync(invalidTriStatePath, JSON.stringify(invalidTriState));
    assert.throws(
        () => loadReleaseSafetyIndex(invalidTriStatePath),
        /Invalid release-safety index/,
    );

    const missingIndex = loadReleaseSafetyIndex(
        path.join(temporaryDirectory, 'missing.json'),
    );
    assert.deepStrictEqual(
        missingIndex,
        emptyReleaseSafetyIndex('1970-01-01T00:00:00.000Z'),
    );
} finally {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
}

console.log('release-safety-index: all tests passed');
