import {
    isMetric,
    isTableCalculation,
    MetricType,
    type FieldId,
    type ItemsMap,
    type Metric,
} from '../types/field';
import {
    isMergeMetricSource,
    MergeJoinType,
    type MergeQuery,
} from '../types/mergeQuery';
import assertUnreachable from './assertUnreachable';
import { getFilterRulesFromGroup } from './filters';
import { getItemLabelWithoutTableName } from './item';

export type MergeTotalAggregation = 'sum' | 'min' | 'max';

/**
 * How a merged column is totalled from the merged rows, or null when no
 * aggregate over those rows is exact. Every source value appears once per
 * key, because fan-out is refused, so sums, counts, minimums and maximums
 * add up; an average of averages or a count of distinct counts does not.
 */
export const getMergeTotalAggregation = (
    item: ItemsMap[string] | undefined,
    /** The column repeats on every matching row, so no sum over rows is exact. */
    repeated = false,
): MergeTotalAggregation | null => {
    if (!item || !isMetric(item) || repeated) return null;
    const { type } = item;
    switch (type) {
        case MetricType.SUM:
        case MetricType.COUNT:
            return 'sum';
        case MetricType.MIN:
            return 'min';
        case MetricType.MAX:
            return 'max';
        case MetricType.AVERAGE:
        case MetricType.AVERAGE_DISTINCT:
        case MetricType.COUNT_DISTINCT:
        case MetricType.SUM_DISTINCT:
        case MetricType.MEDIAN:
        case MetricType.PERCENTILE:
        case MetricType.NUMBER:
        case MetricType.PERCENT_OF_PREVIOUS:
        case MetricType.PERCENT_OF_TOTAL:
        case MetricType.RUNNING_TOTAL:
        case MetricType.STRING:
        case MetricType.DATE:
        case MetricType.TIMESTAMP:
        case MetricType.BOOLEAN:
            return null;
        default:
            return assertUnreachable(type, `Unknown metric type`);
    }
};

/** Why a source's own query cannot stand in for the total of the rows shown. */
export type MergeSourceTotalBlocker =
    | {
          kind: 'joinDropsRows';
          joinType: MergeJoinType.LEFT | MergeJoinType.INNER;
      }
    /** A filter on a metric or table calculation applies after aggregation. */
    | { kind: 'postAggregationFilters' }
    /** A referenced result, or an id no source carries. */
    | { kind: 'noSourceQuery' };

/**
 * A source's own query totals the rows shown when the join keeps every one
 * of its rows and the query collapses to one row: a filter on a metric or
 * table calculation applies after aggregation, so a collapsed query cannot
 * honour it.
 */
export const getMergeSourceTotalBlocker = (
    mergeQuery: Pick<MergeQuery, 'joinType' | 'sources'>,
    sourceId: string,
): MergeSourceTotalBlocker | null => {
    const source = mergeQuery.sources.find(({ id }) => id === sourceId);
    if (!source || !isMergeMetricSource(source)) {
        return { kind: 'noSourceQuery' };
    }
    switch (mergeQuery.joinType) {
        case MergeJoinType.FULL:
            break;
        case MergeJoinType.LEFT:
            if (mergeQuery.sources[0]?.id !== sourceId) {
                return { kind: 'joinDropsRows', joinType: MergeJoinType.LEFT };
            }
            break;
        case MergeJoinType.INNER:
            return { kind: 'joinDropsRows', joinType: MergeJoinType.INNER };
        default:
            return assertUnreachable(mergeQuery.joinType, 'Unknown join type');
    }
    const { filters } = source.metricQuery;
    const postAggregationRules = [
        ...getFilterRulesFromGroup(filters.metrics),
        ...getFilterRulesFromGroup(filters.tableCalculations),
    ];
    return postAggregationRules.length > 0
        ? { kind: 'postAggregationFilters' }
        : null;
};

/** Where a merged column's total comes from. */
export type MergeColumnTotal =
    /** An exact aggregate over the merged rows. */
    | { from: 'mergedRows'; aggregation: MergeTotalAggregation }
    /** The column's own query collapsed to one row; the join keeps every row of it. */
    | {
          from: 'sourceQuery';
          sourceId: string;
          sourceFieldId: FieldId;
          sourceLabel: string;
      }
    | { from: null; reason: string };

