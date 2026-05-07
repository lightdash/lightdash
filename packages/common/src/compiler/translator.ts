import merge from 'lodash/merge';
import partition from 'lodash/partition';
import {
    buildModelGraph,
    convertColumnMetric,
    convertModelMetric,
    convertToAiHints,
    convertToGroups,
    isV9MetricRef,
    patchPathParts,
    SupportedDbtAdapter,
    type DbtColumnLightdashDimension,
    type DbtColumnMetadata,
    type DbtExploreLightdashAdditionalDimension,
    type DbtMetric,
    type DbtModelColumn,
    type DbtModelNode,
    type LineageGraph,
} from '../types/dbt';
import {
    CompileError,
    MissingCatalogEntryError,
    ParseError,
} from '../types/errors';
import {
    InlineErrorType,
    isExploreError,
    type Explore,
    type ExploreError,
    type InlineError,
    type Table,
} from '../types/explore';
import {
    defaultSql,
    DimensionType,
    FieldType,
    friendlyName,
    MetricType,
    parseMetricType,
    type Dimension,
    type Metric,
    type Source,
} from '../types/field';
import {
    parseFilters,
    parseModelRequiredFilters,
} from '../types/filterGrammar';
import {
    type CustomGranularity,
    type LightdashProjectConfig,
} from '../types/lightdashProjectConfig';
import { OrderFieldsByStrategy, type GroupType } from '../types/table';
import { type TimeFrames } from '../types/timeFrames';
import { type WarehouseSqlBuilder } from '../types/warehouse';
import assertUnreachable from '../utils/assertUnreachable';
import {
    getDefaultTimeFrames,
    isTimeInterval,
    timeFrameConfigs,
    validateTimeFrames,
    type WeekDay,
} from '../utils/timeFrames';
import { ExploreCompiler } from './exploreCompiler';
import {
    getCategoriesFromResource,
    getSpotlightConfigurationForResource,
} from './lightdashProjectConfig';

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
        case SupportedDbtAdapter.DUCKDB:
            return timestampSql;
        case SupportedDbtAdapter.DATABRICKS:
            return timestampSql;
        // Athena uses Trino SQL, timestamps return in server timezone
        case SupportedDbtAdapter.TRINO:
        case SupportedDbtAdapter.ATHENA:
            return timestampSql;
        case SupportedDbtAdapter.CLICKHOUSE:
            // DateTime: stored in server timezone, returns in server timezone
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
    dimension?: DbtColumnMetadata['dimension'],
): boolean =>
    [DimensionType.DATE, DimensionType.TIMESTAMP].includes(dimensionType) &&
    dimension?.time_intervals !== false &&
    ((dimension?.time_intervals && dimension.time_intervals !== 'OFF') ||
        !dimension?.time_intervals);

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
    disableTimestampConversion?: boolean,
): Dimension => {
    // Config block takes priority, then meta block
    const meta = merge({}, column.meta, column.config?.meta);
    let type = meta.dimension?.type || column.data_type || DimensionType.STRING;
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
    let name = meta.dimension?.name || column.name;
    let sql = meta.dimension?.sql || defaultSql(column.name);
    let label = meta.dimension?.label || friendlyName(name);
    if (type === DimensionType.TIMESTAMP && !disableTimestampConversion) {
        sql = convertTimezone(sql, 'UTC', 'UTC', targetWarehouse);
    }
    const isIntervalBase =
        timeInterval === undefined && isInterval(type, meta.dimension);

    let timeIntervalBaseDimensionName: string | undefined;
    let timeIntervalBaseDimensionType: DimensionType | undefined;

    const groups: string[] = convertToGroups(
        meta.dimension?.groups,
        meta.dimension?.group_label,
    );

    if (timeInterval) {
        timeIntervalBaseDimensionName = name;
        timeIntervalBaseDimensionType = type;
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
            meta.dimension?.label ??
                friendlyName(timeIntervalBaseDimensionName),
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
        description: meta.dimension?.description || column.description,
        source,
        timeInterval,
        timeIntervalBaseDimensionName,
        timeIntervalBaseDimensionType,
        hidden: !!meta.dimension?.hidden,
        format: meta.dimension?.format,
        round: meta.dimension?.round,
        compact: meta.dimension?.compact,
        requiredAttributes: meta.dimension?.required_attributes,
        anyAttributes: meta.dimension?.any_attributes,
        colors: meta.dimension?.colors,
        ...(meta.dimension?.urls ? { urls: meta.dimension.urls } : {}),
        ...(meta.dimension?.image ? { image: meta.dimension.image } : {}),
        ...(meta.dimension?.richText
            ? { richText: meta.dimension.richText }
            : {}),
        ...(isAdditionalDimension ? { isAdditionalDimension } : {}),
        // Polarity flip: YAML reads `convert_timezone: false` (defaults true,
        // matches dbt convention); in-memory we store the inverse so truthiness
        // matches the semantic — `if (dim.skipTimezoneConversion)` is correct,
        // no `=== false` trap, and absent collapses to the default.
        ...(meta.dimension?.convert_timezone === false
            ? { skipTimezoneConversion: true }
            : {}),
        groups,
        isIntervalBase,
        ...(meta.dimension && meta.dimension.tags
            ? {
                  tags: Array.isArray(meta.dimension.tags)
                      ? meta.dimension.tags
                      : [meta.dimension.tags],
              }
            : {}),
        ...(meta.dimension?.ai_hint
            ? { aiHint: convertToAiHints(meta.dimension.ai_hint) }
            : {}),
        ...(meta.dimension?.case_sensitive !== undefined
            ? { caseSensitive: meta.dimension.case_sensitive }
            : {}),
        ...(meta.dimension?.spotlight?.filter_by === false ||
        meta.dimension?.spotlight?.segment_by === false
            ? {
                  spotlight: {
                      ...(meta.dimension?.spotlight?.filter_by === false && {
                          filterBy: false,
                      }),
                      ...(meta.dimension?.spotlight?.segment_by === false && {
                          segmentBy: false,
                      }),
                  },
              }
            : {}),
    };
};

