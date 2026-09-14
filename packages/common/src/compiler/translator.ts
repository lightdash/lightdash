import merge from 'lodash/merge';
import partition from 'lodash/partition';
import {
    getManifestNamespaceKey,
    qualifyManifestNames,
} from '../dbt/qualifiedName';
import {
    buildModelGraph,
    convertColumnMetric,
    convertModelMetric,
    convertToAiHints,
    convertToGroups,
    patchPathParts,
    RESERVED_MODEL_META_KEYS,
    SupportedDbtAdapter,
    type DbtColumnLightdashDimension,
    type DbtColumnMetadata,
    type DbtExploreLightdashAdditionalDimension,
    type DbtModelColumn,
    type DbtModelNode,
    type LineageGraph,
} from '../types/dbt';
import {
    CompileError,
    MissingCatalogEntryError,
    NotSupportedError,
    ParseError,
} from '../types/errors';
import {
    InlineErrorType,
    isExploreError,
    JoinRelationship,
    type CustomMetaValue,
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
    isTimestampDomain,
    type Dimension,
    type Metric,
    type Source,
    type TimestampDomain,
} from '../types/field';
import { parseModelRequiredFilters } from '../types/filterGrammar';
import {
    type CustomGranularity,
    type LightdashProjectConfig,
} from '../types/lightdashProjectConfig';
import { OrderFieldsByStrategy, type FieldGroupType } from '../types/table';
import { type TimeFrames } from '../types/timeFrames';
import {
    getCatalogNestedColumnShape,
    getCatalogTimestampDomain,
    WAREHOUSE_TIMESTAMP_DOMAINS_KEY,
    type WarehouseCatalog,
    type WarehouseNestedColumnShape,
    type WarehouseSqlBuilder,
    type WarehouseTableSchema,
} from '../types/warehouse';
import assertUnreachable from '../utils/assertUnreachable';
import {
    getDefaultTimeFrames,
    getTimeFramesWithProjectDefaults,
    isTimeInterval,
    timeFrameConfigs,
    validateTimeFrames,
    type ResolvedAdditionalTimeIntervals,
    type WeekDay,
} from '../utils/timeFrames';
import {
    ExploreCompiler,
    showUnderlyingValuesWarning,
} from './exploreCompiler';
import { expandFieldsWithSetsLenient } from './fieldSetExpander';
import {
    resolveAdditionalTimeIntervals,
    resolveGranularityLabels,
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
        case SupportedDbtAdapter.SPARK:
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

const convertFilterAutocomplete = (
    filterAutocomplete: NonNullable<
        DbtColumnMetadata['dimension']
    >['filter_autocomplete'],
    modelName: string,
    dimensionName: string,
): {
    filterAutocomplete: Dimension['filterAutocomplete'] | undefined;
    warnings: InlineError[];
} => {
    if (!filterAutocomplete) {
        return { filterAutocomplete: undefined, warnings: [] };
    }

    const { values } = filterAutocomplete;
    const duplicateValues = values
        ?.map(({ value }) => value)
        .filter(
            (value, index, allValues) => allValues.indexOf(value) !== index,
        );
    const uniqueValues = values?.filter(
        ({ value }, index, allValues) =>
            allValues.findIndex((item) => item.value === value) === index,
    );
    const warnings: InlineError[] = [];
    if (duplicateValues && duplicateValues.length > 0) {
        warnings.push({
            type: InlineErrorType.FIELD_ERROR,
            message: `Duplicate filter autocomplete values found for dimension "${dimensionName}" in dbt model "${modelName}": ${[
                ...new Set(duplicateValues),
            ].join(', ')}. Keeping the first value and ignoring duplicates.`,
        });
    }

    const optionsFromDimension = filterAutocomplete.options_from_dimension;
    if (
        optionsFromDimension &&
        filterAutocomplete.fetch_from_warehouse === false
    ) {
        warnings.push({
            type: InlineErrorType.FIELD_ERROR,
            message: `Dimension "${dimensionName}" in dbt model "${modelName}" sets both "options_from_dimension" and "fetch_from_warehouse: false". Curated values are used and "options_from_dimension" is ignored.`,
        });
    }

    return {
        filterAutocomplete: {
            ...(uniqueValues ? { values: uniqueValues } : {}),
            fetchFromWarehouse: filterAutocomplete.fetch_from_warehouse ?? true,
            ...(filterAutocomplete.label_dimension
                ? { labelDimension: filterAutocomplete.label_dimension }
                : {}),
            ...(optionsFromDimension
                ? {
                      optionsFromDimension: {
                          model: optionsFromDimension.model,
                          dimension: optionsFromDimension.dimension,
                          ...(optionsFromDimension.label_dimension
                              ? {
                                    labelDimension:
                                        optionsFromDimension.label_dimension,
                                }
                              : {}),
                      },
                  }
                : {}),
        },
        warnings,
    };
};

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
    warnings?: InlineError[],
    granularityLabels?: Partial<Record<TimeFrames, string>>,
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
    // YAML declaration wins over the warehouse catalog. The catalog describes
    // the physical column, so its domain is dropped when custom SQL replaces
    // the column — the expression may change the domain — and for additional
    // dimensions, whose carrier column is the parent's, not their own.
    // Computed on the base type so interval children inherit it like
    // skipTimezoneConversion does.
    const rawTimestampDomain =
        meta.dimension?.timestamp_domain ??
        (meta.dimension?.sql || isAdditionalDimension
            ? undefined
            : column.timestamp_domain);
    const timestampDomain: TimestampDomain | undefined =
        type === DimensionType.TIMESTAMP &&
        isTimestampDomain(rawTimestampDomain)
            ? rawTimestampDomain
            : undefined;
    const isIntervalBase =
        timeInterval === undefined && isInterval(type, meta.dimension);

    let timeIntervalBaseDimensionName: string | undefined;
    let timeIntervalBaseDimensionType: DimensionType | undefined;

    const groups: string[] = convertToGroups(
        meta.dimension?.groups,
        meta.dimension?.group_label,
    );
    const convertedFilterAutocomplete =
        meta.dimension?.filter_autocomplete !== undefined
            ? convertFilterAutocomplete(
                  meta.dimension.filter_autocomplete,
                  model.name,
                  name,
              )
            : undefined;
    if (convertedFilterAutocomplete?.warnings) {
        warnings?.push(...convertedFilterAutocomplete.warnings);
    }

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
        const grainOverride = granularityLabels?.[timeInterval];
        label = grainOverride
            ? `${label} ${grainOverride}`
            : `${label} ${timeFrameConfigs[timeInterval]
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
        ...(timeInterval && granularityLabels?.[timeInterval]
            ? { timeIntervalLabel: granularityLabels[timeInterval] }
            : {}),
        hidden: !!meta.dimension?.hidden,
        format: meta.dimension?.format,
        round: meta.dimension?.round,
        compact: meta.dimension?.compact,
        separator: meta.dimension?.separator,
        requiredAttributes: meta.dimension?.required_attributes,
        anyAttributes: meta.dimension?.any_attributes,
        colors: meta.dimension?.colors,
        ...(meta.dimension?.urls ? { urls: meta.dimension.urls } : {}),
        ...(meta.dimension?.image ? { image: meta.dimension.image } : {}),
        ...(meta.dimension?.richText
            ? { richText: meta.dimension.richText }
            : {}),
        ...(meta.dimension?.filter_autocomplete
            ? {
                  filterAutocomplete:
                      convertedFilterAutocomplete?.filterAutocomplete,
              }
            : {}),
        ...(isAdditionalDimension ? { isAdditionalDimension } : {}),
        // Polarity flip: YAML reads `convert_timezone: false` (defaults true,
        // matches dbt convention); in-memory we store the inverse so truthiness
        // matches the semantic — `if (dim.skipTimezoneConversion)` is correct,
        // no `=== false` trap, and absent collapses to the default.
        ...(meta.dimension?.convert_timezone === false
            ? { skipTimezoneConversion: true }
            : {}),
        ...(timestampDomain ? { timestampDomain } : {}),
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

const getColumnMeta = (column: DbtModelColumn): DbtColumnMetadata =>
    merge({}, column.meta, column.config?.meta);

const hasRepeatedAncestor = (column: DbtModelColumn): boolean =>
    (column.repeated_ancestors?.length ?? 0) > 0;

export const convertTable = (
    adapterType: SupportedDbtAdapter,
    model: DbtModelNode,
    spotlightConfig: LightdashProjectConfig['spotlight'],
    startOfWeek?: WeekDay | null,
    disableTimestampConversion?: boolean,
    customGranularities?: Record<string, CustomGranularity>,
    allowPartialCompilation?: boolean,
    additionalTimeIntervals?: ResolvedAdditionalTimeIntervals,
    granularityLabels?: Partial<Record<TimeFrames, string>>,
    unnestRepeatedColumns?: boolean,
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
            // Config block takes priority, then meta block
            const columnMeta = merge({}, column.meta, column.config?.meta);
            const routedByUnnest =
                unnestRepeatedColumns && !columnMeta.dimension?.sql;
            // Leaves under an array belong to the unnested table, unless
            // custom SQL made the column scalar on purpose.
            if (routedByUnnest && hasRepeatedAncestor(column)) {
                return [prevDimensions, prevMetrics];
            }
            // A struct or array can't be selected as a scalar, but the
            // additional dimensions and explicit-SQL metrics declared under
            // it dereference its fields and stay on the model.
            const isContainer =
                routedByUnnest && column.nested_shape !== undefined;
            const isScalarArray =
                isContainer &&
                column.nested_shape?.repeated === true &&
                column.nested_shape.record === false;
            const dimension = isContainer
                ? undefined
                : convertDimension(
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
                      tableWarnings,
                      granularityLabels,
                  );

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
                        allIntervals = getTimeFramesWithProjectDefaults(
                            dim.type,
                            additionalTimeIntervals,
                        );
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
                        // Additional-dim children must inherit the additional
                        // dimension's own resolved domain, not the parent
                        // column's annotation riding in the meta spread.
                        timestamp_domain: dim.timestampDomain,
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
                                    // Additional-dim children derive from the
                                    // parent's compiled sql, which already
                                    // carries the timestamp conversion.
                                    dim.isAdditionalDimension
                                        ? true
                                        : disableTimestampConversion,
                                    undefined,
                                    granularityLabels,
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
                                // Custom granularity SQL may change the base
                                // column's domain, so keep its output unknown.
                            } satisfies Dimension,
                        };
                    }, {});

                    return { ...standardDims, ...customDims };
                }
                return {};
            };

            let extraDimensions = dimension
                ? { ...processIntervalDimension(dimension, undefined) }
                : {};

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
                    tableWarnings,
                    granularityLabels,
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

            // Metrics under an array of scalars aggregate its elements and
            // live on the unnested table. A struct's metrics stay: a count
            // of the struct itself is valid SQL and was how errors were
            // counted before containers stopped being dimensions.
            const columnMetrics = Object.fromEntries(
                Object.entries(columnMeta.metrics || {})
                    .filter(() => !isScalarArray)
                    .map(([name, metric]) => [
                        name,
                        convertColumnMetric({
                            modelName: model.name,
                            dimensionName: dimension?.name,
                            dimensionSql:
                                dimension?.sql ?? defaultSql(column.name),
                            dimensionType:
                                dimension?.type ??
                                column.data_type ??
                                DimensionType.STRING,
                            dimensionTimeInterval: dimension?.timeInterval,
                            name,
                            metric,
                            tableLabel,
                            requiredAttributes: dimension?.requiredAttributes, // TODO Join dimension required_attributes with metric required_attributes
                            anyAttributes: dimension?.anyAttributes, // TODO Join dimension any_attributes with metric any_attributes
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

            return [
                {
                    ...prevDimensions,
                    ...(dimension ? { [column.name]: dimension } : {}),
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

    const allMetrics: Record<string, Metric> = Object.values({
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

    const groupDetails: Record<string, FieldGroupType> = {};
    if (meta.group_details) {
        Object.entries(meta.group_details).forEach(([key, data]) => {
            groupDetails[key] = {
                label: data.label,
                description: data.description,
                ...(data.ai_hint
                    ? { aiHint: convertToAiHints(data.ai_hint) }
                    : {}),
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

    // Expand set refs here so the query-time fallback (used when drilling from
    // a non-metric cell) always receives plain field refs.
    const showUnderlyingValuesContext = `"default_show_underlying_values" in model "${model.name}"`;
    const expandedDefaultShowUnderlyingValues =
        meta.default_show_underlying_values
            ? expandFieldsWithSetsLenient(meta.default_show_underlying_values, {
                  name: model.name,
                  sets: meta.sets,
              })
            : undefined;
    expandedDefaultShowUnderlyingValues?.setExpansionErrors.forEach((problem) =>
        tableWarnings.push(
            showUnderlyingValuesWarning(showUnderlyingValuesContext, problem),
        ),
    );
    const defaultShowUnderlyingValues =
        expandedDefaultShowUnderlyingValues?.fields.filter((ref) => {
            const parts = ref.split('.');
            if (parts.length > 2) {
                tableWarnings.push(
                    showUnderlyingValuesWarning(
                        showUnderlyingValuesContext,
                        `Invalid reference "${ref}".`,
                    ),
                );
                return false;
            }
            const [tableRef, fieldRef] =
                parts.length === 2 ? parts : [model.name, ref];
            if (tableRef !== model.name) {
                // Refs to other models can only resolve at explore compile time.
                return true;
            }
            const isValidReference = !!(
                dimensions[fieldRef] || allMetrics[fieldRef]
            );
            if (!isValidReference) {
                tableWarnings.push(
                    showUnderlyingValuesWarning(
                        showUnderlyingValuesContext,
                        `Unknown field "${ref}" in table "${model.name}".`,
                    ),
                );
            }
            return isValidReference;
        });

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
        ...(defaultShowUnderlyingValues ? { defaultShowUnderlyingValues } : {}),
        ...(meta.ai_hint ? { aiHint: convertToAiHints(meta.ai_hint) } : {}),
        ...(meta.parameters ? { parameters: meta.parameters } : {}),
        ...(meta.sets ? { sets: meta.sets } : {}),
        ...(tableWarnings.length > 0 ? { warnings: tableWarnings } : {}),
        ...(model.package_name ? { dbtPackageName: model.package_name } : {}),
        ...(model.lightdash_source_uuid
            ? { dbtSourceUuid: model.lightdash_source_uuid }
            : {}),
        ...(model.patch_path
            ? { ymlPath: patchPathParts(model.patch_path).path }
            : {}),
        ...(model.path ? { sqlPath: model.path } : {}),
    };
};

const translateDbtModelsToTableLineage = (
    models: DbtModelNode[],
): Record<string, Pick<Table, 'lineageGraph'>> => {
    const graph = buildModelGraph(models);
    const lineageByModelName: Record<string, Pick<Table, 'lineageGraph'>> = {};
    models.forEach((currentValue) => {
        lineageByModelName[currentValue.name] = {
            lineageGraph: generateTableLineage(currentValue, graph),
        };
    });
    return lineageByModelName;
};

export type ExplorePostProcessor = (
    compiledExplores: Explore[],
    context: {
        model: DbtModelNode;
        meta: Record<string, unknown>;
        startOfWeek: WeekDay | null;
    },
) => (Explore | ExploreError)[];

export const getNestedTableName = (modelName: string, columnPath: string) =>
    `${modelName}__${columnPath.split('.').join('__')}`;

const getOffsetColumnSql = (quoteChar: string, tableName: string) =>
    `${quoteChar}${tableName}__offset${quoteChar}`;

// The full FROM item, alias included, because the offset alias has to follow
// the table alias and the join renderer only appends an ON clause.
const getUnnestFromSql = (
    adapterType: SupportedDbtAdapter,
    quoteChar: string,
    parentTable: string,
    columnSegment: string,
    tableName: string,
): string => {
    const q = quoteChar;
    switch (adapterType) {
        case SupportedDbtAdapter.BIGQUERY:
            return `UNNEST(${q}${parentTable}${q}.${columnSegment}) AS ${q}${tableName}${q} WITH OFFSET AS ${q}${tableName}__offset${q}`;
        default:
            throw new NotSupportedError(
                `Repeated column "${columnSegment}" can't be unnested on ${adapterType}. Unnesting repeated columns is only supported on BigQuery.`,
            );
    }
};

