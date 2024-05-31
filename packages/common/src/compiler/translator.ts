import {
    buildModelGraph,
    convertColumnMetric,
    convertModelMetric,
    convertToGroups,
    isV9MetricRef,
    SupportedDbtAdapter,
    type DbtMetric,
    type DbtModelColumn,
    type DbtModelNode,
    type LineageGraph,
} from '../types/dbt';
import { MissingCatalogEntryError, ParseError } from '../types/errors';
import { type Explore, type ExploreError, type Table } from '../types/explore';
import {
    defaultSql,
    DimensionType,
    FieldType,
    friendlyName,
    intervalGroupFriendlyName,
    MetricType,
    parseMetricType,
    type Dimension,
    type Metric,
    type Source,
} from '../types/field';
import { parseFilters } from '../types/filterGrammar';
import { OrderFieldsByStrategy, type GroupType } from '../types/table';
import { type TimeFrames } from '../types/timeFrames';
import { type WarehouseClient } from '../types/warehouse';
import assertUnreachable from '../utils/assertUnreachable';
import {
    getDefaultTimeFrames,
    timeFrameConfigs,
    validateTimeFrames,
    type WeekDay,
} from '../utils/timeFrames';
import { ExploreCompiler } from './exploreCompiler';

const convertTimezone = (
    timestampSql: string,
    default_source_tz: string,
    target_tz: string,
    adapterType: SupportedDbtAdapter,
) => {
    // todo: implement default_source_tz
    // todo: implement target_tz
    // todo: implement conversion for all adapters
    switch (adapterType) {
        case SupportedDbtAdapter.BIGQUERY:
            // TIMESTAMPS: stored as utc. returns utc. convert from utc to target_tz
            //   DATETIME: no tz. assume default_source_tz. covert from default_source_tz to target_tz
            return timestampSql;
        case SupportedDbtAdapter.SNOWFLAKE:
            // TIMESTAMP_NTZ: no tz. assume default_source_tz. convert from default_source_tz to target_tz
            // TIMESTAMP_LTZ: stored in utc. returns in session tz. convert from session tz to target_tz
            // TIMESTAMP_TZ: stored with tz. returns with tz. convert from value tz to target_tz
            return `TO_TIMESTAMP_NTZ(CONVERT_TIMEZONE('UTC', ${timestampSql}))`;
        case SupportedDbtAdapter.REDSHIFT:
            // TIMESTAMP WITH TIME ZONE: stored in utc. returns utc. convert from utc to target_tz
            // TIMESTAMP WITHOUT TIME ZONE: no tz. assume utc. convert from utc to target_tz
            return timestampSql;
        case SupportedDbtAdapter.POSTGRES:
            // TIMESTAMP WITH TIME ZONE: stored as utc. returns in session tz. convert from session tz to target tz
            // TIMESTAMP WITHOUT TIME ZONE: no tz. assume default_source_tz. convert from default_source_tz to target_tz
            return timestampSql;
        case SupportedDbtAdapter.DATABRICKS:
            return timestampSql;
        case SupportedDbtAdapter.TRINO:
            return timestampSql;
        default:
            return assertUnreachable(
                adapterType,
                new ParseError(`Cannot recognise warehouse ${adapterType}`),
            );
    }
};

const isInterval = (
    dimensionType: DimensionType,
    { meta }: DbtModelColumn,
): boolean =>
    [DimensionType.DATE, DimensionType.TIMESTAMP].includes(dimensionType) &&
    meta.dimension?.time_intervals !== false &&
    ((meta.dimension?.time_intervals &&
        meta.dimension.time_intervals !== 'OFF') ||
        !meta.dimension?.time_intervals);

