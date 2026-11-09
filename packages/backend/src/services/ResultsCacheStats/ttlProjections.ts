import { type ResultsCacheTtlProjections } from '@lightdash/common';
import { getResultsCacheExpiryBufferMs } from '../CacheService/expiryBuffer';
import { getHitRate } from './resultsCacheStats';

const HOUR_SECONDS = 60 * 60;
const DAY_SECONDS = 24 * HOUR_SECONDS;

export const TTL_PROJECTION_LADDER_SECONDS = [
    HOUR_SECONDS,
    6 * HOUR_SECONDS,
    12 * HOUR_SECONDS,
    DAY_SECONDS,
    3 * DAY_SECONDS,
    7 * DAY_SECONDS,
];
export const TTL_PROJECTION_MAX_RUNS = 200_000;

export type TtlReplayRun = {
    cacheKey: string;
    createdAt: Date;
    resultsCreatedAt: Date | null;
    isHit: boolean;
    forcedMiss: boolean;
    warehouseTimeMs: number;
    bytesBilled: number;
};

type RunCost = { warehouseTimeMs: number; bytesBilled: number };

// A real hit records no warehouse cost, so it is priced at its key's average miss.
const getAverageMissCostByKey = (
    runs: TtlReplayRun[],
): Map<string, RunCost> => {
    const totals = new Map<string, RunCost & { count: number }>();
    runs.forEach((run) => {
        if (run.isHit) return;
        const total = totals.get(run.cacheKey) ?? {
            warehouseTimeMs: 0,
            bytesBilled: 0,
            count: 0,
        };
        totals.set(run.cacheKey, {
            warehouseTimeMs: total.warehouseTimeMs + run.warehouseTimeMs,
            bytesBilled: total.bytesBilled + run.bytesBilled,
            count: total.count + 1,
        });
    });
    return new Map(
        [...totals].map(([key, { warehouseTimeMs, bytesBilled, count }]) => [
            key,
            {
                warehouseTimeMs: warehouseTimeMs / count,
                bytesBilled: bytesBilled / count,
            },
        ]),
    );
};

// Runs must be ordered by cacheKey, then createdAt.
export const simulateResultsCacheTtl = (
    runs: TtlReplayRun[],
    ttlSeconds: number,
): { hits: number; warehouseTimeSavedMs: number; bytesBilledSaved: number } => {
    const ttlMs = ttlSeconds * 1000;
    const usableMs = ttlMs - getResultsCacheExpiryBufferMs(ttlMs);
    const averageMissCost = getAverageMissCostByKey(runs);
    let hits = 0;
    let warehouseTimeSavedMs = 0;
    let bytesBilledSaved = 0;
    let currentKey: string | null = null;
    let lastProducedAt: number | null = null;
    runs.forEach((run) => {
        if (run.cacheKey !== currentKey) {
            currentKey = run.cacheKey;
            lastProducedAt =
                run.isHit && run.resultsCreatedAt
                    ? run.resultsCreatedAt.getTime()
                    : null;
        }
        const at = run.createdAt.getTime();
        if (
            !run.forcedMiss &&
            lastProducedAt !== null &&
            at - lastProducedAt < usableMs
        ) {
            hits += 1;
            const saved: RunCost = run.isHit
                ? (averageMissCost.get(run.cacheKey) ?? {
                      warehouseTimeMs: 0,
                      bytesBilled: 0,
                  })
                : run;
            warehouseTimeSavedMs += saved.warehouseTimeMs;
            bytesBilledSaved += saved.bytesBilled;
        } else {
            lastProducedAt = at;
        }
    });
    return { hits, warehouseTimeSavedMs, bytesBilledSaved };
};

export const getTtlCandidates = (currentTtlSeconds: number): number[] =>
    TTL_PROJECTION_LADDER_SECONDS.filter(
        (ttl) => ttl > currentTtlSeconds,
    ).slice(0, 2);

export const buildResultsCacheTtlProjections = ({
    currentTtlSeconds,
    totals,
    replayRuns,
}: {
    currentTtlSeconds: number;
    totals: { runs: number; hits: number };
    replayRuns: TtlReplayRun[];
}): ResultsCacheTtlProjections => {
    if (replayRuns.length > TTL_PROJECTION_MAX_RUNS)
        return { kind: 'tooManyRuns', currentTtlSeconds };

    const otherHits =
        totals.hits - replayRuns.filter((run) => run.isHit).length;
    const baseline = simulateResultsCacheTtl(replayRuns, currentTtlSeconds);
    const baselineHits = otherHits + baseline.hits;

    return {
        kind: 'projections',
        currentTtlSeconds,
        baseline: {
            runs: totals.runs,
            hits: baselineHits,
            hitRate: getHitRate(baselineHits, totals.runs),
            warehouseTimeSavedMs: baseline.warehouseTimeSavedMs,
            bytesBilledSaved: baseline.bytesBilledSaved,
        },
        projections: getTtlCandidates(currentTtlSeconds).map((ttlSeconds) => {
            const simulated = simulateResultsCacheTtl(replayRuns, ttlSeconds);
            const hits = otherHits + simulated.hits;
            return {
                ttlSeconds,
                hits,
                hitRate: getHitRate(hits, totals.runs),
                additionalHits: hits - baselineHits,
                warehouseTimeSavedMs: Math.max(
                    0,
                    simulated.warehouseTimeSavedMs -
                        baseline.warehouseTimeSavedMs,
                ),
                bytesBilledSaved: Math.max(
                    0,
                    simulated.bytesBilledSaved - baseline.bytesBilledSaved,
                ),
            };
        }),
    };
};