type NestedTableTemplate = {
    nodePath: string;
    segment: string;
    parentPath: string;
    /** Leaf columns renamed to the remainder of their path below the node. */
    columns: DbtModelColumn[];
    label: string | undefined;
    description: string | undefined;
};

const isRepeatedScalarColumn = (column: DbtModelColumn): boolean =>
    column.nested_shape?.repeated === true &&
    column.nested_shape.record === false &&
    !getColumnMeta(column).dimension?.sql;

/**
 * An array of scalars has no leaves of its own: the element is the value, so
 * the virtual table exposes it as a single `value` dimension whose SQL is the
 * unnest alias itself. The container's dimension config (type, format...)
 * applies to that element; its label names the table instead.
 */
const getScalarElementColumn = (container: DbtModelColumn): DbtModelColumn => {
    const {
        repeated_ancestors: _ancestors,
        nested_shape: _shape,
        config: _config,
        ...column
    } = container;
    const {
        dimension,
        additional_dimensions: _additionalDimensions,
        ...meta
    } = getColumnMeta(container);
    const { label: _label, ...dimensionConfig } = dimension ?? {};
    return {
        ...column,
        name: 'value',
        description: container.description ?? `Element of ${container.name}`,
        meta: { ...meta, dimension: { ...dimensionConfig, sql: '${TABLE}' } },
    };
};