const describeMetricType = (type: MetricType): string => {
    switch (type) {
        case MetricType.AVERAGE:
        case MetricType.AVERAGE_DISTINCT:
            return 'an average';
        case MetricType.COUNT_DISTINCT:
            return 'a distinct count';
        case MetricType.SUM_DISTINCT:
            return 'a distinct sum';
        case MetricType.MEDIAN:
            return 'a median';
        case MetricType.PERCENTILE:
            return 'a percentile';
        case MetricType.NUMBER:
            return 'a custom calculation';
        case MetricType.PERCENT_OF_PREVIOUS:
        case MetricType.PERCENT_OF_TOTAL:
        case MetricType.RUNNING_TOTAL:
            return 'relative to other rows';
        case MetricType.SUM:
        case MetricType.COUNT:
        case MetricType.MIN:
        case MetricType.MAX:
        case MetricType.STRING:
        case MetricType.DATE:
        case MetricType.TIMESTAMP:
        case MetricType.BOOLEAN:
            return 'not a sum, count, minimum or maximum';
        default:
            return assertUnreachable(type, `Unknown metric type`);
    }
};

const describeSourceTotalBlocker = (
    blocker: MergeSourceTotalBlocker,
    sourceLabel: string,
): string => {
    switch (blocker.kind) {
        case 'joinDropsRows':
            switch (blocker.joinType) {
                case MergeJoinType.INNER:
                    return `An inner join keeps only the keys both queries share, so the ${sourceLabel} query's own total would not match the rows shown; a full join would total it.`;
                case MergeJoinType.LEFT:
                    return `A left join keeps only the ${sourceLabel} rows that match the first query, so the ${sourceLabel} query's own total would not match the rows shown; a full join would total it.`;
                default:
                    return assertUnreachable(
                        blocker.joinType,
                        'Unknown join type',
                    );
            }
        case 'postAggregationFilters':
            return `The ${sourceLabel} query filters on a metric or table calculation, which cannot be applied once its rows are collapsed to a total.`;
        case 'noSourceQuery':
            return `${sourceLabel} is a saved result, so there is no query to total.`;
        default:
            return assertUnreachable(blocker, 'Unknown source total blocker');
    }
};

/** Why a merged column has no total, in the user's terms. */
export const getMergeTotalUnavailableReason = ({
    item,
    repeated,
    blocker,
}: {
    item: Metric;
    repeated: boolean;
    blocker: MergeSourceTotalBlocker;
}): string => {
    const label = getItemLabelWithoutTableName(item);
    const why = repeated
        ? `${label} repeats on every matching row of the other query, so a total over the merged rows would count it more than once.`
        : `${label} is ${describeMetricType(item.type)}, and over merged rows only sums, counts, minimums and maximums are exact.`;
    return `${why} ${describeSourceTotalBlocker(blocker, item.tableLabel)}`;
};

/**
 * A merged metric's total: over the merged rows when an aggregate over them
 * is exact, from its own query when the join keeps every row of that query,
 * or nowhere. A merged metric is attributed to its source by table, and
 * named by the field it came from.
 */
export const getMergeColumnTotal = (
    item: Metric,
    mergeQuery: Pick<MergeQuery, 'joinType' | 'sources'>,
): MergeColumnTotal => {
    const source = mergeQuery.sources.find(({ id }) => id === item.table);
    const repeated = source?.repeatValues === true;
    const aggregation = getMergeTotalAggregation(item, repeated);
    if (aggregation !== null) return { from: 'mergedRows', aggregation };
    const blocker = getMergeSourceTotalBlocker(mergeQuery, item.table);
    if (blocker === null) {
        return {
            from: 'sourceQuery',
            sourceId: item.table,
            sourceFieldId: item.name,
            sourceLabel: item.tableLabel,
        };
    }
    return {
        from: null,
        reason: getMergeTotalUnavailableReason({ item, repeated, blocker }),
    };
};

/**
 * The total of each merged value column, keyed by field id. Join keys are
 * dimensions and have none; a calculation over the merged result is not
 * re-run over a totals row.
 */
export const getMergeColumnTotals = ({
    mergeQuery,
    fieldIds,
    itemsMap,
}: {
    mergeQuery: Pick<MergeQuery, 'joinType' | 'sources'>;
    fieldIds: FieldId[];
    itemsMap: ItemsMap;
}): Record<FieldId, MergeColumnTotal> =>
    Object.fromEntries(
        fieldIds.flatMap((fieldId): [FieldId, MergeColumnTotal][] => {
            const item = itemsMap[fieldId];
            if (item && isMetric(item)) {
                return [[fieldId, getMergeColumnTotal(item, mergeQuery)]];
            }
            if (item && isTableCalculation(item)) {
                return [
                    [
                        fieldId,
                        {
                            from: null,
                            reason: `${item.displayName} is calculated over the merged rows, so it has no total.`,
                        },
                    ],
                ];
            }
            return [];
        }),
    );
