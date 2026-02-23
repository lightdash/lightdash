import { type Explore } from '../types/explore';
import { type FieldId, MetricType } from '../types/field';
import { flattenFilterGroup } from '../types/filter';
import { type MetricQuery } from '../types/metricQuery';
import {
    PreAggregateMissReason,
    type PreAggregateDef,
    type PreAggregateMatchMiss,
} from '../types/preAggregate';
import { type TimeFrames } from '../types/timeFrames';
import { getItemId } from '../utils/item';
import { getMetricsMapFromTables } from '../utils/fields';
import { timeFrameOrder } from '../utils/timeFrames';
import { isReAggregatable } from './additivity';

export type MatchResult =
    | { hit: true; preAggregateName: string; miss: null }
    | { hit: false; preAggregateName: null; miss: PreAggregateMatchMiss };

const isGranularityCoarserOrEqual = (
    queryGranularity: TimeFrames,
    preAggregateGranularity: TimeFrames,
): boolean => {
    const queryIndex = timeFrameOrder.indexOf(queryGranularity);
    const preAggregateIndex = timeFrameOrder.indexOf(preAggregateGranularity);
    if (queryIndex === -1 || preAggregateIndex === -1) {
        return false;
    }
    return queryIndex >= preAggregateIndex;
};

const getDimensionsByFieldId = (
    explore: Explore,
): Map<FieldId, Explore['tables'][string]['dimensions'][string]> => {
    const dimensionsByFieldId = new Map<
        FieldId,
        Explore['tables'][string]['dimensions'][string]
    >();

    Object.values(explore.tables).forEach((table) => {
        Object.values(table.dimensions).forEach((dimension) => {
            dimensionsByFieldId.set(getItemId(dimension), dimension);
        });
    });

    return dimensionsByFieldId;
};

const getMetricReferences = (
    explore: Explore,
    metric: Explore['tables'][string]['metrics'][string],
): Set<string> => {
    const references = new Set<string>([`${metric.table}.${metric.name}`]);

    if (metric.table === explore.baseTable) {
        references.add(metric.name);
    }

    return references;
};

const getDimensionReferences = (
    explore: Explore,
    dimension: Explore['tables'][string]['dimensions'][string],
): Set<string> => {
    const baseDimensionName =
        dimension.timeIntervalBaseDimensionName ?? dimension.name;
    const references = new Set<string>([
        `${dimension.table}.${baseDimensionName}`,
    ]);

    if (dimension.table === explore.baseTable) {
        references.add(baseDimensionName);
    }

    return references;
};

const dimensionFieldIdMatchesDef = (
    fieldId: FieldId,
    explore: Explore,
    defDimensions: Set<string>,
    dimensionsByFieldId: Map<
        FieldId,
        Explore['tables'][string]['dimensions'][string]
    >,
): boolean => {
    const dimension = dimensionsByFieldId.get(fieldId);
    if (!dimension) {
        return false;
    }

    const references = getDimensionReferences(explore, dimension);
    return Array.from(references).some((reference) =>
        defDimensions.has(reference),
    );
};

const extractDimensionFilterFieldIds = (
    metricQuery: MetricQuery,
): FieldId[] => {
    if (!metricQuery.filters.dimensions) {
        return [];
    }

    return flattenFilterGroup(metricQuery.filters.dimensions)
        .filter((rule) => !rule.disabled)
        .map((rule) => rule.target)
        .filter(
            (target): target is { fieldId: FieldId } =>
                !!target &&
                typeof target === 'object' &&
                'fieldId' in target &&
                typeof target.fieldId === 'string',
        )
        .map((target) => target.fieldId);
};

const getGranularityMissForDef = (
    metricQuery: MetricQuery,
    explore: Explore,
    preAggregateDef: PreAggregateDef,
    dimensionsByFieldId: Map<
        FieldId,
        Explore['tables'][string]['dimensions'][string]
    >,
): Extract<
    PreAggregateMatchMiss,
    { reason: PreAggregateMissReason.GRANULARITY_TOO_FINE }
> | null => {
    if (!preAggregateDef.timeDimension || !preAggregateDef.granularity) {
        return null;
    }

    for (const dimensionFieldId of metricQuery.dimensions) {
        const dimension = dimensionsByFieldId.get(dimensionFieldId);
        const queryGranularity = dimension?.timeInterval;
        const matchesRollupTimeDimension =
            !!dimension &&
            !!queryGranularity &&
            (dimension.timeIntervalBaseDimensionName ?? dimension.name) ===
                preAggregateDef.timeDimension;

        if (
            matchesRollupTimeDimension &&
            !isGranularityCoarserOrEqual(
                queryGranularity,
                preAggregateDef.granularity,
            )
        ) {
            return {
                reason: PreAggregateMissReason.GRANULARITY_TOO_FINE,
                fieldId: dimensionFieldId,
                queryGranularity,
                preAggregateGranularity: preAggregateDef.granularity,
                preAggregateTimeDimension: preAggregateDef.timeDimension,
            };
        }
    }

    return null;
};