const convertDimension = (
    index: number,
    targetWarehouse: SupportedDbtAdapter,
    model: Pick<DbtModelNode, 'name' | 'relation_name'>,
    tableLabel: string,
    column: DbtModelColumn,
    source?: Source,
    timeInterval?: TimeFrames,
    startOfWeek?: WeekDay | null,
    isAdditionalDimension?: boolean,
): Dimension => {
    let type =
        column.meta.dimension?.type || column.data_type || DimensionType.STRING;
    if (!Object.values(DimensionType).includes(type)) {
        throw new MissingCatalogEntryError(
            `Could not recognise type "${type}" for dimension "${
                column.name
            }" in dbt model "${model.name}". Valid types are: ${Object.values(
                DimensionType,
            ).join(', ')}`,
            {},
        );
    }
    let name = column.meta.dimension?.name || column.name;
    let sql = column.meta.dimension?.sql || defaultSql(column.name);
    let label = column.meta.dimension?.label || friendlyName(name);
    if (type === DimensionType.TIMESTAMP) {
        sql = convertTimezone(sql, 'UTC', 'UTC', targetWarehouse);
    }
    const isIntervalBase =
        timeInterval === undefined && isInterval(type, column);
    const groups: string[] = convertToGroups(
        column.meta.dimension?.groups,
        column.meta.dimension?.group_label,
    );
    if (timeInterval) {
        sql = timeFrameConfigs[timeInterval].getSql(
            targetWarehouse,
            timeInterval,
            sql,
            type,
            startOfWeek,
        );
        name = `${column.name}_${timeInterval.toLowerCase()}`;
        label = `${label} ${timeFrameConfigs[timeInterval]
            .getLabel()
            .toLowerCase()}`;
        groups.push(
            column.meta.dimension?.label || intervalGroupFriendlyName(name),
        );
        type = timeFrameConfigs[timeInterval].getDimensionType(type);
    }
    return {
        index,
        fieldType: FieldType.DIMENSION,
        name,
        label,
        sql,
        table: model.name,
        tableLabel,
        type,
        description: column.meta.dimension?.description || column.description,
        source,
        timeInterval,
        hidden: !!column.meta.dimension?.hidden,
        format: column.meta.dimension?.format,
        round: column.meta.dimension?.round,
        compact: column.meta.dimension?.compact,
        requiredAttributes: column.meta.dimension?.required_attributes,
        colors: column.meta.dimension?.colors,
        ...(column.meta.dimension?.urls
            ? { urls: column.meta.dimension.urls }
            : {}),
        ...(isAdditionalDimension ? { isAdditionalDimension } : {}),
        groups,
        isIntervalBase,
    };
};

const generateTableLineage = (
    model: DbtModelNode,
    depGraph: ReturnType<typeof buildModelGraph>,
): LineageGraph => {
    const modelFamilyIds = [
        ...depGraph.dependantsOf(model.unique_id),
        ...depGraph.dependenciesOf(model.unique_id),
        model.unique_id,
    ];
    return modelFamilyIds.reduce<LineageGraph>(
        (prev, nodeId) => ({
            ...prev,
            [depGraph.getNodeData(nodeId).name]: depGraph
                .directDependenciesOf(nodeId)
                .map((d) => depGraph.getNodeData(d)),
        }),
        {},
    );
};

