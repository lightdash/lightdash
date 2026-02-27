import {
    getItemId,
    getMetricComponentColumnName,
    getMetricsByReference,
    MAX_SAFE_INTEGER,
    MetricType,
    type AdditionalMetric,
    type CompiledDimension,
    type CompiledMetric,
    type Explore,
    type FieldId,
    type MaterializationMetricComponent,
    type MaterializationMetricQueryPayload,
    type MetricQuery,
    type PreAggregateDef,
} from '@lightdash/common';

const getDimensionBaseName = (
    dimension: Pick<
        CompiledDimension,
        'name' | 'timeIntervalBaseDimensionName'
    >,
): string => dimension.timeIntervalBaseDimensionName ?? dimension.name;

const getDimensionReferences = (
    dimension: Pick<
        CompiledDimension,
        'table' | 'name' | 'timeIntervalBaseDimensionName'
    >,
    baseTable: string,
): string[] => {
    const baseName = getDimensionBaseName(dimension);
    const tableQualifiedRef = `${dimension.table}.${baseName}`;

    if (dimension.table === baseTable) {
        return [baseName, tableQualifiedRef];
    }

    return [tableQualifiedRef];
};

const getDimensionsByReference = (sourceExplore: Explore) =>
    Object.values(sourceExplore.tables).reduce<
        Map<string, CompiledDimension[]>
    >((acc, table) => {
        Object.values(table.dimensions).forEach((dimension) => {
            getDimensionReferences(dimension, sourceExplore.baseTable).forEach(
                (reference) => {
                    const existingDimensions = acc.get(reference) || [];
                    acc.set(reference, [...existingDimensions, dimension]);
                },
            );
        });

        return acc;
    }, new Map<string, CompiledDimension[]>());

const getMetricReAggregationComponent = (
    metricType: MetricType,
): MaterializationMetricComponent['aggregation'] => {
    switch (metricType) {
        case MetricType.SUM:
        case MetricType.COUNT:
            return 'sum';
        case MetricType.MIN:
            return 'min';
        case MetricType.MAX:
            return 'max';
        default:
            throw new Error(
                `Unsupported metric type "${metricType}" for pre-aggregate materialization`,
            );
    }
};

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
        getDimensionBaseName(candidates[0]) === preAggregateDef.timeDimension;

    if (
        isTimeDimensionReference &&
        preAggregateDef.granularity &&
        preAggregateDef.timeDimension
    ) {
        const timeGranularityDimension = candidates.find(
            (dimension) =>
                getDimensionBaseName(dimension) ===
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
                getDimensionBaseName(dimension) ===
                preAggregateDef.timeDimension,
        );
    });
};

export const buildMaterializationMetricQuery = ({
    sourceExplore,
    preAggregateDef,
}: {
    sourceExplore: Explore;
    preAggregateDef: PreAggregateDef;
}): MaterializationMetricQueryPayload => {
    const metricsByReference = getMetricsByReference({
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
        if (metric.type === MetricType.AVERAGE) {
            const [sumMetric, countMetric] = getAverageMetricComponents(metric);
            const sumFieldId = getItemId(sumMetric);
            const countFieldId = getItemId(countMetric);

            [
                getMetricComponentColumnName(metricFieldId, 'sum'),
                getMetricComponentColumnName(metricFieldId, 'count'),
            ].forEach((expectedFieldId, index) => {
                const actualFieldId = index === 0 ? sumFieldId : countFieldId;
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
                    aggregation: 'sum',
                },
                {
                    componentFieldId: countFieldId,
                    aggregation: 'sum',
                },
            ];

            return acc;
        }

        assertUniqueMetricFieldId({
            preAggregateName: preAggregateDef.name,
            fieldId: metricFieldId,
            selectedMetricFieldIds,
        });

        acc[metricFieldId] = [
            {
                componentFieldId: metricFieldId,
                aggregation: getMetricReAggregationComponent(metric.type),
            },
        ];

        return acc;
    }, {});

    const metricFieldIds = Array.from(selectedMetricFieldIds);

    const metricQuery: MetricQuery = {
        exploreName: sourceExplore.name,
        dimensions,
        metrics: metricFieldIds,
        filters: {},
        sorts: [],
        limit: MAX_SAFE_INTEGER,
        tableCalculations: [],
        ...(additionalMetrics.length > 0 ? { additionalMetrics } : {}),
    };

    return {
        metricQuery,
        metricComponents,
    };
};
