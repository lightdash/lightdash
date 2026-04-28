import {
    MetricType,
    preAggregateUtils,
    type CompiledDimension,
    type CompiledMetric,
    type Explore,
    type FieldId,
    type PreAggregateDef,
} from '@lightdash/common';
import { assertMetricEligibleForPreAggregation } from './eligibility';

export const getDimensionsByReference = (sourceExplore: Explore) =>
    Object.values(sourceExplore.tables).reduce<
        Map<string, CompiledDimension[]>
    >((acc, table) => {
        Object.values(table.dimensions).forEach((dimension) => {
            preAggregateUtils
                .getDimensionReferences({
                    dimension,
                    baseTable: sourceExplore.baseTable,
                })
                .forEach((reference) => {
                    const existingDimensions = acc.get(reference) || [];
                    acc.set(reference, [...existingDimensions, dimension]);
                });
        });
        return acc;
    }, new Map<string, CompiledDimension[]>());

export const getSelectedDimension = ({
    dimensionsByReference,
    preAggregateDef,
    dimensionReference,
}: {
    dimensionsByReference: Map<string, CompiledDimension[]>;
    preAggregateDef: PreAggregateDef;
    dimensionReference: string;
}): CompiledDimension => {
    const candidates = dimensionsByReference.get(dimensionReference) || [];

    if (candidates.length === 0) {
        throw new Error(
            `Pre-aggregate "${preAggregateDef.name}" references unknown dimension "${dimensionReference}"`,
        );
    }

    const isTimeDimensionReference =
        !!preAggregateDef.timeDimension &&
        preAggregateUtils.getDimensionBaseName(candidates[0]) ===
            preAggregateDef.timeDimension;

    if (
        isTimeDimensionReference &&
        preAggregateDef.granularity &&
        preAggregateDef.timeDimension
    ) {
        const timeGranularityDimension = candidates.find(
            (dimension) =>
                preAggregateUtils.getDimensionBaseName(dimension) ===
                    preAggregateDef.timeDimension &&
                dimension.timeInterval === preAggregateDef.granularity,
        );

        if (!timeGranularityDimension) {
            throw new Error(
                `Pre-aggregate "${preAggregateDef.name}" is missing time granularity field "${preAggregateDef.timeDimension}_${preAggregateDef.granularity.toLowerCase()}"`,
            );
        }

        return timeGranularityDimension;
    }

    return (
        candidates.find((dimension) => !dimension.timeInterval) ?? candidates[0]
    );
};

export const getMetricReferenceForDef = ({
    metric,
    baseTable,
}: {
    metric: CompiledMetric;
    baseTable: string;
}): string =>
    metric.table === baseTable ? metric.name : `${metric.table}.${metric.name}`;

const formatMissingDependentMetricsError = ({
    preAggregateName,
    metric,
    missingMetrics,
    baseTable,
}: {
    preAggregateName: string;
    metric: CompiledMetric;
    missingMetrics: CompiledMetric[];
    baseTable: string;
}): string =>
    `Pre-aggregate "${preAggregateName}" metric "${getMetricReferenceForDef({
        metric,
        baseTable,
    })}" requires dependent metrics ${missingMetrics
        .map(
            (missingMetric) =>
                `"${getMetricReferenceForDef({
                    metric: missingMetric,
                    baseTable,
                })}"`,
        )
        .join(', ')} to be included in the pre-aggregate definition.`;

type SelectedPreAggregateMetric = {
    fieldId: FieldId;
    metric: CompiledMetric;
};

export const selectPreAggregateMetrics = ({
    sourceExplore,
    preAggregateDef,
}: {
    sourceExplore: Explore;
    preAggregateDef: PreAggregateDef;
}): {
    metricsByReference: ReturnType<
        typeof preAggregateUtils.getMetricsByReference
    >;
    materializedMetrics: SelectedPreAggregateMetric[];
    derivedNumberMetrics: SelectedPreAggregateMetric[];
} => {
    const metricsByReference = preAggregateUtils.getMetricsByReference({
        tables: sourceExplore.tables,
        baseTable: sourceExplore.baseTable,
    });
    const allMetricsByFieldId = new Map<FieldId, CompiledMetric>(
        Array.from(metricsByReference.values()).map(({ fieldId, metric }) => [
            fieldId,
            metric,
        ]),
    );
    const selectedMetrics = Array.from(
        preAggregateDef.metrics
            .reduce<Map<FieldId, SelectedPreAggregateMetric>>(
                (acc, metricReference) => {
                    const metricLookup =
                        metricsByReference.get(metricReference);
                    if (!metricLookup) {
                        throw new Error(
                            `Pre-aggregate "${preAggregateDef.name}" references unknown metric "${metricReference}"`,
                        );
                    }

                    assertMetricEligibleForPreAggregation({
                        sourceExplore,
                        preAggregateDef,
                        metricReference,
                        metric: metricLookup.metric,
                    });

                    acc.set(metricLookup.fieldId, metricLookup);
                    return acc;
                },
                new Map<FieldId, SelectedPreAggregateMetric>(),
            )
            .values(),
    );
    const selectedMetricFieldIds = new Set(
        selectedMetrics.map(({ fieldId }) => fieldId),
    );
    const unsupportedMetrics: Array<{
        reference: string;
        metricType: MetricType;
    }> = [];
    const materializedMetrics: SelectedPreAggregateMetric[] = [];
    const derivedNumberMetrics: SelectedPreAggregateMetric[] = [];

    selectedMetrics.forEach(({ fieldId, metric }) => {
        const metricReference = getMetricReferenceForDef({
            metric,
            baseTable: sourceExplore.baseTable,
        });

        if (metric.type === MetricType.NUMBER) {
            const dependencies =
                preAggregateUtils.analyzePreAggregateNumberMetricDependencies({
                    metric,
                    tables: sourceExplore.tables,
                });

            if (!dependencies.isValid) {
                unsupportedMetrics.push({
                    reference: metricReference,
                    metricType: metric.type,
                });
                return;
            }

            const missingMetrics =
                dependencies.transitiveReferencedMetricFieldIds
                    .filter(
                        (dependencyFieldId) =>
                            !selectedMetricFieldIds.has(dependencyFieldId),
                    )
                    .map((dependencyFieldId) =>
                        allMetricsByFieldId.get(dependencyFieldId),
                    )
                    .filter(
                        (
                            dependencyMetric,
                        ): dependencyMetric is CompiledMetric =>
                            dependencyMetric !== undefined,
                    );

            if (missingMetrics.length > 0) {
                throw new Error(
                    formatMissingDependentMetricsError({
                        preAggregateName: preAggregateDef.name,
                        metric,
                        missingMetrics,
                        baseTable: sourceExplore.baseTable,
                    }),
                );
            }

            derivedNumberMetrics.push({ fieldId, metric });
            return;
        }

        if (!preAggregateUtils.isSupportedMetricType(metric.type)) {
            unsupportedMetrics.push({
                reference: metricReference,
                metricType: metric.type,
            });
            return;
        }

        materializedMetrics.push({ fieldId, metric });
    });

    if (unsupportedMetrics.length > 0) {
        throw new Error(
            `Pre-aggregate "${
                preAggregateDef.name
            }" references unsupported metrics: ${unsupportedMetrics
                .map(
                    ({ reference, metricType }) =>
                        `"${reference}" (${metricType})`,
                )
                .join(
                    ', ',
                )}. Supported metric types: ${preAggregateUtils.supportedMetricTypes.join(
                ', ',
            )}`,
        );
    }

    return {
        metricsByReference,
        materializedMetrics,
        derivedNumberMetrics,
    };
};
