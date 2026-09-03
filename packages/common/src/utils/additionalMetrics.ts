import { getReferencedDimensionCaseInsensitive } from '../compiler/referenceLookup';
import { convertColumnMetric } from '../types/dbt';
import { type CompiledTable, type Explore } from '../types/explore';
import {
    DimensionType,
    getMinMaxBaseDimensionMetadata,
    MetricType,
    type Metric,
} from '../types/field';
import {
    isPeriodOverPeriodAdditionalMetric,
    type AdditionalMetric,
} from '../types/metricQuery';
import { getItemId } from './item';

type ConvertAdditionalMetricArgs = {
    additionalMetric: AdditionalMetric;
    table: CompiledTable;
};

export const convertAdditionalMetric = ({
    additionalMetric,
    table,
}: ConvertAdditionalMetricArgs): Metric => {
    const metric = convertColumnMetric({
        modelName: table.name,
        dimensionSql: additionalMetric.sql,
        name: additionalMetric.name,
        metric: { ...additionalMetric, filters: undefined },
        tableLabel: table.label,
    });

    const popMetadata = isPeriodOverPeriodAdditionalMetric(additionalMetric)
        ? additionalMetric
        : undefined;

    // A MIN/MAX custom metric carries its base dimension's temporal type,
    // resolved from baseDimensionName (the UI builds `sql` from that dimension).
    const baseDimension = additionalMetric.baseDimensionName
        ? table.dimensions[additionalMetric.baseDimensionName]
        : undefined;
    const baseDimensionMetadata = getMinMaxBaseDimensionMetadata(
        additionalMetric.type,
        baseDimension && {
            type: baseDimension.type,
            timeInterval: baseDimension.timeInterval,
        },
    );

    return {
        ...metric,
        ...baseDimensionMetadata,
        ...(additionalMetric.filters && {
            filters: additionalMetric.filters,
        }),
        ...(additionalMetric.formatOptions && {
            formatOptions: additionalMetric.formatOptions,
        }),
        ...(popMetadata ?? {}),
    };
};

/**
 * Get the custom metric types for a given dimension type
 * @param type
 * @returns
 */
export const getCustomMetricType = (type: DimensionType): MetricType[] => {
    switch (type) {
        case DimensionType.STRING:
        case DimensionType.TIMESTAMP:
        case DimensionType.DATE:
            return [
                MetricType.COUNT_DISTINCT,
                MetricType.COUNT,
                MetricType.MIN,
                MetricType.MAX,
            ];
        case DimensionType.NUMBER:
            return [
                MetricType.MIN,
                MetricType.MAX,
                MetricType.SUM,
                MetricType.PERCENTILE,
                MetricType.MEDIAN,
                MetricType.AVERAGE,
                MetricType.COUNT_DISTINCT,
                MetricType.COUNT,
            ];
        case DimensionType.BOOLEAN:
            return [MetricType.COUNT_DISTINCT, MetricType.COUNT];
        default:
            return [];
    }
};

/**
 * Merges a chart's custom metrics into a dashboard registry, keyed by
 * `getItemId()`. Existing registry definitions win (frozen once saved) and
 * system-generated metrics (e.g. period-over-period) are skipped. Returns the
 * original array identity when nothing was added.
 */
export const mergeDashboardCustomMetrics = (
    registry: AdditionalMetric[],
    fromChart: AdditionalMetric[],
): AdditionalMetric[] => {
    const seenIds = new Set(registry.map(getItemId));
    const additions = fromChart.filter((metric) => {
        if (metric.generationType !== undefined) return false;
        const id = getItemId(metric);
        if (seenIds.has(id)) return false;
        seenIds.add(id);
        return true;
    });

    return additions.length === 0 ? registry : [...registry, ...additions];
};

// Accepts `table.field`, bare `field` (owning table), or a `${...}`-wrapped
// ref. Resolution is case-insensitive to match the compiler: compiled
// timeframe dimension keys are uppercased (e.g. order_date_DAY, #5998).
const dimensionRefExistsInExplore = (
    ref: string,
    explore: Explore,
    owningTable: string,
): boolean => {
    const strippedRef = ref.replace(/^\$\{(.+)\}$/, '$1');
    const [refTable, refName] = strippedRef.includes('.')
        ? strippedRef.split('.')
        : [owningTable, strippedRef];
    return (
        getReferencedDimensionCaseInsensitive(
            refTable,
            refName,
            explore.tables,
        ) !== undefined
    );
};

const isMetricCompatibleWithExplore = (
    metric: AdditionalMetric,
    explore: Explore,
): boolean => {
    const table = explore.tables[metric.table];
    if (!table) return false;
    if (
        metric.baseDimensionName &&
        !table.dimensions[metric.baseDimensionName]
    ) {
        return false;
    }
    if (metric.baseMetricName && !table.metrics[metric.baseMetricName]) {
        return false;
    }
    if (
        metric.filters?.some(
            (filter) =>
                !dimensionRefExistsInExplore(
                    filter.target.fieldRef,
                    explore,
                    metric.table,
                ),
        )
    ) {
        return false;
    }
    if (
        metric.distinctKeys?.some(
            (keyRef) =>
                !dimensionRefExistsInExplore(keyRef, explore, metric.table),
        )
    ) {
        return false;
    }
    return true;
};

/**
 * Registry metrics usable in the given compiled Explore: the owning table and
 * every field the metric depends on must exist. Incompatible metrics must never
 * execute as partial definitions.
 */
export const getCompatibleDashboardMetrics = (
    registry: AdditionalMetric[],
    explore: Explore | undefined,
): AdditionalMetric[] => {
    if (!explore) return [];
    return registry.filter((metric) =>
        isMetricCompatibleWithExplore(metric, explore),
    );
};