/**
 * Convert an explore-scoped additional dimension to Dimension(s).
 * Reuses convertDimension by creating a synthetic column object.
 * Returns the base dimension plus any time interval dimensions.
 */
const convertExploreScopedDimension = (
    index: number,
    tableName: string,
    tableLabel: string,
    dimensionName: string,
    dimensionConfig: DbtExploreLightdashAdditionalDimension,
    targetWarehouse: SupportedDbtAdapter,
    startOfWeek?: WeekDay | null,
): Record<string, Dimension> => {
    // Create a synthetic column to reuse convertDimension
    const syntheticColumn: DbtModelColumn = {
        name: dimensionName,
        data_type: dimensionConfig.type,
        meta: {
            dimension: dimensionConfig,
        },
    };

    const syntheticModel = {
        name: tableName,
        relation_name: tableName,
    };

    const baseDimension = convertDimension(
        index,
        targetWarehouse,
        syntheticModel,
        tableLabel,
        syntheticColumn,
        undefined,
        undefined,
        startOfWeek,
        true, // isAdditionalDimension
    );

    const result: Record<string, Dimension> = {
        [dimensionName]: baseDimension,
    };

    // Process time intervals if applicable (same logic as column-level additional dimensions)
    if (baseDimension.isIntervalBase) {
        let intervals: TimeFrames[] = [];

        if (
            dimensionConfig.time_intervals &&
            Array.isArray(dimensionConfig.time_intervals)
        ) {
            intervals = validateTimeFrames(dimensionConfig.time_intervals);
        } else {
            intervals = getDefaultTimeFrames(dimensionConfig.type);
        }

        intervals.forEach((interval) => {
            const intervalDimension = convertDimension(
                index,
                targetWarehouse,
                syntheticModel,
                tableLabel,
                syntheticColumn,
                undefined,
                interval,
                startOfWeek,
                true, // isAdditionalDimension
            );
            result[intervalDimension.name] = intervalDimension;
        });
    }

    return result;
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

/**
 * @deprecated This function uses the old dbt metrics format.
 */
const convertDbtMetricToLightdashMetric = (
    metric: DbtMetric,
    tableName: string,
    tableLabel: string,
    spotlightConfig: LightdashProjectConfig['spotlight'],
    modelCategories: string[] | undefined,
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
    const spotlightVisibility = spotlightConfig.default_visibility;

    const spotlightCategories = getCategoriesFromResource(
        'metric',
        metric.name,
        spotlightConfig,
        Array.from(new Set([...(modelCategories || [])])),
    );

    return {
        fieldType: FieldType.METRIC,
        type,
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
        ...(metric.meta && metric.meta.tags
            ? {
                  tags: Array.isArray(metric.meta.tags)
                      ? metric.meta.tags
                      : [metric.meta.tags],
              }
            : {}),
        ...getSpotlightConfigurationForResource({
            visibility: spotlightVisibility,
            categories: spotlightCategories,
            owner: metric.meta?.spotlight?.owner,
        }),
    };
};

function normalizePrimaryKey(
    primaryKey: DbtModelNode['meta']['primary_key'],
): string[] | undefined {
    if (primaryKey) {
        return Array.isArray(primaryKey) ? primaryKey : [primaryKey];
    }
    return undefined;
}

function validateSets(
    dimensions: Record<string, Dimension>,
    allMetrics: Record<string, Metric>,
    model: DbtModelNode,
    meta: DbtModelNode['meta'],
    allowPartialCompilation?: boolean,
): InlineError[] {
    const warnings: InlineError[] = [];
    const allFieldNames = new Set([
        ...Object.keys(dimensions),
        ...Object.keys(allMetrics),
    ]);

    if (!meta.sets) return warnings;

    Object.entries(meta.sets).forEach(([setName, setDef]) => {
        // Validate set name doesn't conflict with field names
        if (allFieldNames.has(setName)) {
            const errorMessage = `Set name "${setName}" in model "${model.name}" conflicts with an existing field name. Set names must be unique from dimension and metric names.`;
            if (allowPartialCompilation) {
                warnings.push({
                    type: InlineErrorType.SET_VALIDATION_ERROR,
                    message: errorMessage,
                });
                return; // Skip this set
            }
            throw new ParseError(errorMessage);
        }

        // Validate set definition structure
        if (!setDef.fields || !Array.isArray(setDef.fields)) {
            const errorMessage = `Set "${setName}" in model "${model.name}" must have a "fields" array`;
            if (allowPartialCompilation) {
                warnings.push({
                    type: InlineErrorType.SET_VALIDATION_ERROR,
                    message: errorMessage,
                });
                return; // Skip this set
            }
            throw new ParseError(errorMessage);
        }

        if (setDef.fields.length === 0) {
            const errorMessage = `Set "${setName}" in model "${model.name}" cannot be empty`;
            if (allowPartialCompilation) {
                warnings.push({
                    type: InlineErrorType.SET_VALIDATION_ERROR,
                    message: errorMessage,
                });
                return; // Skip this set
            }
            throw new ParseError(errorMessage);
        }

        // Validate field names don't have invalid characters
        setDef.fields.forEach((field) => {
            if (typeof field !== 'string') {
                const errorMessage = `Set "${setName}" in model "${model.name}" contains non-string field: ${field}`;
                if (allowPartialCompilation) {
                    warnings.push({
                        type: InlineErrorType.SET_VALIDATION_ERROR,
                        message: errorMessage,
                    });
                    return; // Skip this field
                }
                throw new ParseError(errorMessage);
            }

            // Allow field references ending with * (set references)
            // Allow field references starting with - (exclusions)
            const cleanField = field.replace(/^-/, '').replace(/\*$/, '');

            // Validate that the clean field name follows the lightdash variable pattern
            // (letters, numbers, underscores, and dots only)
            if (cleanField && !/^[a-zA-Z0-9_.]+$/.test(cleanField)) {
                const errorMessage = `Set "${setName}" in model "${model.name}" contains invalid field name "${field}". Field names must contain only letters, numbers, underscores, and dots.`;
                if (allowPartialCompilation) {
                    warnings.push({
                        type: InlineErrorType.SET_VALIDATION_ERROR,
                        message: errorMessage,
                    });
                    return; // Skip this field
                }
                throw new ParseError(errorMessage);
            }

            const isModelFieldName =
                !field.endsWith('*') && !field.startsWith('-');

            // Validate that regular field references exist in the model
            if (isModelFieldName) {
                const [joinName, fieldName] = field.includes('.')
                    ? field.split('.')
                    : [null, field];

                if (joinName) {
                    const joins = model.meta?.joins || [];
                    const allJoinNames = joins.map((j) => j.alias || j.join);

                    if (!allJoinNames.includes(joinName)) {
                        const errorMessage = `Set "${setName}" in model "${model.name}" references non-existent join model "${joinName}".`;
                        if (allowPartialCompilation) {
                            warnings.push({
                                type: InlineErrorType.SET_VALIDATION_ERROR,
                                message: errorMessage,
                            });
                            return; // Skip this field
                        }
                        throw new ParseError(errorMessage);
                    }
                } else if (!allFieldNames.has(fieldName)) {
                    const errorMessage = `Set "${setName}" in model "${model.name}" references non-existent model field "${field}". Fields must correspond to actual dimensions or metrics in the model.`;
                    if (allowPartialCompilation) {
                        warnings.push({
                            type: InlineErrorType.SET_VALIDATION_ERROR,
                            message: errorMessage,
                        });
                        return; // Skip this field
                    }
                    throw new ParseError(errorMessage);
                }
            }

            // Validate nesting level: if this set references another set,
            // we check up to 3 levels of nesting
            const checkNesting = (
                fields: (string | unknown)[],
                depth: number,
            ) => {
                if (depth > 3) {
                    const errorMessage = `Set "${setName}" in model "${model.name}" exceeds the maximum nesting level of 3.`;
                    if (allowPartialCompilation) {
                        warnings.push({
                            type: InlineErrorType.SET_VALIDATION_ERROR,
                            message: errorMessage,
                        });
                        return; // Stop checking nesting
                    }
                    throw new ParseError(errorMessage);
                }

                fields.forEach((f) => {
                    if (
                        typeof f === 'string' &&
                        f.endsWith('*') &&
                        !f.startsWith('-')
                    ) {
                        const referencedSetName = f.substring(0, f.length - 1);
                        const referencedSet = meta.sets?.[referencedSetName];

                        if (referencedSet) {
                            checkNesting(referencedSet.fields, depth + 1);
                        }
                    }
                });
            };

            if (!isModelFieldName && field.endsWith('*')) {
                const referencedSetName = field.substring(0, field.length - 1);
                const referencedSet = meta.sets?.[referencedSetName];

                if (referencedSet) {
                    checkNesting(referencedSet.fields, 2);
                }
            }
        });
    });

    return warnings;
}

export const convertTable = (
    adapterType: SupportedDbtAdapter,
    model: DbtModelNode,
    dbtMetrics: DbtMetric[],
    spotlightConfig: LightdashProjectConfig['spotlight'],
    startOfWeek?: WeekDay | null,
    disableTimestampConversion?: boolean,
    customGranularities?: Record<string, CustomGranularity>,
    allowPartialCompilation?: boolean,
): Omit<Table, 'lineageGraph'> => {
    // Config block takes priority, then meta block
    const meta = merge({}, model.meta, model.config?.meta);
    const tableLabel = meta.label || friendlyName(model.name);
    const tableWarnings: InlineError[] = [];

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
                undefined,
                disableTimestampConversion,
            );

            // Config block takes priority, then meta block
            const columnMeta = merge({}, column.meta, column.config?.meta);

            const processIntervalDimension = (
                dim: Dimension,
                overrideTimeIntervals: DbtColumnLightdashDimension['time_intervals'],
            ) => {
                if (dim.isIntervalBase) {
                    let allIntervals: (TimeFrames | string)[] = [];

                    if (
                        !dim.isAdditionalDimension &&
                        columnMeta.dimension?.time_intervals &&
                        Array.isArray(columnMeta?.dimension.time_intervals)
                    ) {
                        allIntervals = columnMeta.dimension.time_intervals;
                    } else if (
                        dim.isAdditionalDimension &&
                        Array.isArray(overrideTimeIntervals)
                    ) {
                        allIntervals = overrideTimeIntervals;
                    } else {
                        allIntervals = getDefaultTimeFrames(dim.type);
                    }

                    // Split into standard TimeFrames and custom granularity names
                    const intervals = validateTimeFrames(allIntervals);
                    const customIntervalNames = allIntervals.filter(
                        (v) => !isTimeInterval(v.toUpperCase()),
                    );

                    const dimensionMeta = {
                        ...columnMeta.dimension,
                        type: dim.type,
                        label: dim.label,
                        groups: dim.groups,
                        sql: dim.sql,
                        description: dim.description,
                        hidden: dim.hidden,
                    };

                    // Generate standard interval dimensions
                    const standardDims = intervals.reduce<
                        Record<string, Dimension>
                    >(
                        (acc, interval) => ({
                            ...acc,
                            [`${dim.name}_${interval.toLowerCase()}`]:
                                convertDimension(
                                    index,
                                    adapterType,
                                    model,
                                    tableLabel,
                                    {
                                        ...column,
                                        ...('isAdditionalDimension' in dim &&
                                        dim.isAdditionalDimension
                                            ? {
                                                  name: dim.name,
                                                  meta: {
                                                      dimension: dimensionMeta,
                                                  },
                                                  // In dbt 1.10+, config.meta takes precedence over meta
                                                  // so we must set config.meta.dimension to prevent
                                                  // the base dimension's properties from overwriting
                                                  config: {
                                                      meta: {
                                                          dimension:
                                                              dimensionMeta,
                                                      },
                                                  },
                                              }
                                            : {}),
                                    },
                                    undefined,
                                    interval,
                                    startOfWeek,
                                    'isAdditionalDimension' in dim &&
                                        dim.isAdditionalDimension,
                                    disableTimestampConversion,
                                ),
                        }),
                        {},
                    );

                    // Generate custom granularity dimensions
                    const customDims = customIntervalNames.reduce<
                        Record<string, Dimension>
                    >((acc, customName) => {
                        const granularity = customGranularities?.[customName];
                        if (!granularity) {
                            tableWarnings.push({
                                type: InlineErrorType.FIELD_ERROR,
                                message: `Unknown time interval "${customName}" on column "${dim.name}" in model "${model.name}". It is not a standard time frame or a custom granularity defined in lightdash.config.yml.`,
                            });
                            return acc;
                        }

                        const customSql = granularity.sql.replace(
                            /\$\{COLUMN\}/g,
                            () => dim.sql,
                        );
                        const customType =
                            granularity.type || DimensionType.DATE;
                        const customDimName = `${dim.name}_${customName}`;

                        const groups: string[] = [...(dim.groups || [])];
                        if (!groups.includes(dim.label)) {
                            groups.push(dim.label);
                        }

                        return {
                            ...acc,
                            [customDimName]: {
                                index,
                                fieldType: FieldType.DIMENSION,
                                name: customDimName,
                                label: granularity.label,
                                sql: customSql,
                                table: model.name,
                                tableLabel,
                                type: customType,
                                description: dim.description,
                                source: undefined,
                                timeInterval: undefined,
                                timeIntervalBaseDimensionName: dim.name,
                                timeIntervalBaseDimensionType: dim.type,
                                customTimeInterval: customName,
                                hidden: dim.hidden,
                                format: undefined,
                                round: undefined,
                                compact: undefined,
                                requiredAttributes: dim.requiredAttributes,
                                anyAttributes: dim.anyAttributes,
                                groups,
                                isIntervalBase: false,
                                isAdditionalDimension:
                                    dim.isAdditionalDimension,
                                ...(dim.skipTimezoneConversion
                                    ? { skipTimezoneConversion: true }
                                    : {}),
                            } satisfies Dimension,
                        };
                    }, {});

                    return { ...standardDims, ...customDims };
                }
                return {};
            };

            let extraDimensions = {
                ...processIntervalDimension(dimension, undefined),
            };

            extraDimensions = Object.entries(
                columnMeta.additional_dimensions || {},
            ).reduce((acc, [subDimensionName, subDimension]) => {
                const additionalDim = convertDimension(
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
                        config: {
                            meta: {
                                dimension: subDimension,
                            },
                        },
                    },
                    undefined,
                    undefined,
                    startOfWeek,
                    true,
                    disableTimestampConversion,
                );

                return {
                    ...acc,
                    // When the additional dim is interval AND the base dimension is a interval base then we want to compute all additional dims with the parent intervals otherwise just set the additional dim
                    [subDimensionName]: additionalDim,
                    ...processIntervalDimension(
                        additionalDim,
                        subDimension.time_intervals,
                    ),
                };
            }, extraDimensions);

            const columnMetrics = Object.fromEntries(
                Object.entries(columnMeta.metrics || {}).map(
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
                            anyAttributes: dimension.anyAttributes, // TODO Join dimension any_attributes with metric any_attributes
                            spotlightConfig: {
                                ...spotlightConfig,
                                default_visibility:
                                    meta.spotlight?.visibility ??
                                    spotlightConfig.default_visibility,
                            },
                            modelCategories: meta.spotlight?.categories,
                            modelOwner: meta.spotlight?.owner ?? meta.owner,
                            defaultShowUnderlyingValues:
                                meta.default_show_underlying_values,
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
        Object.entries(meta.metrics || {}).map(([name, metric]) => [
            name,
            convertModelMetric({
                modelName: model.name,
                name,
                metric,
                tableLabel,
                spotlightConfig: {
                    ...spotlightConfig,
                    default_visibility:
                        meta.spotlight?.visibility ??
                        spotlightConfig.default_visibility,
                },
                modelCategories: meta.spotlight?.categories,
                modelOwner: meta.spotlight?.owner ?? meta.owner,
                defaultShowUnderlyingValues:
                    meta.default_show_underlying_values,
            }),
        ]),
    );

    const convertedDbtMetrics = Object.fromEntries(
        dbtMetrics.map((metric) => [
            metric.name,
            convertDbtMetricToLightdashMetric(
                metric,
                model.name,
                tableLabel,
                {
                    ...spotlightConfig,
                    default_visibility:
                        meta.spotlight?.visibility ??
                        spotlightConfig.default_visibility,
                },
                meta.spotlight?.categories,
            ),
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
        duplicatedNames.forEach((name) => {
            delete allMetrics[name];
            tableWarnings.push({
                type: InlineErrorType.DUPLICATE_FIELD_NAME,
                message: `Skipped metric "${name}" because a dimension with the same name exists. Dimensions take priority.`,
            });
        });
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

    if (meta.sets) {
        const warnings = validateSets(
            dimensions,
            allMetrics,
            model,
            meta,
            allowPartialCompilation,
        );
        tableWarnings.push(...warnings);
    }

    const sqlTable = meta.sql_from || model.relation_name;
    if (sqlTable === null || sqlTable === undefined || sqlTable === '') {
        throw new Error(`Model "${model.name}" is missing a table reference.`);
    }
    return {
        name: model.name,
        label: tableLabel,
        database: model.database,
        schema: model.schema,
        sqlTable,
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
        primaryKey: normalizePrimaryKey(meta.primary_key),
        sqlWhere: meta.sql_filter || meta.sql_where,
        requiredFilters: parseModelRequiredFilters({
            requiredFilters: meta.required_filters,
            defaultFilters: meta.default_filters,
        }),
        requiredAttributes: meta.required_attributes,
        anyAttributes: meta.any_attributes,
        groupDetails,
        ...(meta.default_time_dimension
            ? {
                  defaultTimeDimension: {
                      field: meta.default_time_dimension.field,
                      interval: meta.default_time_dimension.interval,
                  },
              }
            : {}),
        ...(meta.default_show_underlying_values
            ? {
                  defaultShowUnderlyingValues:
                      meta.default_show_underlying_values,
              }
            : {}),
        ...(meta.ai_hint ? { aiHint: convertToAiHints(meta.ai_hint) } : {}),
        ...(meta.parameters ? { parameters: meta.parameters } : {}),
        ...(meta.sets ? { sets: meta.sets } : {}),
        ...(tableWarnings.length > 0 ? { warnings: tableWarnings } : {}),
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

export type ExplorePostProcessor = (
    compiledExplores: Explore[],
    context: {
        model: DbtModelNode;
        meta: Record<string, unknown>;
    },
) => (Explore | ExploreError)[];

export type ConvertExploresOptions = {
    disableTimestampConversion?: boolean;
    allowPartialCompilation?: boolean;
    postProcessors?: ExplorePostProcessor[];
};

export const convertExplores = async (
    models: DbtModelNode[],
    loadSources: boolean,
    adapterType: SupportedDbtAdapter,
    metrics: DbtMetric[],
    warehouseSqlBuilder: WarehouseSqlBuilder,
    lightdashProjectConfig: LightdashProjectConfig,
    options?: ConvertExploresOptions,
): Promise<(Explore | ExploreError)[]> => {
    const {
        disableTimestampConversion,
        allowPartialCompilation,
        postProcessors,
    } = options ?? {};
    const tableLineage = translateDbtModelsToTableLineage(models);
    const [tables, exploreErrors] = models.reduce(
        ([accTables, accErrors], model) => {
            // Config block takes priority, then meta block
            const meta = merge({}, model.meta, model.config?.meta);

            // model.config.tags has type string[] | string | undefined - normalise it to string[]
            const configTags =
                typeof model.config?.tags === 'string'
                    ? [model.config.tags]
                    : model.config?.tags;

            // model.config.tags takes priority over model.tags - if config tags is an empty list, we'll use model tags
            const tags =
                configTags && configTags.length > 0 ? configTags : model.tags;

            // If there are any errors compiling the table return an ExploreError
            try {
                // base dimensions and metrics
                // TODO: remove old metrics handling
                const tableMetrics = metrics.filter((metric) =>
                    modelCanUseMetric(metric.name, model.name, metrics),
                );
                const table = convertTable(
                    adapterType,
                    model,
                    tableMetrics,
                    lightdashProjectConfig.spotlight,
                    warehouseSqlBuilder.getStartOfWeek(),
                    disableTimestampConversion,
                    lightdashProjectConfig.custom_granularities,
                    allowPartialCompilation,
                );

                // add lineage
                const tableWithLineage: Table = {
                    ...table,
                    ...tableLineage[model.name],
                };

                return [[...accTables, tableWithLineage], accErrors];
            } catch (e: unknown) {
                const exploreError: ExploreError = {
                    name: model.name,
                    label: meta.label || friendlyName(model.name),
                    tags,
                    groupLabel: meta.group_label,
                    ...(meta.groups && meta.groups.length > 0
                        ? { groups: meta.groups }
                        : {}),
                    errors: [
                        {
                            type:
                                e instanceof ParseError
                                    ? InlineErrorType.METADATA_PARSE_ERROR
                                    : InlineErrorType.NO_DIMENSIONS_FOUND,
                            message:
                                e instanceof Error
                                    ? e.message
                                    : `Could not convert dbt model: "${model.name}" in to a Lightdash explore`,
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
        (model) =>
            tableLookup[model.name] !== undefined &&
            // Seeds are compiled as tables (for join resolution) but should
            // not generate standalone explores — they're join targets only.
            model.resource_type !== 'seed',
    );

    const exploreCompiler = new ExploreCompiler(warehouseSqlBuilder, {
        allowPartialCompilation,
    });
    const explores: (Explore | ExploreError)[] = validModels.reduce<
        (Explore | ExploreError)[]
    >((acc, model) => {
        // Config block takes priority, then meta block
        const meta = merge({}, model.meta, model.config?.meta);

        const configTags =
            typeof model.config?.tags === 'string'
                ? [model.config.tags]
                : model.config?.tags;
        const tags =
            configTags && configTags.length > 0 ? configTags : model.tags;

        // Create an array of explores to generate: base explore + any additional explores
        const exploresToCreate = [
            {
                name: model.name,
                label: meta.label || friendlyName(model.name),
                groupLabel: meta.group_label,
                ...(meta.groups && meta.groups.length > 0
                    ? { groups: meta.groups }
                    : {}),
                joins: meta?.joins || [],
                description: meta.description,
                caseSensitive: meta.case_sensitive,
                tables: tableLookup,
            },
            ...(meta.explores
                ? Object.entries(meta.explores).map(
                      ([exploreName, exploreConfig]) => {
                          const baseTable = tableLookup[model.name];
                          const baseTableLabel =
                              meta.label || friendlyName(model.name);

                          // Convert explore-scoped additional dimensions
                          let exploreScopedDimensions: Record<
                              string,
                              Dimension
                          > = {};
                          if (exploreConfig.additional_dimensions) {
                              const existingDimensionCount = Object.keys(
                                  baseTable.dimensions,
                              ).length;

                              Object.entries(
                                  exploreConfig.additional_dimensions,
                              ).forEach(([dimName, dimConfig], dimIndex) => {
                                  const convertedDims =
                                      convertExploreScopedDimension(
                                          existingDimensionCount + dimIndex,
                                          model.name,
                                          baseTableLabel,
                                          dimName,
                                          dimConfig,
                                          adapterType,
                                          warehouseSqlBuilder.getStartOfWeek(),
                                      );
                                  exploreScopedDimensions = {
                                      ...exploreScopedDimensions,
                                      ...convertedDims,
                                  };
                              });
                          }

                          return {
                              name: exploreName,
                              label:
                                  exploreConfig.label ||
                                  friendlyName(exploreName),
                              groupLabel:
                                  exploreConfig.group_label || meta.group_label,
                              ...((exploreConfig.groups &&
                                  exploreConfig.groups.length > 0) ||
                              (meta.groups && meta.groups.length > 0)
                                  ? {
                                        groups:
                                            exploreConfig.groups || meta.groups,
                                    }
                                  : {}),
                              // Inherit joins from base model if not specified in explore config
                              joins: exploreConfig.joins || meta?.joins || [],
                              description: exploreConfig.description,
                              caseSensitive: exploreConfig.case_sensitive,
                              tables: {
                                  ...tableLookup,
                                  // Override the base table with required filters and explore-scoped dimensions
                                  [model.name]: {
                                      ...baseTable,
                                      sqlWhere:
                                          exploreConfig.sql_filter ||
                                          exploreConfig.sql_where ||
                                          baseTable.sqlWhere,
                                      requiredFilters:
                                          parseModelRequiredFilters({
                                              requiredFilters:
                                                  exploreConfig.required_filters,
                                              defaultFilters:
                                                  exploreConfig.default_filters,
                                          }),
                                      // Merge explore-scoped dimensions with existing dimensions
                                      dimensions: {
                                          ...baseTable.dimensions,
                                          ...exploreScopedDimensions,
                                      },
                                  },
                              },
                          };
                      },
                  )
                : []),
        ];

        // Multiple explores can be created from a single model. The base explore + additional explores
        // Properties created from `model` are the same across all explores. e.g. all explores will have the same base table & warehouse
        // Properties created from `exploreToCreate` are specific to each explore. e.g. each explore can have a different name, label & joins
        const compiledExplores = exploresToCreate.map((exploreToCreate) => {
            try {
                return exploreCompiler.compileExplore({
                    name: exploreToCreate.name,
                    label: exploreToCreate.label,
                    tags: tags || [],
                    baseTable: model.name,
                    groupLabel: exploreToCreate.groupLabel,
                    ...(exploreToCreate.groups &&
                    exploreToCreate.groups.length > 0
                        ? { groups: exploreToCreate.groups }
                        : {}),
                    caseSensitive: exploreToCreate.caseSensitive,
                    joinedTables: exploreToCreate.joins.map((join) => ({
                        table: join.join,
                        sqlOn: join.sql_on,
                        type: join.type,
                        alias: join.alias,
                        label: join.label,
                        fields: join.fields,
                        hidden: join.hidden,
                        always: join.always,
                        relationship: join.relationship,
                        description: join.description,
                    })),
                    tables: exploreToCreate.tables,
                    targetDatabase: adapterType,
                    warehouse: model.config?.snowflake_warehouse,
                    databricksCompute: model.config?.databricks_compute,
                    ymlPath: model.patch_path
                        ? patchPathParts(model.patch_path).path
                        : undefined,
                    sqlPath: model.path,
                    spotlightConfig: lightdashProjectConfig.spotlight,
                    ...(meta.ai_hint
                        ? { aiHint: convertToAiHints(meta.ai_hint) }
                        : {}),
                    meta: {
                        ...meta,
                        // Override description for additional explores
                        ...(exploreToCreate.description !== undefined
                            ? { description: exploreToCreate.description }
                            : {}),
                    },
                    projectParameters: lightdashProjectConfig.parameters,
                    projectDefaults: lightdashProjectConfig.defaults,
                });
            } catch (e: unknown) {
                return {
                    name: exploreToCreate.name,
                    label: exploreToCreate.label,
                    groupLabel: exploreToCreate.groupLabel,
                    ...(exploreToCreate.groups &&
                    exploreToCreate.groups.length > 0
                        ? { groups: exploreToCreate.groups }
                        : {}),
                    errors: [
                        {
                            // TODO improve parsing of error type
                            type:
                                e instanceof ParseError ||
                                e instanceof CompileError
                                    ? InlineErrorType.METADATA_PARSE_ERROR
                                    : InlineErrorType.NO_DIMENSIONS_FOUND,
                            message:
                                e instanceof Error
                                    ? e.message
                                    : `Could not convert ${
                                          exploreToCreate.name === model.name
                                              ? 'dbt model'
                                              : 'additional explore'
                                      }: "${exploreToCreate.name}" ${
                                          exploreToCreate.name !== model.name
                                              ? `from model "${model.name}"`
                                              : 'is not a valid model'
                                      }`,
                        },
                    ],
                } as ExploreError;
            }
        });

        // Split compiled explores into successes and errors,
        // then run post-processors over successful explores only
        const [compileErrors, successfulExplores] = partition(
            compiledExplores,
            isExploreError,
        );

        const postProcessorContext = {
            model,
            meta,
        };
        const postProcessedExplores = (postProcessors ?? []).reduce<
            (Explore | ExploreError)[]
        >((currentExplores, processor) => {
            const [errors, successes] = partition(
                currentExplores,
                isExploreError,
            );
            return [...errors, ...processor(successes, postProcessorContext)];
        }, successfulExplores);

        return [...acc, ...compileErrors, ...postProcessedExplores];
    }, []);

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
