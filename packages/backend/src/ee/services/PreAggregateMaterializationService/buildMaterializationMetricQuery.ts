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
import { assertDimensionEligibleForDirectMaterialization } from '../../preAggregates/eligibility';
import {
    getDimensionsByReference,
    getSelectedDimension,
    selectPreAggregateMetrics,
} from '../../preAggregates/shared';

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
    dimension,
}: {
    dimension: CompiledDimension;
}): FieldId => getItemId(dimension);

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

export const buildMaterializationMetricQuery = ({
    sourceExplore,
    preAggregateDef,
    materializationConfig,
}: {
    sourceExplore: Explore;
    preAggregateDef: PreAggregateDef;
    materializationConfig: MaterializationConfig;
}): MaterializationMetricQueryPayload => {
    const dimensionsByReference = getDimensionsByReference(sourceExplore);
    const dimensionReferences = [...preAggregateDef.dimensions];
    const { materializedMetrics } = selectPreAggregateMetrics({
        sourceExplore,
        preAggregateDef,
    });

    if (
        preAggregateDef.timeDimension &&
        preAggregateDef.granularity &&
        !hasTimeDimensionReference({ sourceExplore, preAggregateDef })
    ) {
        dimensionReferences.push(preAggregateDef.timeDimension);
    }

    const resolveSelectedDimension = (
        dimensionReference: string,
    ): CompiledDimension => {
        const dimension = getSelectedDimension({
            dimensionsByReference,
            preAggregateDef,
            dimensionReference,
        });

        assertDimensionEligibleForDirectMaterialization({
            sourceExplore,
            preAggregateDef,
            dimensionReference,
            dimension,
        });

        return dimension;
    };

    const selectedDimensions = Array.from(
        new Map(
            dimensionReferences.map((dimensionReference) => [
                dimensionReference,
                resolveSelectedDimension(dimensionReference),
            ]),
        ).values(),
    );

    const dimensions = Array.from(
        new Set(
            selectedDimensions.map((dimension) =>
                getDimensionFieldId({
                    dimension,
                }),
            ),
        ),
    );

    const timeDimensionFieldId =
        preAggregateDef.timeDimension && preAggregateDef.granularity
            ? getDimensionFieldId({
                  dimension: resolveSelectedDimension(
                      preAggregateDef.timeDimension,
                  ),
              })
            : null;

    const selectedMetricFieldIds = new Set<FieldId>();
    const additionalMetrics: AdditionalMetric[] = [];
    const metricComponents = materializedMetrics.reduce<
        Record<string, MaterializationMetricComponent[]>
    >((acc, { fieldId: metricFieldId, metric }) => {
        const representation = preAggregateUtils.getMetricRepresentation(
            metric.type,
        );

        switch (representation.kind) {
            case PreAggregateMetricRepresentationKind.UNSUPPORTED:
                throw new Error(
                    `Unsupported metric type "${metric.type}" for pre-aggregate materialization`,
                );
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
