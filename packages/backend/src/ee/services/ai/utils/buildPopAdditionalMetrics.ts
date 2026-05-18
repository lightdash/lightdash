import {
    AiAgentValidatorError,
    buildPopAdditionalMetric,
    getItemId,
    type AdditionalMetric,
    type Explore,
    type Metric,
    type PeriodComparison,
} from '@lightdash/common';

type Args = {
    periodComparisons: PeriodComparison[] | null;
    explore: Explore;
    customMetrics: AdditionalMetric[];
};

type Result = {
    popAdditionalMetrics: AdditionalMetric[];
    popMetricIdsByBase: Map<string, string[]>;
};

export function buildPopAdditionalMetricsFromAiInput({
    periodComparisons,
    explore,
    customMetrics,
}: Args): Result {
    if (!periodComparisons?.length) {
        return { popAdditionalMetrics: [], popMetricIdsByBase: new Map() };
    }

    const realMetricsById = new Map<string, Metric>();
    for (const table of Object.values(explore.tables)) {
        for (const metric of Object.values(table.metrics)) {
            realMetricsById.set(getItemId(metric), metric);
        }
    }
    const customByItemId = new Map<string, AdditionalMetric>();
    for (const cm of customMetrics) {
        customByItemId.set(getItemId(cm), cm);
    }

    const popAdditionalMetrics: AdditionalMetric[] = [];
    const seenMetricIds = new Set<string>();
    const popMetricIdsByBase = new Map<string, string[]>();

    for (const pc of periodComparisons) {
        const realBase = realMetricsById.get(pc.baseMetricId);
        const customBase = customByItemId.get(pc.baseMetricId);
        const base = realBase ?? customBase ?? null;

        if (!base) {
            throw new AiAgentValidatorError(
                `periodComparisons.baseMetricId "${pc.baseMetricId}" is not a metric in this query. It must be in queryConfig.metrics or defined in customMetrics.`,
            );
        }

        const { additionalMetric, metricId } = buildPopAdditionalMetric({
            metric: {
                table: base.table,
                name: base.name,
                label: base.label ?? base.name,
                description: base.description,
                type: base.type,
                sql: base.sql,
                round: base.round,
                compact: base.compact,
                format: base.format,
                formatOptions: base.formatOptions,
            },
            timeDimensionId: pc.timeDimensionId,
            granularity: pc.granularity,
            periodOffset: pc.periodOffset,
        });

        if (!seenMetricIds.has(metricId)) {
            seenMetricIds.add(metricId);
            popAdditionalMetrics.push(additionalMetric);
        }

        const existing = popMetricIdsByBase.get(pc.baseMetricId) ?? [];
        if (!existing.includes(metricId)) {
            existing.push(metricId);
            popMetricIdsByBase.set(pc.baseMetricId, existing);
        }
    }

    return { popAdditionalMetrics, popMetricIdsByBase };
}
