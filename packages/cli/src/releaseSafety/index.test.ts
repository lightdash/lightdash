import {
    composeReleaseSafetySpan,
    INDEX_SCHEMA_VERSION,
    parseReleaseSafetyIndex,
    type ReleaseSafetyIndex,
} from '.';

const index: ReleaseSafetyIndex = {
    schemaVersion: INDEX_SCHEMA_VERSION,
    generatedAt: '2026-08-11T00:00:00.000Z',
    backfillFloorVersion: null,
    entries: [
        {
            version: '1.0.0',
            previousVersion: '0.9.0',
            releaseDate: '2026-07-31T00:00:00.000Z',
            rollingUpdateSafe: true,
            requiredStops: [],
            minPreviousVersion: null,
            backfilled: true,
            syntheticRequiredStop: false,
        },
        {
            version: '1.1.0',
            previousVersion: '1.0.0',
            releaseDate: '2026-08-01T00:00:00.000Z',
            rollingUpdateSafe: true,
            requiredStops: [],
            minPreviousVersion: null,
            backfilled: true,
            syntheticRequiredStop: false,
        },
        {
            version: '1.2.0',
            previousVersion: '1.1.0',
            releaseDate: '2026-08-02T00:00:00.000Z',
            rollingUpdateSafe: true,
            requiredStops: [],
            minPreviousVersion: null,
            backfilled: true,
            syntheticRequiredStop: false,
        },
        {
            version: '1.3.0',
            previousVersion: '1.2.0',
            releaseDate: '2026-08-03T00:00:00.000Z',
            rollingUpdateSafe: 'unknown',
            requiredStops: [],
            minPreviousVersion: null,
            backfilled: true,
            syntheticRequiredStop: false,
        },
    ],
};

describe('composeReleaseSafetySpan', () => {
    it('composes a safe forward span', () => {
        expect(composeReleaseSafetySpan(index, '1.0.0', '1.2.0')).toEqual({
            verdict: true,
            safe: true,
            requiredStops: [],
            minPreviousVersion: null,
            coveredVersions: ['1.1.0', '1.2.0'],
            missingRanges: [],
        });
    });

    it('fails closed for an unknown release', () => {
        expect(composeReleaseSafetySpan(index, '1.0.0', '1.3.0')).toMatchObject(
            { verdict: 'unknown', safe: false },
        );
    });

    it('normalizes a reverse span to the same covered edges', () => {
        expect(composeReleaseSafetySpan(index, '1.2.0', '1.0.0')).toEqual(
            composeReleaseSafetySpan(index, '1.0.0', '1.2.0'),
        );
    });

    it('fails closed when the target version is absent', () => {
        expect(composeReleaseSafetySpan(index, '1.0.0', '1.4.0')).toMatchObject(
            {
                verdict: 'unknown',
                safe: false,
                missingRanges: [
                    { afterVersion: '1.3.0', beforeVersion: '1.4.0' },
                ],
            },
        );
    });

    it('fails closed across an internal coverage gap', () => {
        const indexWithGap = {
            ...index,
            entries: index.entries.filter((entry) => entry.version !== '1.2.0'),
        };

        expect(
            composeReleaseSafetySpan(indexWithGap, '1.0.0', '1.3.0'),
        ).toMatchObject({
            verdict: 'unknown',
            safe: false,
            missingRanges: [{ afterVersion: '1.1.0', beforeVersion: '1.3.0' }],
        });
    });

    it('allows a same-version span when the endpoint is known', () => {
        expect(composeReleaseSafetySpan(index, '1.2.0', '1.2.0')).toMatchObject(
            {
                verdict: true,
                safe: true,
                coveredVersions: [],
                missingRanges: [],
            },
        );
    });

    it('fails closed for an absent same-version endpoint', () => {
        expect(composeReleaseSafetySpan(index, '1.4.0', '1.4.0')).toMatchObject(
            {
                verdict: 'unknown',
                safe: false,
                coveredVersions: [],
                missingRanges: [
                    { afterVersion: '1.4.0', beforeVersion: '1.4.0' },
                ],
            },
        );
    });

    it('fails closed when a same-version endpoint only appears as a predecessor', () => {
        expect(composeReleaseSafetySpan(index, '0.9.0', '0.9.0')).toMatchObject(
            {
                verdict: 'unknown',
                safe: false,
                missingRanges: [
                    { afterVersion: '0.9.0', beforeVersion: '0.9.0' },
                ],
            },
        );
    });

    it('fails closed when the source endpoint only appears as a predecessor', () => {
        expect(composeReleaseSafetySpan(index, '0.9.0', '1.0.0')).toMatchObject(
            {
                verdict: 'unknown',
                safe: false,
                missingRanges: [
                    { afterVersion: '0.9.0', beforeVersion: '0.9.0' },
                ],
            },
        );
    });

    it('applies required stops and minimum versions from the normalized lower endpoint', () => {
        const constrainedIndex: ReleaseSafetyIndex = {
            ...index,
            entries: index.entries.map((entry) =>
                entry.version === '1.2.0'
                    ? {
                          ...entry,
                          requiredStops: ['1.1.0'],
                          minPreviousVersion: '1.1.0',
                      }
                    : entry,
            ),
        };
        const forward = composeReleaseSafetySpan(
            constrainedIndex,
            '1.0.0',
            '1.2.0',
        );
        const reverse = composeReleaseSafetySpan(
            constrainedIndex,
            '1.2.0',
            '1.0.0',
        );

        expect(forward).toMatchObject({
            verdict: true,
            safe: false,
            requiredStops: ['1.1.0'],
            minPreviousVersion: '1.1.0',
        });
        expect(reverse).toEqual(forward);
    });
});

describe('parseReleaseSafetyIndex', () => {
    it('strictly rejects invalid versions and additional properties', () => {
        expect(() =>
            parseReleaseSafetyIndex({
                ...index,
                entries: [{ ...index.entries[0], version: 'v1.1.0' }],
            }),
        ).toThrow('Invalid release-safety index');
        expect(() =>
            parseReleaseSafetyIndex({ ...index, unexpected: true }),
        ).toThrow('Invalid release-safety index');
    });
});