/**
 * One template per repeated node: every array of records reached by a
 * documented leaf, and every documented array of scalars. Outermost first so
 * a child's join always follows its parent's. Templates carry no table
 * names: the same model can be joined under several aliases, and the UNNEST
 * has to reference the parent by the name it has in that explore.
 */
export const getNestedTableTemplates = (
    model: DbtModelNode,
): NestedTableTemplate[] => {
    const columns = Object.values(model.columns);
    const isRoutedLeaf = (column: DbtModelColumn) =>
        hasRepeatedAncestor(column) && !getColumnMeta(column).dimension?.sql;
    const nodePaths = Array.from(
        new Set([
            ...columns
                .filter(isRoutedLeaf)
                .flatMap((column) => column.repeated_ancestors ?? []),
            ...columns
                .filter(isRepeatedScalarColumn)
                .flatMap((column) => [
                    ...(column.repeated_ancestors ?? []),
                    column.name,
                ]),
        ]),
    ).sort(
        (a, b) =>
            a.split('.').length - b.split('.').length || a.localeCompare(b),
    );
    // A node can sit below a struct inside its repeated parent, so the
    // parent is the deepest repeated prefix, not the previous path segment.
    const getParentPath = (nodePath: string) =>
        nodePaths
            .filter((candidate) => nodePath.startsWith(`${candidate}.`))
            .sort((a, b) => b.length - a.length)[0] ?? '';
    return nodePaths.map((nodePath) => {
        const parentPath = getParentPath(nodePath);
        const container = model.columns[nodePath];
        const leafColumns = columns
            .filter(
                (column) =>
                    isRoutedLeaf(column) &&
                    column.repeated_ancestors?.[
                        column.repeated_ancestors.length - 1
                    ] === nodePath,
            )
            .map(
                ({
                    repeated_ancestors: _ancestors,
                    nested_shape: nestedShape,
                    ...column
                }): DbtModelColumn => ({
                    ...column,
                    name: column.name.slice(nodePath.length + 1),
                    ...(nestedShape ? { nested_shape: nestedShape } : {}),
                }),
            );
        return {
            nodePath,
            segment: parentPath
                ? nodePath.slice(parentPath.length + 1)
                : nodePath,
            parentPath,
            columns:
                container && isRepeatedScalarColumn(container)
                    ? [getScalarElementColumn(container)]
                    : leafColumns,
            label: container
                ? getColumnMeta(container).dimension?.label
                : undefined,
            description: container?.description,
        };
    });
};

