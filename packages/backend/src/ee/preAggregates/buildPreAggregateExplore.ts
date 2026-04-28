import {
    assertUnreachable,
    ExploreType,
    getItemId,
    getPreAggregateExploreName,
    getPreAggregateMetricColumnName,
    getPreAggregateMetricComponentColumnName,
    getSqlForTruncatedDate,
    lightdashVariablePattern,
    MetricType,
    PRE_AGGREGATE_MATERIALIZED_TABLE_PLACEHOLDER,
    PreAggregateMetricRepresentationKind,
    preAggregateUtils,
    SupportedDbtAdapter,
    timeFrameOrder,
    type CompiledDimension,
    type CompiledMetric,
    type CompiledTable,
    type DimensionType,
    type Explore,
    type FieldId,
    type PreAggregateDef,
    type TimeFrames,
} from '@lightdash/common';
import { assertDimensionEligibleForDirectMaterialization } from './eligibility';
import {
    getDimensionsByReference,
    getMetricReferenceForDef,
    getSelectedDimension,
    selectPreAggregateMetrics,
} from './shared';

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

const getMetricAggregateSql = (
    metricType: MetricType.SUM | MetricType.MIN | MetricType.MAX,
    columnReference: string,
): string => {
    switch (metricType) {
        case MetricType.SUM:
            return `SUM(${columnReference})`;
        case MetricType.MIN:
            return `MIN(${columnReference})`;
        case MetricType.MAX:
            return `MAX(${columnReference})`;
        default:
            return assertUnreachable(
                metricType,
                `Unsupported metric type "${metricType}"`,
            );
    }
};

const getAverageMetricAggregateSql = (
    tableName: string,
    fieldId: FieldId,
): string => {
    const sumColumnReference = `${tableName}.${getPreAggregateMetricComponentColumnName(
        fieldId,
        'sum',
    )}`;
    const countColumnReference = `${tableName}.${getPreAggregateMetricComponentColumnName(
        fieldId,
        'count',
    )}`;

    // Force floating-point division because both components are numeric aggregates.
    return `CAST(SUM(${sumColumnReference}) AS DOUBLE) / CAST(NULLIF(SUM(${countColumnReference}), 0) AS DOUBLE)`;
};

const getMetricSqlForPreAggregateExplore = ({
    metricType,
    tableName,
    fieldId,
}: {
    metricType: MetricType;
    tableName: string;
    fieldId: FieldId;
}): { sql: string; compiledSql: string } => {
    const representation =
        preAggregateUtils.getMetricRepresentation(metricType);

    switch (representation.kind) {
        case PreAggregateMetricRepresentationKind.DECOMPOSED: {
            const compiledSql = getAverageMetricAggregateSql(
                tableName,
                fieldId,
            );
            return {
                sql: compiledSql,
                compiledSql,
            };
        }
        case PreAggregateMetricRepresentationKind.DIRECT: {
            const metricColumnReference = `${tableName}.${getPreAggregateMetricColumnName(
                fieldId,
            )}`;
            return {
                sql: metricColumnReference,
                compiledSql: getMetricAggregateSql(
                    representation.metricType,
                    metricColumnReference,
                ),
            };
        }
        case PreAggregateMetricRepresentationKind.UNSUPPORTED:
            throw new Error(`Unsupported metric type "${metricType}"`);
        default:
            return assertUnreachable(
                representation,
                `Unsupported pre-aggregate metric representation`,
            );
    }
};

const getNumberMetricSqlForPreAggregateExplore = ({
    sourceExplore,
    metric,
    metricsByReference,
    cache,
}: {
    sourceExplore: Explore;
    metric: CompiledMetric;
    metricsByReference: ReturnType<
        typeof preAggregateUtils.getMetricsByReference
    >;
    cache: Map<FieldId, string>;
}): string => {
    const metricFieldId = getItemId(metric);
    const cachedSql = cache.get(metricFieldId);
    if (cachedSql) {
        return cachedSql;
    }

    const compiledSql = metric.sql.replace(
        lightdashVariablePattern,
        (_, ref) => {
            const metricLookup = metricsByReference.get(ref);
            if (!metricLookup) {
                throw new Error(
                    `Pre-aggregate explore rewrite for metric "${getMetricReferenceForDef(
                        {
                            metric,
                            baseTable: sourceExplore.baseTable,
                        },
                    )}" cannot resolve metric reference "${ref}"`,
                );
            }

            if (metricLookup.metric.type === MetricType.NUMBER) {
                return `(${getNumberMetricSqlForPreAggregateExplore({
                    sourceExplore,
                    metric: metricLookup.metric,
                    metricsByReference,
                    cache,
                })})`;
            }

            return `(${
                getMetricSqlForPreAggregateExplore({
                    metricType: metricLookup.metric.type,
                    tableName: sourceExplore.baseTable,
                    fieldId: metricLookup.fieldId,
                }).compiledSql
            })`;
        },
    );

    cache.set(metricFieldId, compiledSql);
    return compiledSql;
};

