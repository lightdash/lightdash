import {
    assertUnreachable,
    convertFieldRefToFieldId,
    getItemId,
    getPreAggregateMetricComponentColumnName,
    MetricType,
    PreAggregateMetricRepresentationKind,
    preAggregateUtils,
    type AdditionalMetric,
    type CompiledDimension,
    type CompiledMetric,
    type Explore,
    type FieldId,
    type FilterRule,
    type MaterializationMetricComponent,
    type MaterializationMetricQueryPayload,
    type MetricQuery,
    type PreAggregateDef,
} from '@lightdash/common';

const getDimensionsByReference = (sourceExplore: Explore) =>
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

const getAverageMetricComponents = (
    metric: CompiledMetric,
): [AdditionalMetric, AdditionalMetric] => [
    {
        name: `${metric.name}__sum`,
        table: metric.table,
        type: MetricType.SUM,
        sql: metric.sql,
        hidden: true,
        ...(metric.filters ? { filters: metric.filters } : {}),
    },
    {
        name: `${metric.name}__count`,
        table: metric.table,
        type: MetricType.COUNT,
        sql: metric.sql,
        hidden: true,
        ...(metric.filters ? { filters: metric.filters } : {}),
    },
];

const assertUniqueMetricFieldId = ({
    preAggregateName,
    fieldId,
    selectedMetricFieldIds,
}: {
    preAggregateName: string;
    fieldId: FieldId;
    selectedMetricFieldIds: Set<FieldId>;
}) => {
    if (selectedMetricFieldIds.has(fieldId)) {
        throw new Error(
            `Pre-aggregate "${preAggregateName}" generates duplicate materialization metric field ID "${fieldId}"`,
        );
    }

    selectedMetricFieldIds.add(fieldId);
};

const getDimensionFieldId = ({
    sourceExplore,
    preAggregateDef,
    dimensionReference,
}: {
    sourceExplore: Explore;
    preAggregateDef: PreAggregateDef;
    dimensionReference: string;
}): FieldId => {
    const dimensionsByReference = getDimensionsByReference(sourceExplore);
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

        return getItemId(timeGranularityDimension);
    }

    const exactBaseDimension = candidates.find(
        (dimension) => !dimension.timeInterval,
    );

    return getItemId(exactBaseDimension ?? candidates[0]);
};

const hasTimeDimensionReference = ({
    sourceExplore,
    preAggregateDef,
}: {
    sourceExplore: Explore;
    preAggregateDef: PreAggregateDef;
}): boolean => {
    if (!preAggregateDef.timeDimension) {
        return false;
    }

    const dimensionsByReference = getDimensionsByReference(sourceExplore);

    return preAggregateDef.dimensions.some((dimensionReference) => {
        const candidates = dimensionsByReference.get(dimensionReference) || [];

        return candidates.some(
            (dimension) =>
                preAggregateUtils.getDimensionBaseName(dimension) ===
                preAggregateDef.timeDimension,
        );
    });
};

type MaterializationConfig = {
    maxRows: number | null;
};

const getPreAggregateDimensionFilters = ({
    sourceExplore,
    preAggregateDef,
}: {
    sourceExplore: Explore;
    preAggregateDef: PreAggregateDef;
}): MetricQuery['filters']['dimensions'] | undefined => {
    if (!preAggregateDef.filters || preAggregateDef.filters.length === 0) {
        return undefined;
    }

    return {
        id: 'pre-aggregate-filters',
        and: preAggregateDef.filters.map<FilterRule>((filter) => ({
            id: filter.id,
            target: {
                fieldId: convertFieldRefToFieldId(
                    filter.target.fieldRef,
                    sourceExplore.baseTable,
                ),
            },
            operator: filter.operator,
            values: filter.values,
            ...(filter.settings ? { settings: filter.settings } : {}),
            ...(filter.required !== undefined
                ? { required: filter.required }
                : {}),
            ...(filter.disabled !== undefined
                ? { disabled: filter.disabled }
                : {}),
        })),
    };
};

