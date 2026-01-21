import {
    getItemId,
    getMetricsMapFromTables,
    periodOverPeriodGranularityLabels,
    type AdditionalMetric,
    type Explore,
    type MetricQuery,
    type PeriodOverPeriodAdditionalMetric,
} from '@lightdash/common';

const POP_PREVIOUS_SUFFIX = '_previous';

const buildPeriodLabel = (
    periodOffset: number,
    granularityLabel: string,
): string =>
    periodOffset === 1
        ? `Previous ${granularityLabel.toLowerCase()}`
        : `${periodOffset} ${granularityLabel.toLowerCase()}s ago`;

type BuildPopAdditionalMetricsArgs = {
    metricQuery: MetricQuery;
    explore: Explore;
};

export const buildPopAdditionalMetrics = ({
    metricQuery,
    explore,
}: BuildPopAdditionalMetricsArgs): {
    popAdditionalMetrics: AdditionalMetric[];
} => {
    const { periodOverPeriod } = metricQuery;
    if (!periodOverPeriod) {
        return { popAdditionalMetrics: [] };
    }

    const periodOffset = periodOverPeriod.periodOffset ?? 1;
    const granularityLabel =
        periodOverPeriodGranularityLabels[periodOverPeriod.granularity];
    const periodLabel = buildPeriodLabel(periodOffset, granularityLabel);

    const existingAdditionalMetrics = metricQuery.additionalMetrics ?? [];
    const additionalMetricsById = new Map<string, AdditionalMetric>(
        existingAdditionalMetrics.map((m) => [getItemId(m), m]),
    );
    const exploreMetricsById = getMetricsMapFromTables(explore.tables);

    const popAdditionalMetrics: AdditionalMetric[] = [];

    metricQuery.metrics.forEach((baseMetricId) => {
        // Avoid generating PoP-of-PoP if someone already included a previous metric in the query
        if (baseMetricId.endsWith(POP_PREVIOUS_SUFFIX)) return;

        const baseAdditionalMetric = additionalMetricsById.get(baseMetricId);
        const baseExploreMetric = exploreMetricsById[baseMetricId];

        if (!baseAdditionalMetric && !baseExploreMetric) return;

        const popMetricId = `${baseMetricId}${POP_PREVIOUS_SUFFIX}`;

        // If it already exists (e.g. legacy persisted custom metric), don’t create a duplicate
        if (
            additionalMetricsById.has(popMetricId) ||
            exploreMetricsById[popMetricId]
        ) {
            return;
        }

        const baseTable = baseAdditionalMetric?.table ?? baseExploreMetric!.table;
        const baseName = baseAdditionalMetric?.name ?? baseExploreMetric!.name;
        const baseLabel = baseAdditionalMetric?.label ?? baseExploreMetric!.label;

        const popAdditionalMetric: PeriodOverPeriodAdditionalMetric = {
            table: baseTable,
            name: `${baseName}${POP_PREVIOUS_SUFFIX}`,
            label: `${baseLabel} (${periodLabel})`,
            description:
                baseAdditionalMetric?.description ??
                baseExploreMetric?.description ??
                undefined,
            type: baseAdditionalMetric?.type ?? baseExploreMetric!.type,
            sql: baseAdditionalMetric?.sql ?? baseExploreMetric!.sql,
            // Keep UX consistent: PoP previous is auto-added, not a user-created custom metric
            hidden: true,
            round: baseExploreMetric?.round ?? baseAdditionalMetric?.round,
            compact: baseExploreMetric?.compact ?? baseAdditionalMetric?.compact,
            format: baseExploreMetric?.format ?? baseAdditionalMetric?.format,
            baseDimensionName: baseAdditionalMetric?.baseDimensionName,
            uuid: null,
            percentile:
                baseExploreMetric?.percentile ?? baseAdditionalMetric?.percentile,
            formatOptions:
                baseExploreMetric?.formatOptions ??
                baseAdditionalMetric?.formatOptions,
            generatedBy: 'periodOverPeriod',
            baseMetricId,
        };

        popAdditionalMetrics.push(popAdditionalMetric);
    });

    return { popAdditionalMetrics };
};

export const addPopAdditionalMetricsToMetricQuery = ({
    metricQuery,
    explore,
}: BuildPopAdditionalMetricsArgs): {
    metricQuery: MetricQuery;
} => {
    const { popAdditionalMetrics } = buildPopAdditionalMetrics({
        metricQuery,
        explore,
    });

    if (popAdditionalMetrics.length === 0) {
        return {
            metricQuery: {
                ...metricQuery,
            },
        };
    }

    const existingAdditionalMetrics = metricQuery.additionalMetrics ?? [];
    const existingAdditionalMetricIds = new Set(
        existingAdditionalMetrics.map(getItemId),
    );

    const mergedAdditionalMetrics = [
        ...existingAdditionalMetrics,
        ...popAdditionalMetrics.filter(
            (m) => !existingAdditionalMetricIds.has(getItemId(m)),
        ),
    ];

    return {
        metricQuery: {
            ...metricQuery,
            additionalMetrics: mergedAdditionalMetrics,
        },
    };
};

export const addPopAdditionalMetricsToMetricQueryForResponse = ({
    metricQuery,
    explore,
}: BuildPopAdditionalMetricsArgs): {
    metricQuery: MetricQuery;
} => {
    const { popAdditionalMetrics } = buildPopAdditionalMetrics({
        metricQuery,
        explore,
    });

    if (popAdditionalMetrics.length === 0) {
        return {
            metricQuery,
        };
    }

    const existingAdditionalMetrics = metricQuery.additionalMetrics ?? [];
    const existingAdditionalMetricIds = new Set(
        existingAdditionalMetrics.map(getItemId),
    );
    const mergedAdditionalMetrics = [
        ...existingAdditionalMetrics,
        ...popAdditionalMetrics.filter(
            (m) => !existingAdditionalMetricIds.has(getItemId(m)),
        ),
    ];

    const existingMetricIds = new Set(metricQuery.metrics);
    const mergedMetrics = [
        ...metricQuery.metrics,
        ...popAdditionalMetrics
            .map(getItemId)
            .filter((id) => !existingMetricIds.has(id)),
    ];

    return {
        metricQuery: {
            ...metricQuery,
            metrics: mergedMetrics,
            additionalMetrics: mergedAdditionalMetrics,
        },
    };
};

