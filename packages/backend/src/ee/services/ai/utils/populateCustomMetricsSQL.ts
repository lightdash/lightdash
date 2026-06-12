import {
    AdditionalMetric,
    AiAgentValidatorError,
    buildPopAdditionalMetric,
    CustomMetricBaseTransformed,
    getFields,
    getItemId,
    isPeriodComparisonCustomMetric,
    isPeriodOverPeriodAdditionalMetric,
    type Explore,
    type Metric,
    type PeriodComparisonCustomMetric,
    type TransformedCustomMetric,
} from '@lightdash/common';

/**
 * Populates SQL for a single custom metric from explore fields.
 * Custom metric SQL is always derived server-side from the explore — any
 * caller-supplied SQL (e.g. from model output or stored artifacts) is
 * discarded so the model can never inject raw SQL into the warehouse query.
 */
export function populateCustomMetricSQL(
    metric:
        | CustomMetricBaseTransformed
        | Omit<AdditionalMetric, 'sql'>
        | AdditionalMetric,
    explore: Explore,
): AdditionalMetric | null {
    const exploreFields = getFields(explore);

    // Find the dimension field to get its SQL
    const dimensionField = exploreFields.find(
        (field) =>
            metric.baseDimensionName &&
            getItemId(field) ===
                getItemId({
                    table: metric.table,
                    name: metric.baseDimensionName,
                }),
    );

    if (!dimensionField) {
        return null;
    }

    return {
        ...metric,
        sql: dimensionField.sql,
    };
}

/**
 * Populates SQL for custom metrics from explore fields
 * This is needed because custom metrics are stored without SQL for security,
 * but we need to populate it from the explore when executing queries
 */
export function populateCustomMetricsSQL(
    customMetrics:
        | (
              | TransformedCustomMetric
              | CustomMetricBaseTransformed
              | Omit<AdditionalMetric, 'sql'>
              | AdditionalMetric
          )[]
        | null
        | undefined,
    explore: Explore,
): AdditionalMetric[] {
    if (!customMetrics || customMetrics.length === 0) {
        return [];
    }

    const popAdditionalMetrics = customMetrics.filter(
        isPeriodOverPeriodAdditionalMetric,
    );

    const aggregationMetrics = customMetrics.filter(
        (
            metric,
        ): metric is
            | CustomMetricBaseTransformed
            | Omit<AdditionalMetric, 'sql'>
            | AdditionalMetric =>
            !isPeriodComparisonCustomMetric(
                metric as TransformedCustomMetric,
            ) && !isPeriodOverPeriodAdditionalMetric(metric),
    );

    const populatedAggregationMetrics = aggregationMetrics.reduce<
        AdditionalMetric[]
    >((acc, metric) => {
        const populatedMetric = populateCustomMetricSQL(metric, explore);
        if (populatedMetric) {
            acc.push(populatedMetric);
        }
        return acc;
    }, []);

    const periodComparisonMetrics = customMetrics.filter(
        (metric): metric is PeriodComparisonCustomMetric =>
            isPeriodComparisonCustomMetric(metric as TransformedCustomMetric),
    );

    if (
        periodComparisonMetrics.length === 0 &&
        popAdditionalMetrics.length === 0
    ) {
        return populatedAggregationMetrics;
    }

    const realMetricsById = new Map<string, Metric>();
    for (const table of Object.values(explore.tables)) {
        for (const metric of Object.values(table.metrics)) {
            realMetricsById.set(getItemId(metric), metric);
        }
    }

    const customMetricsById = new Map<string, AdditionalMetric>();
    for (const metric of populatedAggregationMetrics) {
        customMetricsById.set(getItemId(metric), metric);
    }

    // PoP additional metrics (e.g. from stored artifacts) keep their identity —
    // their id is referenced by the query and chart config — but their SQL is
    // re-derived from the base metric rather than trusted from the input.
    const populatedPopAdditionalMetrics = popAdditionalMetrics.map((metric) => {
        const baseMetric =
            realMetricsById.get(metric.baseMetricId) ??
            customMetricsById.get(metric.baseMetricId);

        if (!baseMetric) {
            throw new AiAgentValidatorError(
                `additionalMetrics period-over-period baseMetricId "${metric.baseMetricId}" is not a metric in this query. It must be a metric in the explore or defined as an aggregation custom metric.`,
            );
        }

        return { ...metric, sql: baseMetric.sql };
    });

    const populatedPopMetrics: AdditionalMetric[] = [];
    const seenMetricIds = new Set<string>(
        populatedPopAdditionalMetrics.map(getItemId),
    );

    for (const metric of periodComparisonMetrics) {
        const baseMetric =
            realMetricsById.get(metric.baseMetricId) ??
            customMetricsById.get(metric.baseMetricId);

        if (!baseMetric) {
            throw new AiAgentValidatorError(
                `customMetrics periodComparison baseMetricId "${metric.baseMetricId}" is not a metric in this query. It must be in queryConfig.metrics or defined as an aggregation custom metric.`,
            );
        }

        const { additionalMetric, metricId } = buildPopAdditionalMetric({
            metric: {
                table: baseMetric.table,
                name: baseMetric.name,
                label: baseMetric.label ?? baseMetric.name,
                description: baseMetric.description,
                type: baseMetric.type,
                sql: baseMetric.sql,
                round: baseMetric.round,
                compact: baseMetric.compact,
                format: baseMetric.format,
                formatOptions: baseMetric.formatOptions,
            },
            timeDimensionId: metric.timeDimensionId,
            granularity: metric.granularity,
            periodOffset: metric.periodOffset,
        });

        if (!seenMetricIds.has(metricId)) {
            seenMetricIds.add(metricId);
            populatedPopMetrics.push(additionalMetric);
        }
    }

    return [
        ...populatedAggregationMetrics,
        ...populatedPopAdditionalMetrics,
        ...populatedPopMetrics,
    ];
}

export const getPopMetricIdsByBaseMetricId = (
    additionalMetrics: AdditionalMetric[],
): Map<string, string[]> => {
    const popMetricIdsByBase = new Map<string, string[]>();

    for (const additionalMetric of additionalMetrics) {
        if (isPeriodOverPeriodAdditionalMetric(additionalMetric)) {
            const metricId = getItemId(additionalMetric);
            const existing = popMetricIdsByBase.get(
                additionalMetric.baseMetricId,
            );

            if (existing) {
                existing.push(metricId);
            } else {
                popMetricIdsByBase.set(additionalMetric.baseMetricId, [
                    metricId,
                ]);
            }
        }
    }

    return popMetricIdsByBase;
};

export const expandMetricsWithPopAdditionalMetrics = (
    metricIds: readonly string[] | null | undefined,
    additionalMetrics: AdditionalMetric[],
): string[] => {
    if (!metricIds) return [];

    const popMetricIdsByBase = getPopMetricIdsByBaseMetricId(additionalMetrics);
    // Idempotent: ids already selected (e.g. chart-as-code metric queries
    // persist PoP ids pre-expanded) are not inserted a second time.
    const selectedMetricIds = new Set(metricIds);
    return metricIds.flatMap((metricId) => [
        metricId,
        ...(popMetricIdsByBase.get(metricId) ?? []).filter(
            (popMetricId) => !selectedMetricIds.has(popMetricId),
        ),
    ]);
};
