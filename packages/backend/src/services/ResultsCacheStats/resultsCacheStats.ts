import {
    assertUnreachable,
    ParameterError,
    QueryExecutionContext,
    ResultsCacheStatsContextGroup,
    ResultsCacheStatsMissReason,
    type ResultsCacheRecommendation,
    type ResultsCacheRecommendationTarget,
    type ResultsCacheStats,
    type ResultsCacheStatsDays,
    type ResultsCacheStatsTotals,
} from '@lightdash/common';

export const RESULTS_CACHE_RECOMMENDATION_THRESHOLDS = {
    minMisses: 5,
    minShareOfRuns: 0.2,
    minWarehouseTimeMs: 60_000,
} as const;

const MAX_RECOMMENDATIONS = 10;

export type ResultsCacheContextStatsRow = {
    context: string | null;
    runs: number;
    hits: number;
    warehouseTimeOnMissesMs: number;
    warehouseTimeSavedMs: number;
    bytesBilledSaved: number;
};

export type ResultsCacheRecommendationRow = {
    reason: ResultsCacheStatsMissReason;
    chartKind: 'chart' | 'sqlChart' | 'explore';
    target: string;
    name: string | null;
    slug: string | null;
    misses: number;
    warehouseTimeMs: number;
};

const groupOf = (
    context: QueryExecutionContext,
): ResultsCacheStatsContextGroup => {
    switch (context) {
        case QueryExecutionContext.DASHBOARD:
        case QueryExecutionContext.AUTOREFRESHED_DASHBOARD:
            return ResultsCacheStatsContextGroup.DASHBOARDS;
        case QueryExecutionContext.CHART:
        case QueryExecutionContext.CHART_HISTORY:
        case QueryExecutionContext.EXPLORE:
        case QueryExecutionContext.SQL_CHART:
        case QueryExecutionContext.SQL_RUNNER:
        case QueryExecutionContext.VIEW_UNDERLYING_DATA:
        case QueryExecutionContext.METRICS_EXPLORER:
        case QueryExecutionContext.CALCULATE_TOTAL:
        case QueryExecutionContext.CALCULATE_SUBTOTAL:
            return ResultsCacheStatsContextGroup.CHARTS_AND_EXPLORE;
        case QueryExecutionContext.SCHEDULED_DELIVERY:
        case QueryExecutionContext.SCHEDULED_CHART:
        case QueryExecutionContext.SCHEDULED_DASHBOARD:
        case QueryExecutionContext.SCHEDULED_GSHEETS_CHART:
        case QueryExecutionContext.SCHEDULED_GSHEETS_DASHBOARD:
        case QueryExecutionContext.SCHEDULED_GSHEETS_SQL_CHART:
        case QueryExecutionContext.GSHEETS:
        case QueryExecutionContext.ALERT:
            return ResultsCacheStatsContextGroup.SCHEDULED;
        case QueryExecutionContext.FILTER_AUTOCOMPLETE:
        case QueryExecutionContext.CSV:
        case QueryExecutionContext.GSHEETS_ADDON:
        case QueryExecutionContext.EMBED:
        case QueryExecutionContext.AI:
        case QueryExecutionContext.MCP_RUN_METRIC_QUERY:
        case QueryExecutionContext.MCP_RUN_SQL:
        case QueryExecutionContext.MCP_SEARCH_FIELD_VALUES:
        case QueryExecutionContext.MCP_QUERY:
        case QueryExecutionContext.API:
        case QueryExecutionContext.CLI:
        case QueryExecutionContext.PRE_AGGREGATE_MATERIALIZATION:
        case QueryExecutionContext.COMPOSE_SQL_RUNNER:
        case QueryExecutionContext.PYTHON_RUNNER:
        case QueryExecutionContext.MULTI_SOURCE_QUERY:
        case QueryExecutionContext.DATA_APP_SAMPLE:
        case QueryExecutionContext.DESKTOP:
            return ResultsCacheStatsContextGroup.OTHER;
        default:
            return assertUnreachable(context, 'Unknown query context');
    }
};

