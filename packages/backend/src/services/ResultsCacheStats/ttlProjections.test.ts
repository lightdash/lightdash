import {
    buildResultsCacheTtlProjections,
    getTtlCandidates,
    simulateResultsCacheTtl,
    TTL_PROJECTION_MAX_RUNS,
    type TtlReplayRun,
} from './ttlProjections';

const HOUR = 60 * 60 * 1000;
const base = new Date('2026-11-01T00:00:00.000Z').getTime();
const run = (
    hoursFromBase: number,
    overrides: Partial<TtlReplayRun> = {},
): TtlReplayRun => ({
    cacheKey: 'a',
    createdAt: new Date(base + hoursFromBase * HOUR),
    resultsCreatedAt: new Date(base + hoursFromBase * HOUR),
    isHit: false,
    forcedMiss: false,
    warehouseTimeMs: 1000,
    ...overrides,
});

describe('simulateResultsCacheTtl', () => {
    test('a run within the TTL of the last production is a hit', () => {
        expect(simulateResultsCacheTtl([run(0), run(2)], 3 * 3600)).toEqual({
            hits: 1,
            warehouseTimeSavedMs: 1000,
        });
    });

    test('hits age from the original production, not the previous run', () => {
        // 24h TTL minus a 10 min buffer: runs at 0, 20h and 30h → only 20h hits.
        expect(
            simulateResultsCacheTtl([run(0), run(20), run(30)], 24 * 3600),
        ).toEqual({ hits: 1, warehouseTimeSavedMs: 1000 });
    });

    test('forced misses reset the chain and never hit', () => {
        expect(
            simulateResultsCacheTtl(
                [run(0), run(1, { forcedMiss: true }), run(2)],
                24 * 3600,
            ),
        ).toEqual({ hits: 1, warehouseTimeSavedMs: 1000 });
    });

    test('the buffer is applied', () => {
        // 1h TTL → 50 min usable; a run 55 min later misses.
        expect(simulateResultsCacheTtl([run(0), run(55 / 60)], 3600).hits).toBe(
            0,
        );
    });

    test('a first real hit seeds the chain from its results file', () => {
        const first = run(1, {
            isHit: true,
            resultsCreatedAt: new Date(base),
            warehouseTimeMs: 0,
        });
        expect(simulateResultsCacheTtl([first, run(2)], 3 * 3600)).toEqual({
            hits: 2,
            warehouseTimeSavedMs: 1000,
        });
    });

    test('keys are independent', () => {
        expect(
            simulateResultsCacheTtl(
                [run(0), run(1, { cacheKey: 'b' })],
                24 * 3600,
            ).hits,
        ).toBe(0);
    });
});

describe('getTtlCandidates', () => {
    test('returns the next two steps above the current TTL', () => {
        expect(getTtlCandidates(24 * 3600)).toEqual([3 * 86400, 7 * 86400]);
        expect(getTtlCandidates(2 * 3600)).toEqual([6 * 3600, 12 * 3600]);
    });
    test('returns nothing at or above 7 days', () => {
        expect(getTtlCandidates(7 * 86400)).toEqual([]);
    });
});

describe('buildResultsCacheTtlProjections', () => {
    test('noLongerTtl when no candidate exists', () => {
        expect(
            buildResultsCacheTtlProjections({
                currentTtlSeconds: 30 * 86400,
                totals: { runs: 10, hits: 5 },
                replayRuns: [],
            }),
        ).toEqual({ kind: 'noLongerTtl', currentTtlSeconds: 30 * 86400 });
    });

    test('tooManyRuns when the replay hits the cap', () => {
        expect(
            buildResultsCacheTtlProjections({
                currentTtlSeconds: 3600,
                totals: { runs: 10, hits: 5 },
                replayRuns: Array.from(
                    { length: TTL_PROJECTION_MAX_RUNS + 1 },
                    () => run(0),
                ),
            }),
        ).toEqual({ kind: 'tooManyRuns', currentTtlSeconds: 3600 });
    });

    test('projects hits relative to a replayed baseline', () => {
        // Runs every 2h for one key; plus 4 real hits on keys that aren't replayed.
        const replayRuns = [0, 2, 4, 6].map((h) => run(h));
        const result = buildResultsCacheTtlProjections({
            currentTtlSeconds: 3600,
            totals: { runs: 8, hits: 4 },
            replayRuns,
        });
        expect(result).toEqual({
            kind: 'projections',
            currentTtlSeconds: 3600,
            baseline: { runs: 8, hits: 4, hitRate: 0.5 },
            projections: [
                {
                    ttlSeconds: 6 * 3600,
                    hits: 6,
                    hitRate: 0.75,
                    additionalHits: 2,
                    warehouseTimeSavedMs: 2000,
                },
                {
                    ttlSeconds: 12 * 3600,
                    hits: 7,
                    hitRate: 0.875,
                    additionalHits: 3,
                    warehouseTimeSavedMs: 3000,
                },
            ],
        });
    });
});
