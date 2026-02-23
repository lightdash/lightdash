import {
    ExploreType,
    type CompiledTable,
    type Explore,
} from '../types/explore';
import {
    MetricType,
    PostCalculationMetricTypes,
    type CompiledDimension,
    type CompiledMetric,
    type DimensionType,
    type FieldId,
} from '../types/field';
import { type PreAggregateDef } from '../types/preAggregate';
import { type TimeFrames } from '../types/timeFrames';
import { getItemId } from '../utils/item';
import { getSqlForTruncatedDate, timeFrameOrder } from '../utils/timeFrames';
import {
    getJoinedDimensionColumnName,
    getMetricColumnName,
    getPreAggregateExploreName,
    getTimeDimensionColumnName,
} from './naming';
import {
    getDimensionBaseName,
    getDimensionReferences,
    getMetricsByReference,
} from './references';

const isFinerGranularity = (
    candidateGranularity: TimeFrames,
    targetGranularity: TimeFrames,
): boolean => {
    const candidateIndex = timeFrameOrder.indexOf(candidateGranularity);
    const targetIndex = timeFrameOrder.indexOf(targetGranularity);
    if (candidateIndex === -1 || targetIndex === -1) {
        return false;
    }
    return candidateIndex < targetIndex;
};

const getDimensionsByReference = (sourceExplore: Explore) =>
    Object.values(sourceExplore.tables).reduce<
        Map<string, CompiledDimension[]>
    >((acc, table) => {
        Object.values(table.dimensions).forEach((dimension) => {
            getDimensionReferences({
                dimension,
                baseTable: sourceExplore.baseTable,
            }).forEach((reference) => {
                const existingDimensions = acc.get(reference) || [];
                acc.set(reference, [...existingDimensions, dimension]);
            });
        });
        return acc;
    }, new Map<string, CompiledDimension[]>());

const isSupportedMetricType = (metricType: MetricType): boolean =>
    [MetricType.SUM, MetricType.COUNT, MetricType.MIN, MetricType.MAX].includes(
        metricType,
    );

const getMetricAggregateSql = (
    metricType: MetricType,
    columnReference: string,
): string => {
    switch (metricType) {
        case MetricType.SUM:
        case MetricType.COUNT:
            return `SUM(${columnReference})`;
        case MetricType.MIN:
            return `MIN(${columnReference})`;
        case MetricType.MAX:
            return `MAX(${columnReference})`;
        default:
            throw new Error(`Unsupported metric type "${metricType}"`);
    }
};

const getPhysicalDimensionColumnName = ({
    dimension,
    preAggregateDef,
    baseTable,
}: {
    dimension: CompiledDimension;
    preAggregateDef: PreAggregateDef;
    baseTable: string;
}): string => {
    const dimensionBaseName = getDimensionBaseName(dimension);

    if (
        preAggregateDef.timeDimension &&
        preAggregateDef.granularity &&
        dimensionBaseName === preAggregateDef.timeDimension
    ) {
        return getTimeDimensionColumnName(
            dimensionBaseName,
            preAggregateDef.granularity,
        );
    }

    if (dimension.table === baseTable) {
        return dimensionBaseName;
    }

    return getJoinedDimensionColumnName(dimension.table, dimensionBaseName);
};

const getBaseDimensionType = (
    sourceExplore: Explore,
    dimension: CompiledDimension,
): DimensionType => {
    const dimensionBaseName = getDimensionBaseName(dimension);
    const baseDimension =
        sourceExplore.tables[dimension.table]?.dimensions[dimensionBaseName];
    return baseDimension?.type || dimension.type;
};

const buildDimensionSql = ({
    sourceExplore,
    dimension,
    preAggregateDef,
}: {
    sourceExplore: Explore;
    dimension: CompiledDimension;
    preAggregateDef: PreAggregateDef;
}): string => {
    const dimensionBaseName = getDimensionBaseName(dimension);
    const physicalBaseColumnName = getPhysicalDimensionColumnName({
        dimension,
        preAggregateDef,
        baseTable: sourceExplore.baseTable,
    });
    const physicalBaseColumnReference = `${sourceExplore.baseTable}.${physicalBaseColumnName}`;

    if (!dimension.timeInterval) {
        return physicalBaseColumnReference;
    }

    if (
        preAggregateDef.timeDimension &&
        preAggregateDef.granularity &&
        dimensionBaseName === preAggregateDef.timeDimension &&
        dimension.timeInterval === preAggregateDef.granularity
    ) {
        return physicalBaseColumnReference;
    }

    return getSqlForTruncatedDate(
        sourceExplore.targetDatabase,
        dimension.timeInterval,
        physicalBaseColumnReference,
        getBaseDimensionType(sourceExplore, dimension),
    );
};