export const buildMaterializationMetricQuery = async ({
    sourceExplore,
    preAggregateDef,
    materializationConfig,
}: {
    sourceExplore: Explore;
    preAggregateDef: PreAggregateDef;
    materializationConfig: MaterializationConfig;
}): Promise<MaterializationMetricQueryPayload> => {
    const sqlFilterCompatibility =
        await preAggregateUtils.getPreAggregateSqlFilterCompatibility({
            explore: sourceExplore,
            preAggregateDef,
        });
    if (!sqlFilterCompatibility.supported) {
        throw new Error(
            preAggregateUtils.formatPreAggregateSqlFilterCompatibilityError({
                preAggregateName: preAggregateDef.name,
                compatibility: sqlFilterCompatibility,
            }),
        );
    }

    const metricsByReference = preAggregateUtils.getMetricsByReference({
        tables: sourceExplore.tables,
        baseTable: sourceExplore.baseTable,
    });
    const dimensionReferences = [...preAggregateDef.dimensions];

    if (
        preAggregateDef.timeDimension &&
        preAggregateDef.granularity &&
        !hasTimeDimensionReference({ sourceExplore, preAggregateDef })
    ) {
        dimensionReferences.push(preAggregateDef.timeDimension);
    }

    const dimensions = Array.from(
        new Set(
            dimensionReferences.map((dimensionReference) =>
                getDimensionFieldId({
                    sourceExplore,
                    preAggregateDef,
                    dimensionReference,
                }),
            ),
        ),
    );

    const timeDimensionFieldId =
        preAggregateDef.timeDimension && preAggregateDef.granularity
            ? getDimensionFieldId({
                  sourceExplore,
                  preAggregateDef,
                  dimensionReference: preAggregateDef.timeDimension,
              })
            : null;

    const metricsByFieldId = preAggregateDef.metrics.reduce<
        Map<FieldId, CompiledMetric>
    >((acc, metricReference) => {
        const metricLookup = metricsByReference.get(metricReference);

        if (!metricLookup) {
            throw new Error(
                `Pre-aggregate "${preAggregateDef.name}" references unknown metric "${metricReference}"`,
            );
        }

        acc.set(metricLookup.fieldId, metricLookup.metric);

        return acc;
    }, new Map<FieldId, CompiledMetric>());

    const selectedMetricFieldIds = new Set<FieldId>();
    const additionalMetrics: AdditionalMetric[] = [];
    const metricComponents = Array.from(metricsByFieldId.entries()).reduce<
        Record<string, MaterializationMetricComponent[]>
    >((acc, [metricFieldId, metric]) => {
        const representation = preAggregateUtils.getMetricRepresentation(
            metric.type,
        );

        switch (representation.kind) {
            case PreAggregateMetricRepresentationKind.DECOMPOSED: {
                const [sumMetric, countMetric] =
                    getAverageMetricComponents(metric);
                const sumFieldId = getItemId(sumMetric);
                const countFieldId = getItemId(countMetric);

                representation.components.forEach((component, index) => {
                    const expectedFieldId =
                        getPreAggregateMetricComponentColumnName(
                            metricFieldId,
                            component,
                        );
                    const actualFieldId =
                        index === 0 ? sumFieldId : countFieldId;
                    if (actualFieldId !== expectedFieldId) {
                        throw new Error(
                            `Pre-aggregate "${preAggregateDef.name}" generated unexpected AVG component field ID "${actualFieldId}" for metric "${metricFieldId}"`,
                        );
                    }
                });

                assertUniqueMetricFieldId({
                    preAggregateName: preAggregateDef.name,
                    fieldId: sumFieldId,
                    selectedMetricFieldIds,
                });
                assertUniqueMetricFieldId({
                    preAggregateName: preAggregateDef.name,
                    fieldId: countFieldId,
                    selectedMetricFieldIds,
                });

                additionalMetrics.push(sumMetric, countMetric);

                acc[metricFieldId] = [
                    {
                        componentFieldId: sumFieldId,
                        aggregation: MetricType.SUM,
                    },
                    {
                        componentFieldId: countFieldId,
                        aggregation: MetricType.SUM,
                    },
                ];

                return acc;
            }
            case PreAggregateMetricRepresentationKind.DIRECT:
                assertUniqueMetricFieldId({
                    preAggregateName: preAggregateDef.name,
                    fieldId: metricFieldId,
                    selectedMetricFieldIds,
                });

                acc[metricFieldId] = [
                    {
                        componentFieldId: metricFieldId,
                        aggregation: representation.metricType,
                    },
                ];

                return acc;
            case PreAggregateMetricRepresentationKind.UNSUPPORTED:
                throw new Error(
                    `Unsupported metric type "${metric.type}" for pre-aggregate materialization`,
                );
            default:
                return assertUnreachable(
                    representation,
                    `Unsupported pre-aggregate metric representation`,
                );
        }
    }, {});

    const metricFieldIds = Array.from(selectedMetricFieldIds);

    const SYSTEM_MAX_ROWS = 10_000_000;
    const resolvedMaxRows =
        preAggregateDef.maxRows ??
        materializationConfig.maxRows ??
        SYSTEM_MAX_ROWS;
    const dimensionFilters = getPreAggregateDimensionFilters({
        sourceExplore,
        preAggregateDef,
    });

    const metricQuery: MetricQuery = {
        exploreName: sourceExplore.name,
        dimensions,
        metrics: metricFieldIds,
        filters: dimensionFilters ? { dimensions: dimensionFilters } : {},
        sorts: [],
        limit: resolvedMaxRows,
        tableCalculations: [],
        ...(additionalMetrics.length > 0 ? { additionalMetrics } : {}),
    };

    return {
        metricQuery,
        metricComponents,
        timeDimensionFieldId,
        resolvedMaxRows,
    };
};