const convertDbtMetricToLightdashMetric = (
    metric: DbtMetric,
    tableName: string,
    tableLabel: string,
): Metric => {
    let sql: string;
    let type: MetricType;
    if (metric.calculation_method === 'derived') {
        type = MetricType.NUMBER;
        const referencedMetrics = new Set(
            (metric.metrics || []).map((m) => m[0]),
        );
        if (!metric.expression) {
            throw new ParseError(
                `dbt derived metric "${metric.name}" must have the expression field set`,
            );
        }
        sql = metric.expression;

        referencedMetrics.forEach((ref) => {
            const re = new RegExp(`\\b${ref}\\b`, 'g');
            // eslint-disable-next-line no-useless-escape
            sql = sql.replace(re, `\$\{${ref}\}`);
        });
    } else {
        try {
            type = parseMetricType(metric.calculation_method);
        } catch (e) {
            throw new ParseError(
                `Cannot parse metric '${metric.unique_id}: type ${metric.calculation_method} is not a valid Lightdash metric type`,
            );
        }
        sql = defaultSql(metric.name);
        if (metric.expression) {
            const isSingleColumnName = /^[a-zA-Z0-9_]+$/g.test(
                metric.expression,
            );
            if (isSingleColumnName) {
                sql = defaultSql(metric.expression);
            } else {
                sql = metric.expression;
            }
        }
    }
    if (metric.filters && metric.filters.length > 0) {
        const filterSql = metric.filters
            .map(
                (filter) =>
                    // eslint-disable-next-line no-useless-escape
                    `(\$\{TABLE\}.${filter.field} ${filter.operator} ${filter.value})`,
            )
            .join(' AND ');
        sql = `CASE WHEN ${filterSql} THEN ${sql} ELSE NULL END`;
    }
    const groups: string[] = convertToGroups(
        metric.meta?.groups,
        metric.meta?.group_label,
    );
    return {
        fieldType: FieldType.METRIC,
        type,
        isAutoGenerated: false,
        name: metric.name,
        label: metric.label || friendlyName(metric.name),
        table: tableName,
        tableLabel,
        sql,
        description: metric.description,
        source: undefined,
        hidden: !!metric.meta?.hidden,
        round: metric.meta?.round,
        compact: metric.meta?.compact,
        format: metric.meta?.format,
        groups,
        percentile: metric.meta?.percentile,
        showUnderlyingValues: metric.meta?.show_underlying_values,
        filters: parseFilters(metric.meta?.filters),
        ...(metric.meta?.urls ? { urls: metric.meta.urls } : {}),
    };
};