export const getContextsInGroup = (
    group: ResultsCacheStatsContextGroup,
): QueryExecutionContext[] =>
    Object.values(QueryExecutionContext).filter(
        (context) => groupOf(context) === group,
    );

export const parseResultsCacheStatsDays = (
    value: number | undefined,
): ResultsCacheStatsDays => {
    if (value === undefined || value === 7) return 7;
    if (value === 30) return 30;
    throw new ParameterError('days must be 7 or 30');
};

export const getHitRate = (hits: number, runs: number): number | null =>
    runs === 0 ? null : hits / runs;

const toTotals = (
    rows: ResultsCacheContextStatsRow[],
): ResultsCacheStatsTotals => {
    const runs = rows.reduce((sum, row) => sum + row.runs, 0);
    const hits = rows.reduce((sum, row) => sum + row.hits, 0);
    return {
        runs,
        hits,
        misses: runs - hits,
        hitRate: getHitRate(hits, runs),
        warehouseTimeSavedMs: rows.reduce(
            (sum, row) => sum + row.warehouseTimeSavedMs,
            0,
        ),
        bytesBilledSaved: rows.reduce(
            (sum, row) => sum + row.bytesBilledSaved,
            0,
        ),
        warehouseTimeOnMissesMs: rows.reduce(
            (sum, row) => sum + row.warehouseTimeOnMissesMs,
            0,
        ),
    };
};

const toTarget = (
    row: ResultsCacheRecommendationRow,
): ResultsCacheRecommendationTarget | null => {
    switch (row.chartKind) {
        case 'chart':
            return row.name === null
                ? null
                : { kind: 'chart', chartUuid: row.target, name: row.name };
        case 'sqlChart':
            return row.name === null || row.slug === null
                ? null
                : {
                      kind: 'sqlChart',
                      savedSqlUuid: row.target,
                      slug: row.slug,
                      name: row.name,
                  };
        case 'explore':
            return {
                kind: 'explore',
                exploreName: row.target,
                name: row.target,
            };
        default:
            return assertUnreachable(row.chartKind, 'Unknown chart kind');
    }
};

export const buildResultsCacheStats = ({
    days,
    contextRows,
    recommendationRows,
}: {
    days: ResultsCacheStatsDays;
    contextRows: ResultsCacheContextStatsRow[];
    recommendationRows: ResultsCacheRecommendationRow[];
}): ResultsCacheStats => {
    // Rows arrive ordered by warehouse time desc and already pass the minimum bar.
    const recommendations: ResultsCacheRecommendation[] =
        recommendationRows.flatMap((row) => {
            const target = toTarget(row);
            return target
                ? [
                      {
                          reason: row.reason,
                          target,
                          misses: row.misses,
                          warehouseTimeMs: row.warehouseTimeMs,
                      },
                  ]
                : [];
        });

    const missReasons = Object.values(ResultsCacheStatsMissReason)
        .map((reason) => {
            const rows = recommendations.filter((r) => r.reason === reason);
            return {
                reason,
                misses: rows.reduce((sum, r) => sum + r.misses, 0),
                warehouseTimeMs: rows.reduce(
                    (sum, r) => sum + r.warehouseTimeMs,
                    0,
                ),
            };
        })
        .filter((reason) => reason.misses > 0)
        .sort((a, b) => b.warehouseTimeMs - a.warehouseTimeMs);

    return {
        days,
        summary: {
            ...toTotals(contextRows),
            avoidableMisses: missReasons.reduce((sum, r) => sum + r.misses, 0),
            avoidableWarehouseTimeMs: missReasons.reduce(
                (sum, r) => sum + r.warehouseTimeMs,
                0,
            ),
        },
        missReasons,
        recommendations: recommendations.slice(0, MAX_RECOMMENDATIONS),
    };
};
