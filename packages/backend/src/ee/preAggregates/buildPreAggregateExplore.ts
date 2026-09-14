import {
    assertUnreachable,
    ExploreType,
    getItemId,
    getParsedReference,
    getPreAggregateExploreName,
    getPreAggregateMetricColumnName,
    getPreAggregateMetricComponentColumnName,
    getReferencedDimension,
    lightdashVariablePattern,
    MetricType,
    PRE_AGGREGATE_MATERIALIZED_TABLE_PLACEHOLDER,
    preAggregateMaterialization,
    PreAggregateMetricRepresentationKind,
    preAggregateUtils,
    SupportedDbtAdapter,
    timeFrameConfigs,
    type CompiledDimension,
    type CompiledMetric,
    type CompiledTable,
    type DimensionType,
    type Explore,
    type FieldId,
    type PreAggregateDef,
    type TimeFrames,
    type WeekDay,
} from '@lightdash/common';
import { warehouseSqlBuilderFromType } from '@lightdash/warehouses';

const {
    assertDimensionEligibleForDirectMaterialization,
    getDimensionsByReference,
    getMetricReferenceForDef,
    getSelectedDimension,
    selectPreAggregateMetrics,
} = preAggregateMaterialization;

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
    servingAdapter: SupportedDbtAdapter,
): string => {
    const sumColumnReference = `${tableName}.${getPreAggregateMetricComponentColumnName(
        fieldId,
        'sum',
    )}`;
    const countColumnReference = `${tableName}.${getPreAggregateMetricComponentColumnName(
        fieldId,
        'count',
    )}`;

    const floatType =
        warehouseSqlBuilderFromType(servingAdapter).getFloatingType();
    // Force floating-point division because both components are numeric aggregates.
    return `CAST(SUM(${sumColumnReference}) AS ${floatType}) / CAST(NULLIF(SUM(${countColumnReference}), 0) AS ${floatType})`;
};