export const convertTable = (
    adapterType: SupportedDbtAdapter,
    model: DbtModelNode,
    dbtMetrics: DbtMetric[],
    startOfWeek?: WeekDay | null,
): Omit<Table, 'lineageGraph'> => {
    const meta = model.config?.meta || model.meta; // Config block takes priority, then meta block
    const tableLabel = meta.label || friendlyName(model.name);
    const [dimensions, metrics]: [
        Record<string, Dimension>,
        Record<string, Metric>,
    ] = Object.values(model.columns).reduce(
        ([prevDimensions, prevMetrics], column, index) => {
            const dimension = convertDimension(
                index,
                adapterType,
                model,
                tableLabel,
                column,
                undefined,
                undefined,
                startOfWeek,
            );

            let extraDimensions = {};

            if (isInterval(dimension.type, column)) {
                let intervals: TimeFrames[] = [];
                if (
                    column.meta.dimension?.time_intervals &&
                    Array.isArray(column.meta.dimension.time_intervals)
                ) {
                    intervals = validateTimeFrames(
                        column.meta.dimension.time_intervals,
                    );
                } else {
                    intervals = getDefaultTimeFrames(dimension.type);
                }

                extraDimensions = intervals.reduce(
                    (acc, interval) => ({
                        ...acc,
                        [`${column.name}_${interval.toLowerCase()}`]:
                            convertDimension(
                                index,
                                adapterType,
                                model,
                                tableLabel,
                                column,
                                undefined,
                                interval,
                                startOfWeek,
                            ),
                    }),
                    {},
                );
            }

            extraDimensions = Object.entries(
                column.meta.additional_dimensions || {},
            ).reduce(
                (acc, [subDimensionName, subDimension]) => ({
                    ...acc,
                    [subDimensionName]: convertDimension(
                        index,
                        adapterType,
                        model,
                        tableLabel,
                        {
                            ...column,
                            name: subDimensionName,
                            meta: {
                                dimension: subDimension,
                            },
                        },
                        undefined,
                        undefined,
                        startOfWeek,
                        true,
                    ),
                }),
                extraDimensions,
            );

            const columnMetrics = Object.fromEntries(
                Object.entries(column.meta.metrics || {}).map(
                    ([name, metric]) => [
                        name,
                        convertColumnMetric({
                            modelName: model.name,
                            dimensionName: dimension.name,
                            dimensionSql: dimension.sql,
                            name,
                            metric,
                            tableLabel,
                            requiredAttributes: dimension.requiredAttributes, // TODO Join dimension required_attributes with metric required_attributes
                        }),
                    ],
                ),
            );

            return [
                {
                    ...prevDimensions,
                    [column.name]: dimension,
                    ...extraDimensions,
                },
                { ...prevMetrics, ...columnMetrics },
            ];
        },
        [{}, {}],
    );

    const modelMetrics = Object.fromEntries(
        Object.entries(model.meta.metrics || {}).map(([name, metric]) => [
            name,
            convertModelMetric({
                modelName: model.name,
                name,
                metric,
                tableLabel,
            }),
        ]),
    );

    const convertedDbtMetrics = Object.fromEntries(
        dbtMetrics.map((metric) => [
            metric.name,
            convertDbtMetricToLightdashMetric(metric, model.name, tableLabel),
        ]),
    );

    const allMetrics: Record<string, Metric> = Object.values({
        ...convertedDbtMetrics,
        ...modelMetrics,
        ...metrics,
    }).reduce(
        (acc, metric, index) => ({
            ...acc,
            [metric.name]: { ...metric, index },
        }),
        {},
    );

    const duplicatedNames = Object.keys(allMetrics).filter((metric) =>
        Object.keys(dimensions).includes(metric),
    );
    if (duplicatedNames.length > 0) {
        const message =
            duplicatedNames.length > 1
                ? 'Found multiple metrics and a dimensions with the same name:'
                : 'Found a metric and a dimension with the same name:';
        throw new ParseError(`${message} ${duplicatedNames}`);
    }

    if (!model.relation_name) {
        throw new Error(`Model "${model.name}" has no table relation`);
    }
    const groupDetails: Record<string, GroupType> = {};
    if (meta.group_details) {
        Object.entries(meta.group_details).forEach(([key, data]) => {
            groupDetails[key] = {
                label: data.label,
                description: data.description,
            };
        });
    }

    return {
        name: model.name,
        label: tableLabel,
        database: model.database,
        schema: model.schema,
        sqlTable: model.relation_name,
        description: model.description || `${model.name} table`,
        dimensions,
        metrics: allMetrics,
        orderFieldsBy:
            meta.order_fields_by &&
            Object.values(OrderFieldsByStrategy).includes(
                meta.order_fields_by.toUpperCase() as OrderFieldsByStrategy,
            )
                ? (meta.order_fields_by.toUpperCase() as OrderFieldsByStrategy)
                : OrderFieldsByStrategy.LABEL,
        groupLabel: meta.group_label,
        sqlWhere: meta.sql_filter || meta.sql_where,
        requiredAttributes: meta.required_attributes,
        groupDetails,
    };
};

const translateDbtModelsToTableLineage = (
    models: DbtModelNode[],
): Record<string, Pick<Table, 'lineageGraph'>> => {
    const graph = buildModelGraph(models);
    return models.reduce<Record<string, Pick<Table, 'lineageGraph'>>>(
        (previousValue, currentValue) => ({
            ...previousValue,
            [currentValue.name]: {
                lineageGraph: generateTableLineage(currentValue, graph),
            },
        }),
        {},
    );
};

const modelCanUseMetric = (
    metricName: string,
    modelName: string,
    metrics: DbtMetric[],
): boolean => {
    const metric = metrics.find((m) => m.name === metricName);
    if (!metric) {
        return false;
    }
    const modelRef = metric?.refs?.[0];
    if (modelRef) {
        const modelRefName = isV9MetricRef(modelRef)
            ? modelRef.name
            : modelRef[0];
        if (modelRefName === modelName) {
            return true;
        }
    }

    if (metric.calculation_method === 'derived') {
        const referencedMetrics = (metric.metrics || []).map((m) => m[0]);
        return referencedMetrics.every((m) =>
            modelCanUseMetric(m, modelName, metrics),
        );
    }
    return false;
};