const getMissForDef = ({
    metricQuery,
    explore,
    preAggregateDef,
    dimensionsByFieldId,
    metricsByFieldId,
}: {
    metricQuery: MetricQuery;
    explore: Explore;
    preAggregateDef: PreAggregateDef;
    dimensionsByFieldId: Map<
        FieldId,
        Explore['tables'][string]['dimensions'][string]
    >;
    metricsByFieldId: ReturnType<typeof getMetricsMapFromTables>;
}): PreAggregateMatchMiss | null => {
    const defMetrics = new Set(preAggregateDef.metrics);
    for (const metricFieldId of metricQuery.metrics) {
        const metric = metricsByFieldId[metricFieldId];
        if (!metric) {
            return {
                reason: PreAggregateMissReason.METRIC_NOT_IN_PRE_AGGREGATE,
                fieldId: metricFieldId,
            };
        }

        const metricReferences = getMetricReferences(explore, metric);
        const isMetricInDef = Array.from(metricReferences).some((reference) =>
            defMetrics.has(reference),
        );
        if (!isMetricInDef) {
            return {
                reason: PreAggregateMissReason.METRIC_NOT_IN_PRE_AGGREGATE,
                fieldId: metricFieldId,
            };
        }

        if (metric.type === MetricType.NUMBER) {
            return {
                reason: PreAggregateMissReason.CUSTOM_SQL_METRIC,
                fieldId: metricFieldId,
            };
        }
        if (!isReAggregatable(metric.type)) {
            return {
                reason: PreAggregateMissReason.NON_ADDITIVE_METRIC,
                fieldId: metricFieldId,
            };
        }
    }

    const defDimensions = new Set(preAggregateDef.dimensions);
    const missingQueryDimensionFieldId = metricQuery.dimensions.find(
        (dimensionFieldId) =>
            !dimensionFieldIdMatchesDef(
                dimensionFieldId,
                explore,
                defDimensions,
                dimensionsByFieldId,
            ),
    );
    if (missingQueryDimensionFieldId) {
        return {
            reason: PreAggregateMissReason.DIMENSION_NOT_IN_PRE_AGGREGATE,
            fieldId: missingQueryDimensionFieldId,
        };
    }

    const filterDimensionFieldIds = extractDimensionFilterFieldIds(metricQuery);
    const missingFilterDimensionFieldId = filterDimensionFieldIds.find(
        (dimensionFieldId) =>
            !dimensionFieldIdMatchesDef(
                dimensionFieldId,
                explore,
                defDimensions,
                dimensionsByFieldId,
            ),
    );
    if (missingFilterDimensionFieldId) {
        return {
            reason:
                PreAggregateMissReason.FILTER_DIMENSION_NOT_IN_PRE_AGGREGATE,
            fieldId: missingFilterDimensionFieldId,
        };
    }

    const granularityMiss = getGranularityMissForDef(
        metricQuery,
        explore,
        preAggregateDef,
        dimensionsByFieldId,
    );
    if (granularityMiss) {
        return granularityMiss;
    }

    return null;
};

export const findMatch = (
    metricQuery: MetricQuery,
    explore: Explore,
): MatchResult => {
    if (!explore.preAggregates || explore.preAggregates.length === 0) {
        return {
            hit: false,
            preAggregateName: null,
            miss: {
                reason: PreAggregateMissReason.NO_PRE_AGGREGATES_DEFINED,
            },
        };
    }

    if ((metricQuery.customDimensions || []).length > 0) {
        return {
            hit: false,
            preAggregateName: null,
            miss: {
                reason: PreAggregateMissReason.CUSTOM_DIMENSION_PRESENT,
            },
        };
    }

    if ((metricQuery.tableCalculations || []).length > 0) {
        return {
            hit: false,
            preAggregateName: null,
            miss: {
                reason: PreAggregateMissReason.TABLE_CALCULATION_PRESENT,
            },
        };
    }

    if ((metricQuery.additionalMetrics || []).length > 0) {
        return {
            hit: false,
            preAggregateName: null,
            miss: {
                reason: PreAggregateMissReason.CUSTOM_METRIC_PRESENT,
            },
        };
    }

    const dimensionsByFieldId = getDimensionsByFieldId(explore);
    const metricsByFieldId = getMetricsMapFromTables(explore.tables);

    const matchedDefs: PreAggregateDef[] = [];
    let firstMiss: PreAggregateMatchMiss | null = null;

    explore.preAggregates.forEach((preAggregateDef) => {
        const miss = getMissForDef({
            metricQuery,
            explore,
            preAggregateDef,
            dimensionsByFieldId,
            metricsByFieldId,
        });

        if (!miss) {
            matchedDefs.push(preAggregateDef);
            return;
        }

        if (!firstMiss) {
            firstMiss = miss;
        }
    });

    if (matchedDefs.length === 0) {
        return {
            hit: false,
            preAggregateName: null,
            miss:
                firstMiss ??
                {
                    reason:
                        PreAggregateMissReason.DIMENSION_NOT_IN_PRE_AGGREGATE,
                    fieldId:
                        metricQuery.dimensions[0] ??
                        metricQuery.metrics[0] ??
                        'unknown',
                },
        };
    }

    // TODO: Prefer using materialized row count once available.
    const smallestMatchingDef = matchedDefs.reduce((best, current) => {
        if (current.dimensions.length !== best.dimensions.length) {
            return current.dimensions.length < best.dimensions.length
                ? current
                : best;
        }
        return current.metrics.length < best.metrics.length ? current : best;
    });

    return {
        hit: true,
        preAggregateName: smallestMatchingDef.name,
        miss: null,
    };
};