type InstantiateNestedTablesArgs = {
    adapterType: SupportedDbtAdapter;
    model: DbtModelNode;
    templates: NestedTableTemplate[];
    /** Name the parent model has in the explore: its own name or its join alias. */
    parentAlias: string;
    parentLabel: string;
    reservedTableNames: Set<string>;
    fieldQuoteChar: string;
    spotlightConfig: LightdashProjectConfig['spotlight'];
    startOfWeek?: WeekDay | null;
    disableTimestampConversion?: boolean;
    customGranularities?: Record<string, CustomGranularity>;
    allowPartialCompilation?: boolean;
    additionalTimeIntervals?: ResolvedAdditionalTimeIntervals;
    granularityLabels?: Partial<Record<TimeFrames, string>>;
};

/**
 * Turns a model's templates into virtual tables for one parent alias. Each is
 * a synthetic model run through convertTable, so leaves keep every column
 * feature; its FROM item is the UNNEST of the parent's column and it is
 * joined ON TRUE as one-to-many. Field ids follow the alias, exactly as an
 * aliased join renames its own fields.
 */
export const instantiateNestedTables = ({
    adapterType,
    model,
    templates,
    parentAlias,
    parentLabel,
    reservedTableNames,
    fieldQuoteChar,
    spotlightConfig,
    startOfWeek,
    disableTimestampConversion,
    customGranularities,
    allowPartialCompilation,
    additionalTimeIntervals,
    granularityLabels,
}: InstantiateNestedTablesArgs): {
    tables: Omit<Table, 'lineageGraph'>[];
    joins: NonNullable<DbtModelNode['meta']['joins']>;
} => {
    const labelsByPath = new Map<string, string>();
    return templates.reduce<{
        tables: Omit<Table, 'lineageGraph'>[];
        joins: NonNullable<DbtModelNode['meta']['joins']>;
    }>(
        (acc, template) => {
            const { nodePath, segment, parentPath } = template;
            const parentTable = parentPath
                ? getNestedTableName(parentAlias, parentPath)
                : parentAlias;
            const tableName = getNestedTableName(parentAlias, nodePath);
            if (reservedTableNames.has(tableName)) {
                throw new ParseError(
                    `Repeated column "${nodePath}" in model "${model.name}" would be unnested as table "${tableName}" under "${parentAlias}", but that name is already used by another table in the explore. Rename one of them.`,
                );
            }
            const label =
                template.label ??
                [
                    labelsByPath.get(parentPath) ?? parentLabel,
                    ...segment.split('.').map(friendlyName),
                ].join(': ');
            labelsByPath.set(nodePath, label);

            const offsetColumn: DbtModelColumn = {
                name: 'offset',
                description: `Position of the element within ${nodePath}, starting at 0`,
                data_type: DimensionType.NUMBER,
                meta: {
                    dimension: {
                        type: DimensionType.NUMBER,
                        sql: getOffsetColumnSql(fieldQuoteChar, tableName),
                    },
                },
            };
            const syntheticModel: DbtModelNode = {
                ...model,
                name: tableName,
                alias: tableName,
                unique_id: `${model.unique_id}.${parentAlias}.${nodePath}`,
                description:
                    template.description ??
                    `Elements of ${nodePath} in ${parentAlias}`,
                relation_name: getUnnestFromSql(
                    adapterType,
                    fieldQuoteChar,
                    parentTable,
                    segment,
                    tableName,
                ),
                columns: Object.fromEntries(
                    [...template.columns, offsetColumn].map((column) => [
                        column.name,
                        column,
                    ]),
                ),
                meta: { label },
                config: { ...model.config, meta: {} },
            };
            const table: Omit<Table, 'lineageGraph'> = {
                ...convertTable(
                    adapterType,
                    syntheticModel,
                    spotlightConfig,
                    startOfWeek,
                    disableTimestampConversion,
                    customGranularities,
                    allowPartialCompilation,
                    additionalTimeIntervals,
                    granularityLabels,
                    true,
                ),
                nestedFrom: { parentTable, columnPath: nodePath },
            };
            return {
                tables: [...acc.tables, table],
                joins: [
                    ...acc.joins,
                    {
                        join: tableName,
                        sql_on: 'TRUE',
                        type: 'left',
                        relationship: JoinRelationship.ONE_TO_MANY,
                        label,
                        description: table.description,
                    },
                ],
            };
        },
        { tables: [], joins: [] },
    );
};