const getIncludedDimensions = (
    sourceExplore: Explore,
    preAggregateDef: PreAggregateDef,
): CompiledDimension[] => {
    const dimensionsByReference = getDimensionsByReference(sourceExplore);

    const missingReferences = preAggregateDef.dimensions.filter(
        (reference) =>
            (dimensionsByReference.get(reference) || []).length === 0,
    );
    if (missingReferences.length > 0) {
        throw new Error(
            `Pre-aggregate "${preAggregateDef.name}" references unknown dimensions: ${missingReferences.join(
                ', ',
            )}`,
        );
    }

    const defDimensions = new Set(preAggregateDef.dimensions);

    // Add time dimension to included references if specified separately
    if (
        preAggregateDef.timeDimension &&
        preAggregateDef.granularity &&
        !defDimensions.has(preAggregateDef.timeDimension)
    ) {
        defDimensions.add(preAggregateDef.timeDimension);
    }

    const includedDimensions = Object.values(sourceExplore.tables).flatMap(
        (table) =>
            Object.values(table.dimensions).filter((dimension) =>
                getDimensionReferences({
                    dimension,
                    baseTable: sourceExplore.baseTable,
                }).some((reference) => defDimensions.has(reference)),
            ),
    );

    const uniqueDimensions = Array.from(
        includedDimensions
            .reduce<Map<FieldId, CompiledDimension>>((acc, dimension) => {
                acc.set(getItemId(dimension), dimension);
                return acc;
            }, new Map<FieldId, CompiledDimension>())
            .values(),
    );

    return uniqueDimensions.filter((dimension) => {
        const dimensionBaseName = getDimensionBaseName(dimension);
        if (
            !preAggregateDef.timeDimension ||
            !preAggregateDef.granularity ||
            dimensionBaseName !== preAggregateDef.timeDimension ||
            !dimension.timeInterval
        ) {
            return true;
        }

        return !isFinerGranularity(
            dimension.timeInterval,
            preAggregateDef.granularity,
        );
    });
};

const getIncludedMetrics = (
    sourceExplore: Explore,
    preAggregateDef: PreAggregateDef,
): Array<{ fieldId: FieldId; metric: CompiledMetric }> => {
    const metricsByReference = getMetricsByReference({
        tables: sourceExplore.tables,
        baseTable: sourceExplore.baseTable,
    });

    return preAggregateDef.metrics.reduce<
        Array<{ fieldId: FieldId; metric: CompiledMetric }>
    >((acc, metricReference) => {
        const metricLookup = metricsByReference.get(metricReference);
        if (!metricLookup) {
            throw new Error(
                `Pre-aggregate "${preAggregateDef.name}" references unknown metric "${metricReference}"`,
            );
        }

        const { fieldId, metric } = metricLookup;

        // TODO: Support AVERAGE by materializing SUM + COUNT and deriving AVG at query time.
        if (
            metric.type === MetricType.AVERAGE ||
            PostCalculationMetricTypes.includes(metric.type) ||
            !isSupportedMetricType(metric.type)
        ) {
            return acc;
        }

        return [...acc, { fieldId, metric }];
    }, []);
};

const getEmptyTable = (
    sourceTable: CompiledTable,
    sqlTable: string,
): CompiledTable => ({
    ...sourceTable,
    sqlTable,
    dimensions: {},
    metrics: {},
});

export const buildPreAggregateExplore = (
    sourceExplore: Explore,
    preAggregateDef: PreAggregateDef,
): Explore => {
    const baseTableSqlTable =
        sourceExplore.tables[sourceExplore.baseTable].sqlTable;
    const includedDimensions = getIncludedDimensions(
        sourceExplore,
        preAggregateDef,
    );
    const includedMetrics = getIncludedMetrics(sourceExplore, preAggregateDef);

    const includedTableNames = new Set<string>([
        sourceExplore.baseTable,
        ...includedDimensions.map((dimension) => dimension.table),
        ...includedMetrics.map(({ metric }) => metric.table),
    ]);

    const tables = Array.from(includedTableNames).reduce<
        Record<string, CompiledTable>
    >((acc, tableName) => {
        const sourceTable = sourceExplore.tables[tableName];
        if (!sourceTable) {
            throw new Error(
                `Pre-aggregate "${preAggregateDef.name}" references unknown table "${tableName}"`,
            );
        }
        acc[tableName] = getEmptyTable(sourceTable, baseTableSqlTable);
        return acc;
    }, {});

    includedDimensions.forEach((dimension) => {
        const compiledSql = buildDimensionSql({
            sourceExplore,
            dimension,
            preAggregateDef,
        });

        tables[dimension.table].dimensions[dimension.name] = {
            ...dimension,
            sql: compiledSql,
            compiledSql,
            tablesReferences: [sourceExplore.baseTable],
        };
    });

    includedMetrics.forEach(({ fieldId, metric }) => {
        const metricColumnName = getMetricColumnName(fieldId);
        const metricColumnReference = `${sourceExplore.baseTable}.${metricColumnName}`;
        const compiledSql = getMetricAggregateSql(
            metric.type,
            metricColumnReference,
        );

        tables[metric.table].metrics[metric.name] = {
            ...metric,
            sql: metricColumnReference,
            compiledSql,
            tablesReferences: [sourceExplore.baseTable],
        };
    });

    return {
        ...sourceExplore,
        name: getPreAggregateExploreName(
            sourceExplore.name,
            preAggregateDef.name,
        ),
        type: ExploreType.PRE_AGGREGATE,
        joinedTables: [],
        tables,
        preAggregates: [],
    };
};