export const convertExplores = async (
    models: DbtModelNode[],
    loadSources: boolean,
    adapterType: SupportedDbtAdapter,
    metrics: DbtMetric[],
    warehouseClient: WarehouseClient,
): Promise<(Explore | ExploreError)[]> => {
    const tableLineage = translateDbtModelsToTableLineage(models);
    const [tables, exploreErrors] = models.reduce(
        ([accTables, accErrors], model) => {
            const meta = model.config?.meta || model.meta; // Config block takes priority, then meta block
            // If there are any errors compiling the table return an ExploreError
            try {
                // base dimensions and metrics
                const tableMetrics = metrics.filter((metric) =>
                    modelCanUseMetric(metric.name, model.name, metrics),
                );
                const table = convertTable(
                    adapterType,
                    model,
                    tableMetrics,
                    warehouseClient.getStartOfWeek(),
                );

                // add sources
                if (loadSources && model.patch_path !== null) {
                    throw new Error('Not Implemented');
                }

                // add lineage
                const tableWithLineage: Table = {
                    ...table,
                    ...tableLineage[model.name],
                };

                return [[...accTables, tableWithLineage], accErrors];
            } catch (e) {
                const exploreError: ExploreError = {
                    name: model.name,
                    label: meta.label || friendlyName(model.name),
                    tags: model.tags,
                    groupLabel: meta.group_label,
                    errors: [
                        {
                            type: e.name,
                            message:
                                e.message ||
                                `Could not convert dbt model: "${model.name}" in to a Lightdash explore`,
                        },
                    ],
                };
                return [accTables, [...accErrors, exploreError]];
            }
        },
        [[], []] as [Table[], ExploreError[]],
    );
    const tableLookup: Record<string, Table> = tables.reduce(
        (prev, table) => ({ ...prev, [table.name]: table }),
        {},
    );
    const validModels = models.filter(
        (model) => tableLookup[model.name] !== undefined,
    );

    const exploreCompiler = new ExploreCompiler(warehouseClient);
    const joinAliases = validModels.reduce<
        Record<string, Record<string, string>>
    >((acc, model) => {
        const joins = model.config?.meta?.joins;
        if (joins === undefined) return acc;

        const aliases = joins.reduce<Record<string, string>>((acc2, join) => {
            if (join.alias && tableLookup[join.join]) {
                return {
                    ...acc2,
                    [join.alias]: join.join,
                };
            }
            return acc2;
        }, {});
        return {
            ...acc,
            [model.name]: aliases,
        };
    }, {});

    const explores: (Explore | ExploreError)[] = validModels.map((model) => {
        const meta = model.config?.meta || model.meta; // Config block takes priority, then meta block
        try {
            return exploreCompiler.compileExplore({
                name: model.name,
                label: meta.label || friendlyName(model.name),
                tags: model.tags || [],
                baseTable: model.name,
                groupLabel: meta.group_label,
                joinedTables: (meta?.joins || []).map((join) => ({
                    table: join.join,
                    sqlOn: join.sql_on,
                    type: join.type,
                    alias: join.alias,
                    label: join.label,
                    fields: join.fields,
                    hidden: join.hidden,
                    always: join.always,
                })),
                tables: tableLookup,
                targetDatabase: adapterType,
                warehouse: model.config?.snowflake_warehouse,
                ymlPath: model.patch_path?.split('://')?.[1],
                sqlPath: model.path,
                joinAliases,
            });
        } catch (e) {
            return {
                name: model.name,
                label: meta.label || friendlyName(model.name),
                groupLabel: meta.group_label,
                errors: [{ type: e.name, message: e.message }],
            };
        }
    });

    return [...explores, ...exploreErrors];
};