export type ConvertExploresOptions = {
    disableTimestampConversion?: boolean;
    allowPartialCompilation?: boolean;
    postProcessors?: ExplorePostProcessor[];
    unnestRepeatedColumns?: boolean;
};

const RESERVED_MODEL_META_KEY_SET = new Set<string>(RESERVED_MODEL_META_KEYS);

const MODELS_PER_EVENT_LOOP_YIELD = 200;

// setImmediate has no timer clamp but exists only on Node; this package is
// bundled for the browser too.
const yieldToEventLoop = (): Promise<void> =>
    new Promise((resolve) => {
        if (typeof setImmediate === 'function') {
            setImmediate(resolve);
        } else {
            setTimeout(resolve, 0);
        }
    });

export async function* iterateExplores(
    models: DbtModelNode[],
    loadSources: boolean,
    adapterType: SupportedDbtAdapter,
    warehouseSqlBuilder: WarehouseSqlBuilder,
    lightdashProjectConfig: LightdashProjectConfig,
    options?: ConvertExploresOptions,
): AsyncGenerator<Explore | ExploreError> {
    const {
        disableTimestampConversion,
        allowPartialCompilation,
        postProcessors,
        unnestRepeatedColumns = false,
    } = options ?? {};
    const resolvedNamesByUniqueId = qualifyManifestNames(
        models.map((model) => ({
            uniqueId: model.unique_id,
            name: model.name,
            lightdash_source_name: model.lightdash_source_name,
            package_name: model.package_name,
        })),
        'model',
    );
    const modelsByNamespaceAndName = new Map<string, DbtModelNode>();
    models.forEach((model) => {
        const namespaceKey = getManifestNamespaceKey(model, model.name);
        if (namespaceKey !== undefined) {
            modelsByNamespaceAndName.set(namespaceKey, model);
        }
    });
    const resolveJoins = (
        model: DbtModelNode,
        joins: DbtModelNode['meta']['joins'],
    ): DbtModelNode['meta']['joins'] =>
        joins?.map((join) => {
            const namespaceKey = getManifestNamespaceKey(model, join.join);
            if (namespaceKey === undefined) {
                return join;
            }
            const joinedModel = modelsByNamespaceAndName.get(namespaceKey);
            const resolvedJoinName = joinedModel
                ? resolvedNamesByUniqueId.get(joinedModel.unique_id)
                : undefined;
            if (!resolvedJoinName || resolvedJoinName === join.join) {
                return join;
            }
            return {
                ...join,
                join: resolvedJoinName,
                alias: join.alias ?? join.join,
            };
        });
    const resolvedModels = models.map((model) => {
        const resolvedName =
            resolvedNamesByUniqueId.get(model.unique_id) ?? model.name;
        const metaJoins = resolveJoins(model, model.meta.joins);
        const configMetaJoins = resolveJoins(model, model.config?.meta?.joins);
        return {
            ...model,
            name: resolvedName,
            meta:
                metaJoins === model.meta.joins
                    ? model.meta
                    : { ...model.meta, joins: metaJoins },
            config:
                configMetaJoins === model.config?.meta?.joins
                    ? model.config
                    : {
                          ...model.config,
                          meta: {
                              ...model.config?.meta,
                              joins: configMetaJoins,
                          },
                      },
        };
    });
    const originalNamesByUniqueId = new Map(
        models.map((model) => [model.unique_id, model.name]),
    );
    const tableLineage = translateDbtModelsToTableLineage(resolvedModels);
    const nestedTemplatesByModel = new Map<
        string,
        { model: DbtModelNode; templates: NestedTableTemplate[] }
    >();
    const additionalTimeIntervals = resolveAdditionalTimeIntervals(
        lightdashProjectConfig.defaults?.additional_time_intervals,
        lightdashProjectConfig.custom_granularities,
    );
    const granularityLabels = resolveGranularityLabels(
        lightdashProjectConfig.defaults?.granularity_labels,
    );
    const tables: Table[] = [];
    const exploreErrors: ExploreError[] = [];
    // eslint-disable-next-line no-restricted-syntax
    for (const [modelIndex, model] of resolvedModels.entries()) {
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
            const table = convertTable(
                adapterType,
                model,
                lightdashProjectConfig.spotlight,
                warehouseSqlBuilder.getStartOfWeek(),
                disableTimestampConversion,
                lightdashProjectConfig.custom_granularities,
                allowPartialCompilation,
                additionalTimeIntervals,
                granularityLabels,
                unnestRepeatedColumns,
            );

            // add lineage
            const tableWithLineage: Table = {
                ...table,
                ...(originalNamesByUniqueId.get(model.unique_id) !== model.name
                    ? {
                          originalName: originalNamesByUniqueId.get(
                              model.unique_id,
                          ),
                      }
                    : {}),
                ...tableLineage[model.name],
            };

            tables.push(tableWithLineage);
            if (unnestRepeatedColumns) {
                const templates = getNestedTableTemplates(model);
                if (templates.length > 0) {
                    nestedTemplatesByModel.set(model.name, {
                        model,
                        templates,
                    });
                }
            }
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
            exploreErrors.push(exploreError);
        }

        if ((modelIndex + 1) % MODELS_PER_EVENT_LOOP_YIELD === 0) {
            // eslint-disable-next-line no-await-in-loop
            await yieldToEventLoop();
        }
    }
    const tableLookup: Record<string, Table> = {};
    tables.forEach((table) => {
        tableLookup[table.name] = table;
    });
    // Virtual tables are instantiated per explore, once for the base model
    // and once per join, named after the join alias; their joins go right
    // after the parent's so a child never precedes its parent.
    const attachNestedTables = (
        baseModelName: string,
        joins: NonNullable<DbtModelNode['meta']['joins']>,
        exploreTables: Record<string, Table>,
    ): {
        joins: NonNullable<DbtModelNode['meta']['joins']>;
        tables: Record<string, Table>;
    } => {
        // Copying the table map per explore is quadratic in project size, so
        // explores without repeated columns are passed through untouched.
        if (
            !nestedTemplatesByModel.has(baseModelName) &&
            !joins.some((join) => nestedTemplatesByModel.has(join.join))
        ) {
            return { joins, tables: exploreTables };
        }
        const reservedTableNames = new Set([
            ...Object.keys(exploreTables),
            ...joins.map((join) => join.alias ?? join.join),
        ]);
        const nestedTables: Record<string, Table> = {};
        const instantiate = (
            modelName: string,
            parentAlias: string,
            parentLabel: string | undefined,
        ): NonNullable<DbtModelNode['meta']['joins']> => {
            const entry = nestedTemplatesByModel.get(modelName);
            if (!entry) return [];
            const nested = instantiateNestedTables({
                adapterType,
                model: entry.model,
                templates: entry.templates,
                parentAlias,
                parentLabel:
                    parentLabel ??
                    exploreTables[modelName]?.label ??
                    friendlyName(parentAlias),
                reservedTableNames,
                fieldQuoteChar: warehouseSqlBuilder.getFieldQuoteChar(),
                spotlightConfig: lightdashProjectConfig.spotlight,
                startOfWeek: warehouseSqlBuilder.getStartOfWeek(),
                disableTimestampConversion,
                customGranularities:
                    lightdashProjectConfig.custom_granularities,
                allowPartialCompilation,
                additionalTimeIntervals,
                granularityLabels,
            });
            nested.tables.forEach((table) => {
                reservedTableNames.add(table.name);
                nestedTables[table.name] = { ...table, lineageGraph: {} };
            });
            return nested.joins;
        };
        const nestedJoins = [
            ...instantiate(baseModelName, baseModelName, undefined),
            ...joins.flatMap((join) => [
                join,
                ...instantiate(join.join, join.alias ?? join.join, join.label),
            ]),
        ];
        return {
            joins: nestedJoins,
            tables: { ...exploreTables, ...nestedTables },
        };
    };
    const validModels = resolvedModels.filter(
        (model) =>
            tableLookup[model.name] !== undefined &&
            // Seeds are compiled as tables (for join resolution) but should
            // not generate standalone explores — they're join targets only.
            model.resource_type !== 'seed',
    );

    const exploreCompiler = new ExploreCompiler(warehouseSqlBuilder, {
        allowPartialCompilation,
    });
    // eslint-disable-next-line no-restricted-syntax
    for (const [modelIndex, model] of validModels.entries()) {
        // Config block takes priority, then meta block
        const meta = merge({}, model.meta, model.config?.meta);
        const customMeta = Object.fromEntries(
            Object.entries(meta).filter(
                (entry): entry is [string, CustomMetaValue] =>
                    !RESERVED_MODEL_META_KEY_SET.has(entry[0]) &&
                    (typeof entry[1] === 'string' ||
                        typeof entry[1] === 'number' ||
                        typeof entry[1] === 'boolean'),
            ),
        );

        const configTags =
            typeof model.config?.tags === 'string'
                ? [model.config.tags]
                : model.config?.tags;
        const tags =
            configTags && configTags.length > 0 ? configTags : model.tags;

        // Create an array of explores to generate: base explore + any additional explores.
        // `meta.hidden` skips the base explore - the model is still compiled as a
        // table, so it stays available as a join target and as the base table for
        // the explores defined under `meta.explores`.
        const exploresToCreate = [
            ...(meta.hidden
                ? []
                : [
                      {
                          name: model.name,
                          label: meta.label || friendlyName(model.name),
                          tags: tags || [],
                          groupLabel: meta.group_label,
                          ...(meta.groups && meta.groups.length > 0
                              ? { groups: meta.groups }
                              : {}),
                          joins: meta?.joins || [],
                          description: meta.description,
                          caseSensitive: meta.case_sensitive,
                          tables: tableLookup,
                      },
                  ]),
            ...(meta.explores
                ? Object.entries(meta.explores).map(
                      ([exploreName, exploreConfig]) => {
                          const baseTable = tableLookup[model.name];
                          const baseTableLabel =
                              meta.label || friendlyName(model.name);

                          // Convert explore-scoped additional dimensions
                          const exploreScopedDimensions: Record<
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
                                  Object.assign(
                                      exploreScopedDimensions,
                                      convertedDims,
                                  );
                              });
                          }

                          const exploreTags =
                              typeof exploreConfig.tags === 'string'
                                  ? [exploreConfig.tags]
                                  : exploreConfig.tags;

                          return {
                              name: exploreName,
                              label:
                                  exploreConfig.label ||
                                  friendlyName(exploreName),
                              tags: exploreTags ?? tags ?? [],
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
                const { joins: exploreJoins, tables: exploreTables } =
                    attachNestedTables(
                        model.name,
                        exploreToCreate.joins,
                        exploreToCreate.tables,
                    );
                const compiled = exploreCompiler.compileExplore({
                    name: exploreToCreate.name,
                    label: exploreToCreate.label,
                    tags: exploreToCreate.tags,
                    baseTable: model.name,
                    groupLabel: exploreToCreate.groupLabel,
                    ...(exploreToCreate.groups &&
                    exploreToCreate.groups.length > 0
                        ? { groups: exploreToCreate.groups }
                        : {}),
                    caseSensitive: exploreToCreate.caseSensitive,
                    joinedTables: exploreJoins.map((join) => ({
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
                    tables: exploreTables,
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
                    ...(Object.keys(customMeta).length > 0
                        ? { customMeta }
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
                return {
                    ...compiled,
                    ...(Object.keys(granularityLabels).length > 0
                        ? { granularityLabels }
                        : {}),
                };
            } catch (e: unknown) {
                return {
                    name: exploreToCreate.name,
                    label: exploreToCreate.label,
                    tags: exploreToCreate.tags,
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
            startOfWeek: warehouseSqlBuilder.getStartOfWeek() ?? null,
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

        yield* compileErrors;
        yield* postProcessedExplores;

        if ((modelIndex + 1) % MODELS_PER_EVENT_LOOP_YIELD === 0) {
            // eslint-disable-next-line no-await-in-loop
            await yieldToEventLoop();
        }
    }

    yield* exploreErrors;
}

export const convertExplores = async (
    models: DbtModelNode[],
    loadSources: boolean,
    adapterType: SupportedDbtAdapter,
    warehouseSqlBuilder: WarehouseSqlBuilder,
    lightdashProjectConfig: LightdashProjectConfig,
    options?: ConvertExploresOptions,
): Promise<(Explore | ExploreError)[]> => {
    const explores: (Explore | ExploreError)[] = [];
    for await (const explore of iterateExplores(
        models,
        loadSources,
        adapterType,
        warehouseSqlBuilder,
        lightdashProjectConfig,
        options,
    )) {
        explores.push(explore);
    }
    return explores;
};

export type AttachTypesDiagnostics = {
    durationMs: number;
    modelCount: number;
    columnCount: number;
    catalogTableCount: number;
    schemaPairs: { databaseSchema: string; models: number }[];
    exactLookups: number;
    caseInsensitiveLookups: number;
    missingLookups: number;
};

export const attachTypesToModels = (
    models: DbtModelNode[],
    warehouseCatalog: WarehouseCatalog,
    throwOnMissingCatalogEntry: boolean = true,
    caseSensitiveMatching: boolean = true,
    onDiagnostics?: (diagnostics: AttachTypesDiagnostics) => void,
): DbtModelNode[] => {
    const startedAt = Date.now();
    let exactLookups = 0;
    let caseInsensitiveLookups = 0;
    let missingLookups = 0;
    let columnCount = 0;

    // Indexed once instead of rescanning Object.keys() at three catalog levels for every
    // column of every model, which made the cost models x columns x tables-in-schema.
    const exactIndex = new Map<string, WarehouseTableSchema>();
    const foldedIndex = new Map<string, WarehouseTableSchema>();
    const exactLocation = new Map<
        string,
        { database: string; schema: string; table: string }
    >();
    const foldedLocation = new Map<
        string,
        { database: string; schema: string; table: string }
    >();
    const key = (database: string, schema: string, table: string) =>
        `${database}\u0000${schema}\u0000${table}`;
    const foldedKey = (database: string, schema: string, table: string) =>
        key(database.toLowerCase(), schema.toLowerCase(), table.toLowerCase());

    let catalogTableCount = 0;
    Object.keys(warehouseCatalog).forEach((database) => {
        // The reserved timestamp-domain sidecar sits beside the database keys and is not one.
        if (database === WAREHOUSE_TIMESTAMP_DOMAINS_KEY) return;
        const schemas = warehouseCatalog[database];
        if (schemas === undefined || schemas === null) return;
        Object.keys(schemas).forEach((schema) => {
            const tables = schemas[schema];
            if (tables === undefined || tables === null) return;
            Object.keys(tables).forEach((table) => {
                const columns = tables[table];
                if (columns === undefined || columns === null) return;
                catalogTableCount += 1;
                const location = { database, schema, table };
                const exact = key(database, schema, table);
                // Object.keys() yields insertion order and the replaced code took the FIRST
                // match, so only absent keys are set — that preserves which duplicate wins.
                if (!exactIndex.has(exact)) {
                    exactIndex.set(exact, columns);
                    exactLocation.set(exact, location);
                }
                const folded = foldedKey(database, schema, table);
                if (!foldedIndex.has(folded)) {
                    foldedIndex.set(folded, columns);
                    foldedLocation.set(folded, location);
                }
            });
        });
    });

    const lookup = (
        database: string,
        schema: string,
        table: string,
    ):
        | {
              columns: WarehouseTableSchema;
              location: { database: string; schema: string; table: string };
              caseInsensitive: boolean;
          }
        | undefined => {
        const exact = key(database, schema, table);
        const exactHit = exactIndex.get(exact);
        if (exactHit !== undefined) {
            return {
                columns: exactHit,
                location: exactLocation.get(exact)!,
                caseInsensitive: false,
            };
        }
        if (caseSensitiveMatching) return undefined;
        const folded = foldedKey(database, schema, table);
        const foldedHit = foldedIndex.get(folded);
        if (foldedHit !== undefined) {
            return {
                columns: foldedHit,
                location: foldedLocation.get(folded)!,
                caseInsensitive: true,
            };
        }
        return undefined;
    };

    // Check that all models appear in the warehouse
    models.forEach(({ database, schema, name }) => {
        if (lookup(database, schema, name) === undefined) {
            if (throwOnMissingCatalogEntry) {
                throw new MissingCatalogEntryError(
                    `Model "${name}" was expected in your target warehouse at "${database}.${schema}.${name}". Does the table exist in your target data warehouse?`,
                    {},
                );
            }
        }
    });

    const getColumnType = (
        { database, schema, name, alias }: DbtModelNode,
        columnName: string,
    ):
        | {
              type: DimensionType;
              timestampDomain: TimestampDomain | undefined;
              nestedShape: WarehouseNestedColumnShape | undefined;
              repeatedAncestors: string[];
          }
        | undefined => {
        const tableName = alias || name;
        const hit = lookup(database, schema, tableName);
        if (hit !== undefined) {
            const columnMatch = Object.keys(hit.columns).find((column) =>
                caseSensitiveMatching
                    ? column === columnName
                    : column.toLowerCase() === columnName.toLowerCase(),
            );
            if (columnMatch !== undefined) {
                // A lookup is only exact when BOTH the table and the column matched exactly.
                if (hit.caseInsensitive || columnMatch !== columnName) {
                    caseInsensitiveLookups += 1;
                } else {
                    exactLookups += 1;
                }
                const getShape = (columnPath: string) =>
                    getCatalogNestedColumnShape(
                        warehouseCatalog,
                        hit.location.database,
                        hit.location.schema,
                        hit.location.table,
                        columnPath,
                    );
                const segments = columnMatch.split('.');
                const repeatedAncestors = segments
                    .slice(0, -1)
                    .map((_, index) => segments.slice(0, index + 1).join('.'))
                    .filter((prefix) => getShape(prefix)?.repeated === true);
                return {
                    type: hit.columns[columnMatch],
                    timestampDomain: getCatalogTimestampDomain(
                        warehouseCatalog,
                        hit.location.database,
                        hit.location.schema,
                        hit.location.table,
                        columnMatch,
                    ),
                    nestedShape: getShape(columnMatch),
                    repeatedAncestors,
                };
            }
        }
        missingLookups += 1;
        if (throwOnMissingCatalogEntry) {
            throw new MissingCatalogEntryError(
                `Column "${columnName}" from model "${tableName}" does not exist.\n "${tableName}.${columnName}" was not found in your target warehouse at ${database}.${schema}.${tableName}. Try rerunning dbt to update your warehouse.`,
                {},
            );
        }
        return undefined;
    };

    // Update the dbt models with type info
    const typedModels = models.map((model) => ({
        ...model,
        columns: Object.fromEntries(
            Object.entries(model.columns).map(([column_name, column]) => {
                columnCount += 1;
                const columnType = getColumnType(model, column_name);
                return [
                    column_name,
                    {
                        ...column,
                        data_type: columnType?.type,
                        // Sibling of data_type: that field is overwritten
                        // wholesale, so the domain must ride separately.
                        ...(columnType?.timestampDomain
                            ? { timestamp_domain: columnType.timestampDomain }
                            : {}),
                        ...(columnType?.nestedShape
                            ? { nested_shape: columnType.nestedShape }
                            : {}),
                        ...(columnType &&
                        columnType.repeatedAncestors.length > 0
                            ? {
                                  repeated_ancestors:
                                      columnType.repeatedAncestors,
                              }
                            : {}),
                    },
                ];
            }),
        ),
    }));

    if (onDiagnostics) {
        const modelsByPair = new Map<string, number>();
        models.forEach(({ database, schema }) => {
            const pair = `${database}.${schema}`;
            modelsByPair.set(pair, (modelsByPair.get(pair) ?? 0) + 1);
        });
        onDiagnostics({
            durationMs: Date.now() - startedAt,
            modelCount: models.length,
            columnCount,
            catalogTableCount,
            schemaPairs: [...modelsByPair.entries()]
                .map(([databaseSchema, count]) => ({
                    databaseSchema,
                    models: count,
                }))
                .sort((a, b) => b.models - a.models),
            exactLookups,
            caseInsensitiveLookups,
            missingLookups,
        });
    }

    return typedModels;
};

export const getSchemaStructureFromDbtModels = (
    dbtModels: DbtModelNode[],
): { database: string; schema: string; table: string }[] =>
    dbtModels.map(({ database, schema, name, alias }) => ({
        database,
        schema,
        table: alias || name,
    }));