const getMaterializedDimensionColumnName = ({
    sourceExplore,
    dimension,
    preAggregateDef,
}: {
    sourceExplore: Explore;
    dimension: CompiledDimension;
    preAggregateDef: PreAggregateDef;
}): string => {
    const dimensionBaseName = preAggregateUtils.getDimensionBaseName(dimension);

    if (
        preAggregateDef.timeDimension &&
        preAggregateDef.granularity &&
        dimensionBaseName === preAggregateDef.timeDimension
    ) {
        const preAggregateGranularityDimension = Object.values(
            sourceExplore.tables[dimension.table]?.dimensions || {},
        ).find(
            (candidateDimension) =>
                preAggregateUtils.getDimensionBaseName(candidateDimension) ===
                    preAggregateDef.timeDimension &&
                candidateDimension.timeInterval === preAggregateDef.granularity,
        );

        if (preAggregateGranularityDimension) {
            return getItemId(preAggregateGranularityDimension);
        }
    }

    return getItemId(dimension);
};

const getBaseDimensionType = (
    sourceExplore: Explore,
    dimension: CompiledDimension,
): DimensionType => {
    const dimensionBaseName = preAggregateUtils.getDimensionBaseName(dimension);
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
    const dimensionBaseName = preAggregateUtils.getDimensionBaseName(dimension);
    const materializedBaseColumnName = getMaterializedDimensionColumnName({
        sourceExplore,
        dimension,
        preAggregateDef,
    });
    const materializedBaseColumnReference = `${sourceExplore.baseTable}.${materializedBaseColumnName}`;
    const timeDimensionReference =
        preAggregateDef.timeDimension &&
        dimensionBaseName === preAggregateDef.timeDimension
            ? `CAST(${materializedBaseColumnReference} AS TIMESTAMP)`
            : materializedBaseColumnReference;

    if (!dimension.timeInterval) {
        return timeDimensionReference;
    }

    if (
        preAggregateDef.timeDimension &&
        preAggregateDef.granularity &&
        dimensionBaseName === preAggregateDef.timeDimension &&
        dimension.timeInterval === preAggregateDef.granularity
    ) {
        return timeDimensionReference;
    }

    return getSqlForTruncatedDate(
        SupportedDbtAdapter.DUCKDB,
        dimension.timeInterval,
        timeDimensionReference,
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

    Array.from(defDimensions).forEach((dimensionReference) => {
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
    });

    const includedDimensions = Object.values(sourceExplore.tables).flatMap(
        (table) =>
            Object.values(table.dimensions).filter((dimension) =>
                preAggregateUtils
                    .getDimensionReferences({
                        dimension,
                        baseTable: sourceExplore.baseTable,
                    })
                    .some((reference) => defDimensions.has(reference)),
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
        const dimensionBaseName =
            preAggregateUtils.getDimensionBaseName(dimension);
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
    const includedDimensions = getIncludedDimensions(
        sourceExplore,
        preAggregateDef,
    );
    const { materializedMetrics, derivedNumberMetrics, metricsByReference } =
        selectPreAggregateMetrics({
            sourceExplore,
            preAggregateDef,
        });

    const includedTableNames = new Set<string>([
        sourceExplore.baseTable,
        ...includedDimensions.map((dimension) => dimension.table),
        ...materializedMetrics.map(({ metric }) => metric.table),
        ...derivedNumberMetrics.map(({ metric }) => metric.table),
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
        acc[tableName] = getEmptyTable(
            sourceTable,
            PRE_AGGREGATE_MATERIALIZED_TABLE_PLACEHOLDER,
        );
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

    materializedMetrics.forEach(({ fieldId, metric }) => {
        const { sql, compiledSql } = getMetricSqlForPreAggregateExplore({
            metricType: metric.type,
            tableName: sourceExplore.baseTable,
            fieldId,
        });

        tables[metric.table].metrics[metric.name] = {
            ...metric,
            sql,
            compiledSql,
            tablesReferences: [sourceExplore.baseTable],
        };
    });

    const numberMetricSqlCache = new Map<FieldId, string>();

    derivedNumberMetrics.forEach(({ metric }) => {
        const compiledSql = getNumberMetricSqlForPreAggregateExplore({
            sourceExplore,
            metric,
            metricsByReference,
            cache: numberMetricSqlCache,
        });

        tables[metric.table].metrics[metric.name] = {
            ...metric,
            sql: compiledSql,
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
        preAggregateSource: {
            sourceExploreName: sourceExplore.name,
            preAggregateName: preAggregateDef.name,
        },
        joinedTables: [],
        tables,
        preAggregates: [],
    };
};