const getMetricSqlForPreAggregateExplore = ({
    metricType,
    tableName,
    fieldId,
    servingAdapter,
}: {
    metricType: MetricType;
    tableName: string;
    fieldId: FieldId;
    servingAdapter: SupportedDbtAdapter;
}): { sql: string; compiledSql: string } => {
    const representation =
        preAggregateUtils.getMetricRepresentation(metricType);

    switch (representation.kind) {
        case PreAggregateMetricRepresentationKind.DECOMPOSED: {
            const compiledSql = getAverageMetricAggregateSql(
                tableName,
                fieldId,
                servingAdapter,
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
        case PreAggregateMetricRepresentationKind.EXACT_ONLY: {
            const metricColumnReference = `${tableName}.${getPreAggregateMetricColumnName(
                fieldId,
            )}`;
            // MAX is exact: the matcher only serves exact-only metrics when
            // each result group maps to a single materialization row.
            return {
                sql: metricColumnReference,
                compiledSql: `MAX(${metricColumnReference})`,
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
    servingAdapter,
}: {
    sourceExplore: Explore;
    metric: CompiledMetric;
    metricsByReference: ReturnType<
        typeof preAggregateUtils.getMetricsByReference
    >;
    cache: Map<FieldId, string>;
    servingAdapter: SupportedDbtAdapter;
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
                    servingAdapter,
                })})`;
            }

            return `(${
                getMetricSqlForPreAggregateExplore({
                    metricType: metricLookup.metric.type,
                    tableName: sourceExplore.baseTable,
                    fieldId: metricLookup.fieldId,
                    servingAdapter,
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
    servingAdapter,
    startOfWeek,
}: {
    sourceExplore: Explore;
    dimension: CompiledDimension;
    preAggregateDef: PreAggregateDef;
    servingAdapter: SupportedDbtAdapter;
    startOfWeek: WeekDay | null;
}): string => {
    const dimensionBaseName = preAggregateUtils.getDimensionBaseName(dimension);
    const materializedBaseColumnName = getMaterializedDimensionColumnName({
        sourceExplore,
        dimension,
        preAggregateDef,
    });
    const materializedBaseColumnReference = `${sourceExplore.baseTable}.${materializedBaseColumnName}`;
    const baseDimensionType = getBaseDimensionType(sourceExplore, dimension);

    if (!dimension.timeInterval) {
        return materializedBaseColumnReference;
    }

    if (
        preAggregateDef.timeDimension &&
        preAggregateDef.granularity &&
        dimensionBaseName === preAggregateDef.timeDimension &&
        dimension.timeInterval === preAggregateDef.granularity
    ) {
        return materializedBaseColumnReference;
    }

    return timeFrameConfigs[dimension.timeInterval].getSql(
        servingAdapter,
        dimension.timeInterval,
        materializedBaseColumnReference,
        baseDimensionType,
        startOfWeek,
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
            dimensionBaseName !== preAggregateDef.timeDimension
        ) {
            return true;
        }

        return (
            preAggregateUtils.getTimeFrameDerivability(
                preAggregateUtils.getEffectiveDimensionTimeFrame(dimension),
                preAggregateDef.granularity,
            ) === preAggregateUtils.TimeFrameDerivability.DERIVABLE
        );
    });
};

// Recompile sql_filter onto materialized columns (${lightdash.*} kept for
// query-time substitution); unresolved refs keep a missing column: fail closed.
const rewriteSqlWhereForPreAggregate = ({
    sourceExplore,
    preAggregateDef,
    servingAdapter,
}: {
    sourceExplore: Explore;
    preAggregateDef: PreAggregateDef;
    servingAdapter: SupportedDbtAdapter;
}): string | undefined => {
    const uncompiledSqlWhere =
        sourceExplore.tables[sourceExplore.baseTable]?.uncompiledSqlWhere;
    if (!uncompiledSqlWhere) {
        return undefined;
    }

    const quoteChar =
        warehouseSqlBuilderFromType(servingAdapter).getFieldQuoteChar();

    return uncompiledSqlWhere.replace(
        lightdashVariablePattern,
        (_, ref: string) => {
            if (ref === 'TABLE') {
                return `${quoteChar}${sourceExplore.baseTable}${quoteChar}`;
            }

            const { refTable, refName } = getParsedReference(
                ref,
                sourceExplore.baseTable,
            );
            const dimension = getReferencedDimension<
                CompiledTable,
                CompiledDimension
            >(refTable, refName, sourceExplore.tables);
            const materializedColumnName = dimension
                ? getMaterializedDimensionColumnName({
                      sourceExplore,
                      dimension,
                      preAggregateDef,
                  })
                : getItemId({ table: refTable, name: refName });

            return `${sourceExplore.baseTable}.${materializedColumnName}`;
        },
    );
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
    startOfWeek: WeekDay | null,
): Explore => {
    // Managed pre-aggregates serve via DuckDB; external ones serve from the
    // customer table on the project warehouse, so SQL is compiled in its dialect.
    const servingAdapter = preAggregateDef.table
        ? sourceExplore.targetDatabase
        : SupportedDbtAdapter.DUCKDB;
    const sqlTable =
        preAggregateDef.table ?? PRE_AGGREGATE_MATERIALIZED_TABLE_PLACEHOLDER;

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
        acc[tableName] = getEmptyTable(sourceTable, sqlTable);
        return acc;
    }, {});

    const rewrittenSqlWhere = rewriteSqlWhereForPreAggregate({
        sourceExplore,
        preAggregateDef,
        servingAdapter,
    });
    if (rewrittenSqlWhere !== undefined) {
        tables[sourceExplore.baseTable] = {
            ...tables[sourceExplore.baseTable],
            sqlWhere: rewrittenSqlWhere,
            uncompiledSqlWhere: rewrittenSqlWhere,
        };
    }

    includedDimensions.forEach((dimension) => {
        const compiledSql = buildDimensionSql({
            sourceExplore,
            dimension,
            preAggregateDef,
            servingAdapter,
            startOfWeek,
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
            servingAdapter,
        });

        // Hide exact-only metrics from the pre-aggregate explore preview:
        // selecting them with fewer dimensions than the definition would
        // re-aggregate a non-additive value into a wrong number.
        const isExactOnly =
            preAggregateUtils.getMetricRepresentation(metric.type).kind ===
            PreAggregateMetricRepresentationKind.EXACT_ONLY;

        tables[metric.table].metrics[metric.name] = {
            ...metric,
            sql,
            compiledSql,
            tablesReferences: [sourceExplore.baseTable],
            ...(isExactOnly ? { hidden: true } : {}),
        };
    });

    const numberMetricSqlCache = new Map<FieldId, string>();

    derivedNumberMetrics.forEach(({ metric }) => {
        const compiledSql = getNumberMetricSqlForPreAggregateExplore({
            sourceExplore,
            metric,
            metricsByReference,
            cache: numberMetricSqlCache,
            servingAdapter,
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
            ...(preAggregateDef.table
                ? { externalTable: preAggregateDef.table }
                : {}),
        },
        joinedTables: [],
        tables,
        preAggregates: [],
    };
};