export const attachTypesToModels = (
    models: DbtModelNode[],
    warehouseCatalog: {
        [database: string]: {
            [schema: string]: {
                [table: string]: { [column: string]: DimensionType };
            };
        };
    },
    throwOnMissingCatalogEntry: boolean = true,
    caseSensitiveMatching: boolean = true,
): DbtModelNode[] => {
    // Check that all models appear in the warehouse
    models.forEach(({ database, schema, name }) => {
        const databaseMatch = Object.keys(warehouseCatalog).find((db) =>
            caseSensitiveMatching
                ? db === database
                : db.toLowerCase() === database.toLowerCase(),
        );
        const schemaMatch =
            databaseMatch &&
            Object.keys(warehouseCatalog[databaseMatch]).find((s) =>
                caseSensitiveMatching
                    ? s === schema
                    : s.toLowerCase() === schema.toLowerCase(),
            );
        const tableMatch =
            databaseMatch &&
            schemaMatch &&
            Object.keys(warehouseCatalog[databaseMatch][schemaMatch]).find(
                (t) =>
                    caseSensitiveMatching
                        ? t === name
                        : t.toLowerCase() === name.toLowerCase(),
            );
        if (!tableMatch && throwOnMissingCatalogEntry) {
            throw new MissingCatalogEntryError(
                `Model "${name}" was expected in your target warehouse at "${database}.${schema}.${name}". Does the table exist in your target data warehouse?`,
                {},
            );
        }
    });

    const getType = (
        { database, schema, name, alias }: DbtModelNode,
        columnName: string,
    ): DimensionType | undefined => {
        const tableName = alias || name;
        const databaseMatch = Object.keys(warehouseCatalog).find((db) =>
            caseSensitiveMatching
                ? db === database
                : db.toLowerCase() === database.toLowerCase(),
        );
        const schemaMatch =
            databaseMatch &&
            Object.keys(warehouseCatalog[databaseMatch]).find((s) =>
                caseSensitiveMatching
                    ? s === schema
                    : s.toLowerCase() === schema.toLowerCase(),
            );
        const tableMatch =
            databaseMatch &&
            schemaMatch &&
            Object.keys(warehouseCatalog[databaseMatch][schemaMatch]).find(
                (t) =>
                    caseSensitiveMatching
                        ? t === tableName
                        : t.toLowerCase() === tableName.toLowerCase(),
            );
        const columnMatch =
            databaseMatch &&
            schemaMatch &&
            tableMatch &&
            Object.keys(
                warehouseCatalog[databaseMatch][schemaMatch][tableMatch],
            ).find((c) =>
                caseSensitiveMatching
                    ? c === columnName
                    : c.toLowerCase() === columnName.toLowerCase(),
            );
        if (databaseMatch && schemaMatch && tableMatch && columnMatch) {
            return warehouseCatalog[databaseMatch][schemaMatch][tableMatch][
                columnMatch
            ];
        }
        if (throwOnMissingCatalogEntry) {
            throw new MissingCatalogEntryError(
                `Column "${columnName}" from model "${tableName}" does not exist.\n "${tableName}.${columnName}" was not found in your target warehouse at ${database}.${schema}.${tableName}. Try rerunning dbt to update your warehouse.`,
                {},
            );
        }
        return undefined;
    };

    // Update the dbt models with type info
    return models.map((model) => ({
        ...model,
        columns: Object.fromEntries(
            Object.entries(model.columns).map(([column_name, column]) => [
                column_name,
                { ...column, data_type: getType(model, column_name) },
            ]),
        ),
    }));
};

export const getSchemaStructureFromDbtModels = (
    dbtModels: DbtModelNode[],
): { database: string; schema: string; table: string }[] =>
    dbtModels.map(({ database, schema, name, alias }) => ({
        database,
        schema,
        table: alias || name,
    }));
