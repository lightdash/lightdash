import assertUnreachable from '../utils/assertUnreachable';
import { getTotalFilterRules } from '../utils/filters';
import { getItemId } from '../utils/item';
import { SupportedDbtAdapter } from './dbt';
import {
    DimensionType,
    type CustomDimension,
    type FieldId,
    type ItemsMap,
    type TableCalculation,
    type TimestampDomain,
} from './field';
import { type Filters } from './filter';
import {
    type AdditionalMetric,
    type DimensionOverrides,
    type MetricOverrides,
    type MetricQuery,
    type SortField,
} from './metricQuery';
import { type ParametersValuesMap } from './parameters';
import { type PivotConfiguration } from './pivot';
import { type TimeFrames } from './timeFrames';

/**
 * How unmatched keys survive the merge. Mirrors the SQL join it compiles to.
 */
export enum MergeJoinType {
    /** Keep every key from every source. */
    FULL = 'full',
    /** Keep every key from the first source only. */
    LEFT = 'left',
    /** Keep only keys present in all sources. */
    INNER = 'inner',
}

/**
 * One side of a merge: a metric query compiled and run as part of the merge.
 * A plain object, not an intersection: TSOA emits an intersection as `allOf`,
 * which reads as a changed response contract to the API compatibility check.
 */
export type MergeQueryMetricSource = {
    /** Stable id. Names the CTE, and the table its merged fields belong to. */
    id: string;
    metricQuery: MetricQuery;
    /**
     * Opt in to an intentional one-to-many join: this source's value columns
     * repeat on every row the other sources produce for the same key, so the
     * others may carry dimensions that are not join keys. Off by default,
     * because a repeated metric is counted more than once by any sum over
     * the merged rows.
     */
    repeatValues?: boolean;
};

/**
 * One side of a merge: an existing query result, referenced by queryUuid and
 * joined as the rows it already holds — nothing re-runs. Its structure and
 * types resolve at compile time from the stored query metadata. Results are
 * creator-scoped and expire; an expired reference is re-submitted as a
 * query, not refreshed by handle.
 */
export type MergeQueryResultSource = {
    /** Stable id. Names the CTE, and the table its merged fields belong to. */
    id: string;
    queryUuid: string;
    /** See MergeQueryMetricSource.repeatValues. */
    repeatValues?: boolean;
};

export type MergeQuerySource = MergeQueryMetricSource | MergeQueryResultSource;

/**
 * A merge whose sources are all metric queries — what AI-built artifacts
 * hold and their endpoints return. Response contracts use this so
 * `metricQuery` stays required on every returned source, while the
 * run/compile requests accept the wider MergeQuerySource union
 * (expand-only: requests widen, responses do not).
 */
export type MetricSourcedMergeQuery = {
    // Spelled out rather than derived with Omit: TSOA drops required
    // markers on mapped types, which reads as a breaking response change.
    sources: MergeQueryMetricSource[];
    joinKey: MergeJoinKeyPart[];
    joinType: MergeJoinType;
    tableCalculations: MergeTableCalculation[];
    // Optional for compatibility with merges stored before sorting existed
    sorts?: SortField[];
    limit: number;
};

export const isMergeResultSource = (
    source: MergeQuerySource,
): source is MergeQueryResultSource => 'queryUuid' in source;

export const isMergeMetricSource = (
    source: MergeQuerySource,
): source is MergeQueryMetricSource => 'metricQuery' in source;

export const isMetricSourcedMergeQuery = (
    mergeQuery: MergeQuery,
): mergeQuery is MetricSourcedMergeQuery =>
    mergeQuery.sources.every(isMergeMetricSource);

/**
 * One column of the join key. Sources name the same real-world key differently
 * (`orders.order_date` vs `users.created_date`), so the mapping is explicit per
 * source rather than positional.
 */
export type MergeJoinKeyPart = {
    /** Column name this key part takes in the merged result. */
    name: string;
    /** The field each source joins on. Every source must have an entry. */
    fieldIdBySourceId: Record<string, FieldId>;
};

/**
 * A calculation over the *merged* result, where a row-wise calculation across
 * source queries can correctly live. Formula references use merged field ids;
 * legacy SQL references use `${sourceId.fieldId}`.
 */
export type MergeTableCalculation = {
    name: string;
    displayName: string;
    /**
     * Legacy SQL expression. Kept required for API/storage compatibility;
     * formula calculations store an empty string here and compile `formula`
     * on the compose engine instead.
     */
    sql: string;
    /** Spreadsheet-like formula over merged field ids. */
    formula?: string;
};

/** Bounds parser work for formulas accepted from URLs and API requests. */
export const MAX_MERGE_TABLE_CALCULATION_FORMULA_LENGTH = 10_000;

/** `${sourceId.fieldId}` inside a merge table calculation. */
export const mergeCalculationReferencePattern = /\$\{([a-zA-Z0-9_.-]+)\}/g;

export type MergeQuery = {
    sources: MergeQuerySource[];
    joinKey: MergeJoinKeyPart[];
    joinType: MergeJoinType;
    /** Calculations over the merged result. Applied last, after any pivot. */
    tableCalculations: MergeTableCalculation[];
    /**
     * Sort of the merged result, by merged field id. Legs always run
     * unsorted. Optional for compatibility with merges from before it
     * existed; absent means join-key order.
     */
    sorts?: SortField[];
    limit: number;
};

/**
 * Where each column of the merged result came from, so callers map results
 * back to fields instead of re-deriving the naming rule.
 */
export type MergeQueryColumns = {
    /** Join key columns, in join key order. Shared by every source. */
    joinKeyColumns: string[];
    /** Merged column name for each source column, keyed by source id. */
    valueColumnBySourceColumn: Record<string, Record<string, string>>;
};

/**
 * What a join field actually is. Supplied by the caller from the compiled
 * explores, because field ids alone cannot say whether two sides of a join are
 * comparable.
 */
export type MergeFieldMeta = {
    type: DimensionType;
    /** Time grain for date/timestamp dimensions, null otherwise. */
    timeInterval: TimeFrames | null;
    /** Whether a timestamp field is zone-aware or wall-clock; absent means unknown. */
    timestampDomain?: TimestampDomain;
};

/** Field metadata by source and field id for every field named in a join key. */
export type MergeFieldTypes = Record<
    MergeQuerySource['id'],
    Record<FieldId, MergeFieldMeta>
>;

/**
 * Types that can be compared across a join without the warehouse guessing.
 * DATE and TIMESTAMP share a class because every supported warehouse compares
 * them, but their *grain* still has to match — see the granularity check.
 */
const getTypeClass = (type: DimensionType): string => {
    switch (type) {
        case DimensionType.DATE:
        case DimensionType.TIMESTAMP:
            return 'temporal';
        case DimensionType.NUMBER:
            return 'number';
        case DimensionType.STRING:
            return 'string';
        case DimensionType.BOOLEAN:
            return 'boolean';
        default:
            return 'unknown';
    }
};

/**
 * One column of the merged result, described well enough to be selected,
 * sorted, formatted and charted like any other field.
 *
 * Merged columns are renamed to keep two sources from colliding, so the
 * mapping back to the field a column came from cannot be recovered from its
 * name — it has to be carried.
 */
export type MergeQueryField = {
    /** Column name in the merged result. */
    column: string;
    /** Label to show, derived from the source field. */
    label: string;
    /** Whether it behaves as a dimension or a metric downstream. */
    kind: 'dimension' | 'metric';
    /** Underlying value type, for formatting and sort behaviour. */
    type: string;
    /** The query it came from; null for join key columns, which are shared. */
    sourceId: string | null;
    /** The field it came from; null for join key columns. */
    sourceFieldId: string | null;
};

export enum MergeQueryErrorKind {
    TOO_FEW_SOURCES = 'too_few_sources',
    /**
     * More than two sources. The spec stays N-shaped, but N-way FULL OUTER
     * JOIN chains are where dialect risk compounds, so the engine refuses
     * anything the UI cannot produce rather than compiling it untested.
     */
    TOO_MANY_SOURCES = 'too_many_sources',
    DUPLICATE_SOURCE_ID = 'duplicate_source_id',
    /**
     * A source named after the merged result's own pseudo-table. Value
     * columns are `<sourceId>_<fieldId>` and join keys `merge_<keyName>`,
     * so a source id of "merge" makes the two namespaces collide silently.
     */
    RESERVED_SOURCE_ID = 'reserved_source_id',
    EMPTY_JOIN_KEY = 'empty_join_key',
    JOIN_KEY_COVERAGE = 'join_key_coverage',
    UNKNOWN_SOURCE_IN_JOIN_KEY = 'unknown_source_in_join_key',
    /**
     * A source still carries a dimension that is not part of the join key.
     * Joining it would repeat the other sources' rows once per value — the
     * merged table looks reasonable and every aggregate over it is wrong.
     */
    FAN_OUT = 'fan_out',
    /**
     * A join key names a field its query does not group by. The merged
     * statement would reference a column that side never produced.
     */
    JOIN_KEY_NOT_SELECTED = 'join_key_not_selected',
    /**
     * Two sides of a join key hold different kinds of value. The warehouse
     * either refuses the comparison or silently coerces it, and a coerced
     * comparison that never matches looks exactly like "no data".
     */
    JOIN_KEY_TYPE_MISMATCH = 'join_key_type_mismatch',
    /**
     * Two sides of a date join key are truncated to different grains. Joining
     * a month to a day matches only the first of each month, which reads as an
     * almost-empty result rather than as a mistake.
     */
    JOIN_KEY_GRANULARITY_MISMATCH = 'join_key_granularity_mismatch',
    /**
     * A table calculation whose value depends on the query's whole row set
     * (running totals, ranks, percent-of-total, pivot functions). Merging
     * changes that row set, so the number would be carried over frozen or
     * arrive as null.
     */
    UNSUPPORTED_TABLE_CALCULATION = 'unsupported_table_calculation',
    /** Two merge calculations share a name, so one would overwrite the other. */
    DUPLICATE_CALCULATION_NAME = 'duplicate_calculation_name',
    /** A merge calculation references something the merged result has no column for. */
    UNRESOLVED_CALCULATION_REFERENCE = 'unresolved_calculation_reference',
    /** A merge calculation formula is too large to parse safely. */
    CALCULATION_FORMULA_TOO_LONG = 'calculation_formula_too_long',
    /**
     * A merged column's value type cannot be resolved from the field it came
     * from. Guessing "string" here poisons everything built on the merged
     * result — filters, formatting, further aggregation — so it is refused.
     */
    UNRESOLVED_COLUMN_TYPE = 'unresolved_column_type',
    /**
     * A source references parameters that have no value, supplied or default.
     * Embedded anyway, the placeholder would reach the warehouse as literal
     * text — the same refusal the query makes when it runs on its own.
     */
    MISSING_PARAMETERS = 'missing_parameters',
    /**
     * A referenced query result cannot back a merge source: not found, not
     * the caller's, not ready, or expired. The remedy is re-running the
     * referenced query, not retrying the merge.
     */
    RESULT_SOURCE_UNAVAILABLE = 'result_source_unavailable',
}

export type MergeQueryError = {
    kind: MergeQueryErrorKind;
    /** The source at fault, or null for errors about the merge as a whole. */
    sourceId: string | null;
    fieldIds: FieldId[];
    message: string;
};

export const formatMergeQueryRefusal = (errors: MergeQueryError[]): string =>
    `This merge cannot be run: ${errors.map((error) => error.message).join(' ')}`;

const getJoinKeyFieldIdsForSource = (
    joinKey: MergeJoinKeyPart[],
    sourceId: string,
): FieldId[] =>
    joinKey.flatMap((part) => {
        const fieldId = part.fieldIdBySourceId[sourceId];
        return fieldId === undefined ? [] : [fieldId];
    });

/**
 * Dimensions a source carries that are not part of the join key. A non-empty
 * result is the fan-out trap, and is what the explorer renders as an
 * incomplete merge row.
 */
export const getUnaccountedDimensions = (
    source: MergeQuerySource,
    joinKey: MergeJoinKeyPart[],
): FieldId[] => {
    // A result source's structure lives in stored query metadata; the
    // compiler resolves it and re-runs this check on the resolved form.
    if (isMergeResultSource(source)) return [];
    const accounted = new Set([
        ...getJoinKeyFieldIdsForSource(joinKey, source.id),
    ]);
    return source.metricQuery.dimensions.filter(
        (dimension) => !accounted.has(dimension),
    );
};

/**
 * Whether a source may carry dimensions that are not join keys: only when
 * every other source has opted to repeat its values across them. The fan-out
 * that would otherwise be refused is then the lookup the user asked for.
 */
export const isFanOutAccepted = (
    sources: Pick<MergeQuerySource, 'id' | 'repeatValues'>[],
    sourceId: string,
): boolean =>
    sources.length > 1 &&
    sources.some(
        (source) => source.id === sourceId && source.repeatValues !== true,
    ) &&
    sources.every(
        (source) => source.id === sourceId || source.repeatValues === true,
    );

/**
 * Every reason this merge would produce a wrong or unbuildable result. Empty
 * means the merge is safe to compile.
 */
/**
 * Table merged columns that belong to no single source are attributed to:
 * join keys, which are shared by every source, and calculations over the
 * merged result.
 */
export const MERGE_TABLE_NAME = 'merge';

/**
 * The sorts a merge can honour: those naming a field the merged result
 * carries. A sort left behind by a field no longer selected is dropped, as
 * the Explorer drops it for a single query, rather than refusing the merge.
 */
export const resolveMergeSorts = (
    sorts: SortField[] | undefined,
    mergedFieldIds: string[],
): SortField[] => {
    const known = new Set(mergedFieldIds);
    return (sorts ?? []).filter((sort) => known.has(sort.fieldId));
};

/**
 * Where a warehouse puts nulls when a sort does not say. A merge joins on
 * the compose engine, so a sorted merge under a limit would keep different
 * rows from the same query run on the warehouse unless the placement is
 * stated. Postgres, Redshift, Snowflake, Trino and Athena treat null as the
 * largest value; BigQuery, Databricks and Spark as the smallest; DuckDB and
 * ClickHouse put nulls last whichever way the sort runs.
 */
export const getWarehouseDefaultNullsFirst = (
    adapter: SupportedDbtAdapter,
    descending: boolean,
): boolean => {
    switch (adapter) {
        case SupportedDbtAdapter.POSTGRES:
        case SupportedDbtAdapter.REDSHIFT:
        case SupportedDbtAdapter.SNOWFLAKE:
        case SupportedDbtAdapter.TRINO:
        case SupportedDbtAdapter.ATHENA:
            return descending;
        case SupportedDbtAdapter.BIGQUERY:
        case SupportedDbtAdapter.DATABRICKS:
        case SupportedDbtAdapter.SPARK:
            return !descending;
        case SupportedDbtAdapter.DUCKDB:
        case SupportedDbtAdapter.CLICKHOUSE:
            return false;
        default:
            return assertUnreachable(adapter, `Unknown warehouse ${adapter}`);
    }
};

/** Every sort states its null placement: its own, else the warehouse's. */
export const placeMergeSortNulls = (
    sorts: SortField[],
    adapter: SupportedDbtAdapter,
): SortField[] =>
    sorts.map((sort) => ({
        ...sort,
        nullsFirst:
            sort.nullsFirst ??
            getWarehouseDefaultNullsFirst(adapter, sort.descending),
    }));

/**
 * Sorts as the Explorer holds them, in merged-field space. The Explorer's
 * sort state belongs to the primary source's metric query, so a sort set
 * before merging names a primary field: it maps to that field's merged
 * column, or to the join key column when the field is a key. A sort set on
 * the merged table already names a merged field and passes through.
 */
export const toMergedSorts = ({
    sorts,
    primarySourceId,
    primaryMetricQuery,
    joinKey,
}: {
    sorts: SortField[];
    primarySourceId: string;
    primaryMetricQuery: Pick<
        MetricQuery,
        'dimensions' | 'metrics' | 'tableCalculations'
    >;
    joinKey: MergeJoinKeyPart[];
}): SortField[] => {
    const primaryFieldIds = new Set([
        ...primaryMetricQuery.dimensions,
        ...primaryMetricQuery.metrics,
        ...primaryMetricQuery.tableCalculations.map(({ name }) => name),
    ]);
    return sorts.map((sort) => {
        const keyPart = joinKey.find(
            (part) => part.fieldIdBySourceId[primarySourceId] === sort.fieldId,
        );
        if (keyPart) {
            return {
                ...sort,
                fieldId: getItemId({
                    table: MERGE_TABLE_NAME,
                    name: keyPart.name,
                }),
            };
        }
        if (primaryFieldIds.has(sort.fieldId)) {
            return {
                ...sort,
                fieldId: getItemId({
                    table: primarySourceId,
                    name: sort.fieldId,
                }),
            };
        }
        return sort;
    });
};

export const validateMergeQuery = (
    mergeQuery: MergeQuery,
    /**
     * Types of every field named in the join key. Omitting it skips the type
     * and granularity checks — structural validation still runs, but a
     * mismatched join will only show up as a puzzling empty result.
     */
    fieldTypes?: MergeFieldTypes,
): MergeQueryError[] => {
    const { sources, joinKey } = mergeQuery;
    const errors: MergeQueryError[] = [];

    if (sources.length < 2) {
        errors.push({
            kind: MergeQueryErrorKind.TOO_FEW_SOURCES,
            sourceId: null,
            fieldIds: [],
            message: 'A merge needs at least two queries.',
        });
    }

    if (sources.length > 2) {
        errors.push({
            kind: MergeQueryErrorKind.TOO_MANY_SOURCES,
            sourceId: null,
            fieldIds: [],
            message:
                'A merge joins exactly two queries. Remove the extra queries, or merge them in pairs.',
        });
    }

    const sourceIds = sources.map((source) => source.id);
    const duplicateIds = sourceIds.filter(
        (id, index) => sourceIds.indexOf(id) !== index,
    );
    duplicateIds.forEach((id) => {
        errors.push({
            kind: MergeQueryErrorKind.DUPLICATE_SOURCE_ID,
            sourceId: id,
            fieldIds: [],
            message: `More than one query uses the id "${id}".`,
        });
    });

    sources.forEach((source) => {
        if (source.id === MERGE_TABLE_NAME) {
            errors.push({
                kind: MergeQueryErrorKind.RESERVED_SOURCE_ID,
                sourceId: source.id,
                fieldIds: [],
                message: `"${MERGE_TABLE_NAME}" is reserved for the merged result's own columns. Use a different query id.`,
            });
        }
    });

    if (joinKey.length === 0) {
        errors.push({
            kind: MergeQueryErrorKind.EMPTY_JOIN_KEY,
            sourceId: null,
            fieldIds: [],
            message: 'A merge needs at least one field to join on.',
        });
    }

    const knownSourceIds = new Set(sourceIds);
    joinKey.forEach((part) => {
        sources.forEach((source) => {
            const fieldId = part.fieldIdBySourceId[source.id];
            if (fieldId === undefined) {
                errors.push({
                    kind: MergeQueryErrorKind.JOIN_KEY_COVERAGE,
                    sourceId: source.id,
                    fieldIds: [],
                    message: `Query "${source.id}" has no field to join on for "${part.name}".`,
                });
                return;
            }
            // The join compiles against the source's own output columns, so a
            // key naming a field the source does not select produces SQL that
            // references a column the warehouse has never heard of. The
            // compiler groups a leg by any key dimension of its explore
            // before validating, so what reaches here is a field the explore
            // does not have. Result sources defer this to the compiler, which
            // has their structure.
            if (
                isMergeMetricSource(source) &&
                !source.metricQuery.dimensions.includes(fieldId)
            ) {
                errors.push({
                    kind: MergeQueryErrorKind.JOIN_KEY_NOT_SELECTED,
                    sourceId: source.id,
                    fieldIds: [fieldId],
                    message: `Query "${source.id}" joins on ${fieldId}, which is not a dimension it can group by. Join on a dimension of that query's explore.`,
                });
            }
        });
        Object.keys(part.fieldIdBySourceId)
            .filter((id) => !knownSourceIds.has(id))
            .forEach((id) => {
                errors.push({
                    kind: MergeQueryErrorKind.UNKNOWN_SOURCE_IN_JOIN_KEY,
                    sourceId: id,
                    fieldIds: [],
                    message: `Join key "${part.name}" references unknown query "${id}".`,
                });
            });

        if (fieldTypes === undefined) {
            return;
        }

        const joined = Object.entries(part.fieldIdBySourceId).flatMap(
            ([sourceId, fieldId]) => {
                const meta = fieldTypes[sourceId]?.[fieldId];
                return meta === undefined ? [] : [{ fieldId, meta }];
            },
        );

        const typeClasses = new Set(
            joined.map(({ meta }) => getTypeClass(meta.type)),
        );
        if (typeClasses.size > 1) {
            errors.push({
                kind: MergeQueryErrorKind.JOIN_KEY_TYPE_MISMATCH,
                sourceId: null,
                fieldIds: joined.map(({ fieldId }) => fieldId),
                message: `Join key "${part.name}" compares ${joined
                    .map(({ fieldId, meta }) => `${fieldId} (${meta.type})`)
                    .join(
                        ' to ',
                    )}. Those hold different kinds of value, so the join would either be refused or silently never match.`,
            });
            return;
        }

        const grains = new Set(
            joined
                .filter(({ meta }) => getTypeClass(meta.type) === 'temporal')
                .map(({ meta }) => meta.timeInterval ?? 'RAW'),
        );
        if (grains.size > 1) {
            errors.push({
                kind: MergeQueryErrorKind.JOIN_KEY_GRANULARITY_MISMATCH,
                sourceId: null,
                fieldIds: joined.map(({ fieldId }) => fieldId),
                message: `Join key "${part.name}" joins ${[...grains]
                    .map((grain) => String(grain).toLowerCase())
                    .join(
                        ' to ',
                    )}. Dates truncated to different grains only match where the finer one lands on the coarser one, which looks like missing data rather than a mistake.`,
            });
        }
    });

    sources.forEach((source) => {
        const unaccounted = getUnaccountedDimensions(source, joinKey);
        if (unaccounted.length > 0 && !isFanOutAccepted(sources, source.id)) {
            errors.push({
                kind: MergeQueryErrorKind.FAN_OUT,
                sourceId: source.id,
                fieldIds: unaccounted,
                message: `Query "${source.id}" carries ${unaccounted.join(
                    ', ',
                )}, which is not joined on. Merging would repeat the other queries' rows once per value. Join on it, or set repeatValues on the other queries to repeat their values on purpose.`,
            });
        }
    });

    const calculationNames = mergeQuery.tableCalculations.map(
        (calculation) => calculation.name,
    );
    calculationNames
        .filter((name, index) => calculationNames.indexOf(name) !== index)
        .forEach((name) => {
            errors.push({
                kind: MergeQueryErrorKind.DUPLICATE_CALCULATION_NAME,
                sourceId: null,
                fieldIds: [name],
                message: `More than one calculation is called "${name}".`,
            });
        });

    mergeQuery.tableCalculations
        .filter(
            ({ formula }) =>
                formula !== undefined &&
                formula.length > MAX_MERGE_TABLE_CALCULATION_FORMULA_LENGTH,
        )
        .forEach((calculation) => {
            errors.push({
                kind: MergeQueryErrorKind.CALCULATION_FORMULA_TOO_LONG,
                sourceId: null,
                fieldIds: [calculation.name],
                message: `Calculation "${calculation.name}" exceeds the ${MAX_MERGE_TABLE_CALCULATION_FORMULA_LENGTH.toLocaleString()} character formula limit.`,
            });
        });

    // Reference resolution is deliberately not checked here: only the
    // compiler knows the real column names. See ProjectService.compileMergeQuery.

    return errors;
};

/**
 * Body of the run endpoint. The pivot configuration is the same one every
 * other query runs with: the merged rows are wrapped by the standard pivot
 * stage, so the pipeline is join within an explore, then merge between
 * explores, then pivot.
 */
export type RunMergeQueryRequest = {
    mergeQuery: MergeQuery;
    pivotConfiguration?: PivotConfiguration;
    /** Export row limit. Null means all rows within the organization's cell cap. */
    csvLimit?: number | null;
    /**
     * Parameter values for every source query, one map for the whole merge —
     * two sides of one question should never disagree on a parameter.
     */
    parameters?: ParametersValuesMap;
};

/** Body of the compile endpoint: the spec plus the parameter values. */
export type CompileMergeQueryRequest = {
    mergeQuery: MergeQuery;
    parameters?: ParametersValuesMap;
};

/**
 * One column of the composable core, typed accurately enough to build a
 * virtual view over it: the stable field-id alias, the value's
 * `DimensionType`, and where it came from. Merged metrics arrive downstream as
 * typed *columns* — re-aggregating them is explicit and user-owned, so the
 * origin is carried for a surface to suggest metrics, never to re-sum.
 */
export type MergeTypedColumn = {
    /** Column name in the core's output — the merged field id. */
    reference: FieldId;
    type: DimensionType;
    origin: MergeFieldOrigin;
};

/**
 * The terminal stage of a merged statement, owned by the run path: sort and
 * limit. Kept as data rather than SQL text so the run path can attach it
 * above whatever it stacked on the core (for example a pivot), and so the
 * composable core stays clean under `SELECT *`.
 */
export type MergeTerminalWrapper = {
    /** ORDER BY terms in output-alias space, already quoted for the dialect. */
    orderBy: string[];
    limit: number | null;
    /**
     * @deprecated Always null: a source reaching its row cap is refused from
     * the leg's own row count, never detected in SQL. Stays on the response
     * until the legacy merge endpoints are retired, because removing a
     * required response property is an API break.
     */
    sourceLimitExceededSql: string | null;
};

/**
 * One side of a merge as it runs: the statement its metric query compiles to,
 * or null for a result source, whose rows already exist.
 */
export type MergeCompiledLeg = {
    sourceId: string;
    sql: string | null;
    /**
     * The query the leg runs: the source's query widened by any join key it
     * did not select. Null for a result source, which runs nothing.
     */
    metricQuery: MetricQuery | null;
};

/**
 * What the compile endpoint returns. `sql` is null exactly when `errors` is
 * non-empty: a merge that would produce wrong numbers is reported, not run.
 *
 * A merge runs as a composition: each metric source runs on its own as a
 * leg, and the join runs on the compose engine over the legs' results, which
 * it reads as `merge_source_N` tables in source order. `legs` and `sql`
 * together are the SQL that runs.
 */
export type ApiCompiledMergeQueryResults = {
    /** The join statement over the `merge_source_N` reference tables. */
    sql: string | null;
    /** What each source runs on its own, in source order. Empty on an error. */
    legs: MergeCompiledLeg[];
    /**
     * The composable core of the join: a self-contained single-statement
     * SELECT with no ORDER BY, no LIMIT and no guard column — valid under
     * `SELECT *`, so it can back a virtual view. `sql` is this core with the
     * terminal wrapper attached.
     */
    coreSql: string | null;
    /** The core's columns, in the order the statement returns them. */
    typedColumns: MergeTypedColumn[] | null;
    /** The terminal stage `sql` attaches over the core. */
    terminalWrapper: MergeTerminalWrapper | null;
    /**
     * The sorts the merged result honours, by merged field id, each with
     * its null placement stated. Empty on an error or an unsorted merge.
     */
    sorts: SortField[];
    columns: MergeQueryColumns | null;
    /** Selectable description of every merged column. Empty when sql is null. */
    fields: MergeQueryField[];
    /**
     * Every merged column as an ordinary field, keyed by field id, so results
     * of a merge are consumed exactly like results of a query.
     */
    itemsMap: ItemsMap;
    /** Provenance of each field in `itemsMap`. */
    fieldOrigins: MergeFieldOrigins;
    /** User parameters referenced by any source query. */
    parameterReferences: string[];
    /** Resolved parameter values embedded in the compiled source queries. */
    usedParametersValues: ParametersValuesMap;
    /**
     * Field id for each column the statement returns. Warehouse aliases are
     * short and positional so they cannot breach an identifier length limit;
     * identity lives in `itemsMap`, and rows are rekeyed through this map
     * before anything downstream sees them.
     */
    fieldIdByColumn: Record<string, FieldId>;
    /**
     * @deprecated Always false: every merge runs on the compose engine.
     * Nothing reads it; it stays on the response until the legacy merge
     * endpoints are retired, because removing a required response property
     * is an API break.
     */
    requiresCompose: boolean;
    errors: MergeQueryError[];
};

/** Label for the pseudo-table a source's merged fields belong to. */
export const getMergeSourceTableLabel = (sourceIndex: number): string =>
    `Query ${String.fromCharCode(65 + sourceIndex)}`;

/**
 * The SQL a compiled merge runs, as one readable text: each leg under a
 * comment naming its source, then the join. Null when the merge did not
 * compile.
 */
export const getMergeCompiledSqlText = (
    compiled: Pick<ApiCompiledMergeQueryResults, 'legs' | 'sql'>,
): string | null => {
    if (compiled.sql === null) return null;
    const legs = compiled.legs.map((leg, index) => {
        const label = `${getMergeSourceTableLabel(index)} ("${leg.sourceId}")`;
        return leg.sql === null
            ? `-- ${label}: existing results, nothing runs`
            : `-- ${label}: runs on the warehouse\n${leg.sql}`;
    });
    return [
        ...legs,
        `-- Merge: runs on the compose engine over the results above, read as merge_source_0, merge_source_1, ...\n${compiled.sql}`,
    ].join('\n\n');
};

/**
 * Where a merged field came from. Carried beside the fields rather than on
 * them, so every `Field` consumer downstream sees an ordinary field and only
 * the code that needs provenance — drilling into a cell, filtering a source —
 * has to know a merge happened.
 */
export type MergeFieldOrigin =
    | {
          kind: 'source';
          sourceId: string;
          sourceFieldId: FieldId;
      }
    /** Shared by every source, so it descends from no single one. */
    | {
          kind: 'joinKey';
          fieldIdBySourceId: Record<string, FieldId>;
      }
    /** Computed over the merged result, so it descends from no source. */
    | { kind: 'tableCalculation' };

/** Provenance of every merged field, by field id. */
export type MergeFieldOrigins = Record<FieldId, MergeFieldOrigin>;

/** Current JSON schema stored in `saved_queries_version_merges.merge`: a merge. */
export const SAVED_MERGE_QUERY_SCHEMA_VERSION = 3;
/** The legacy shape with explicit source ids. Still read, never written. */
export const SAVED_MERGE_QUERY_SCHEMA_VERSION_V2 = 2;

/**
 * A persisted merge source.
 *
 * The chart source is a reference: its metric query already lives on the chart
 * version. Every additional source owns its query. This keeps one source of
 * truth while allowing more sources without adding `thirdQuery`, `fourthQuery`,
 * and so on.
 */
export type SavedMergeQuerySource =
    | {
          id: string;
          kind: 'chart';
      }
    | {
          id: string;
          kind: 'query';
          metricQuery: MetricQuery;
      };

/**
 * Schema v2 of a merge stored on a chart version. Accepted on requests and
 * read from rows written before schema v3; rewritten to schema v3 by
 * upgradeSavedMergeQuery. Never written.
 * @deprecated use SavedMergeDefinition
 */
export type SavedMergeQuery = {
    /** Source whose rows a LEFT merge preserves. */
    primarySourceId: string;
    sources: SavedMergeQuerySource[];
    joinKey: MergeJoinKeyPart[];
    joinType: MergeJoinType;
    tableCalculations: MergeTableCalculation[];
    /**
     * Sources that repeat their values across the other sources' extra
     * dimensions (MergeQueryMetricSource.repeatValues). Kept on the merge,
     * not the source, so the source shapes stay as they were saved.
     * Omitted when none repeat.
     */
    repeatValuesSourceIds?: string[];
};

const parseJoinType = (value: unknown): MergeJoinType =>
    (Object.values(MergeJoinType) as unknown[]).includes(value)
        ? (value as MergeJoinType)
        : MergeJoinType.FULL;

/**
 * Reads a v2 merge back, returning null for anything that does not hold
 * together.
 */
export const parseSavedMergeQuery = (
    value: unknown,
): SavedMergeQuery | null => {
    if (value === null || typeof value !== 'object') return null;
    const candidate = value as Partial<SavedMergeQuery>;

    if (
        !Array.isArray(candidate.sources) ||
        candidate.sources.length < 2 ||
        typeof candidate.primarySourceId !== 'string'
    ) {
        return null;
    }
    const sourceIds = candidate.sources.map((source) => source?.id);
    if (
        sourceIds.some((id) => typeof id !== 'string' || id.length === 0) ||
        new Set(sourceIds).size !== sourceIds.length ||
        !sourceIds.includes(candidate.primarySourceId)
    ) {
        return null;
    }
    const validSources = candidate.sources.every((source) => {
        if (source?.kind === 'chart') {
            return true;
        }
        return (
            source?.kind === 'query' &&
            source.metricQuery !== null &&
            typeof source.metricQuery === 'object' &&
            typeof source.metricQuery.exploreName === 'string'
        );
    });
    const chartSources = candidate.sources.filter(
        (source) => source?.kind === 'chart',
    );
    if (!validSources || chartSources.length !== 1) {
        return null;
    }
    if (!Array.isArray(candidate.joinKey) || candidate.joinKey.length === 0) {
        return null;
    }
    const hasCompleteJoinKeys = candidate.joinKey.every((part) => {
        if (
            typeof part?.name !== 'string' ||
            part.fieldIdBySourceId === null ||
            typeof part.fieldIdBySourceId !== 'object'
        ) {
            return false;
        }
        const fieldSourceIds = Object.keys(part.fieldIdBySourceId);
        return (
            fieldSourceIds.length === sourceIds.length &&
            sourceIds.every(
                (sourceId) =>
                    typeof sourceId === 'string' &&
                    typeof part.fieldIdBySourceId[sourceId] === 'string',
            )
        );
    });
    if (!hasCompleteJoinKeys) return null;
    const repeatValuesSourceIds = Array.isArray(candidate.repeatValuesSourceIds)
        ? candidate.repeatValuesSourceIds.filter(
              (id): id is string =>
                  typeof id === 'string' && sourceIds.includes(id),
          )
        : [];

    return {
        primarySourceId: candidate.primarySourceId,
        sources: candidate.sources,
        joinKey: candidate.joinKey,
        joinType: parseJoinType(candidate.joinType),
        tableCalculations: Array.isArray(candidate.tableCalculations)
            ? candidate.tableCalculations
            : [],
        ...(repeatValuesSourceIds.length > 0 ? { repeatValuesSourceIds } : {}),
    };
};

/*
 * Schema v3: a merged chart stores named source queries and one join. The chart's own query is the
 * first input and goes by its explore's name; every other query is stored
 * in full under the name it goes by; one join over all of them; the sort
 * and limit of the merged result. Nothing here is SQL. The server compiles
 * it into the DuckDB join at submit, so only where the truth lives changed.
 *
 * Names are the merged result's table names: a query saved as `payments`
 * yields `payments_<fieldId>` columns, and a key named after the chart's
 * field yields `merge_<chartFieldId>`. A row rewritten from schema v2 keeps
 * the ids it had (`chartAs`, `keyNames`), so no chart config moves.
 */

/** A query the merge owns, run against an explore. */
export type SavedMergeDefinitionQuery = {
    explore: string;
    dimensions: FieldId[];
    metrics: FieldId[];
    filters?: Filters;
    tableCalculations?: TableCalculation[];
    additionalMetrics?: AdditionalMetric[];
    customDimensions?: CustomDimension[];
    metricOverrides?: MetricOverrides;
    dimensionOverrides?: DimensionOverrides;
    timezone?: string;
    /** See MergeQueryMetricSource.repeatValues. Omitted when off. */
    repeat?: boolean;
};

export type SavedMergeDefinitionSortDirection = 'asc' | 'desc';

/**
 * A sort of the merged result. `by` is a chart field id, a `query.fieldId`
 * reference into another query, or the name of a merge table calculation.
 * A chart field that is a join key sorts the key column.
 */
export type SavedMergeDefinitionSort = {
    by: string;
    direction: SavedMergeDefinitionSortDirection;
};

export type SavedMergeDefinition = {
    /** The chart query's name in merged column ids, when not its explore's. */
    chartAs?: string;
    /** The chart's own query repeats its values. Omitted when off. */
    chartRepeats?: boolean;
    /** The other queries, by the name they go by. */
    queries: { [name: string]: SavedMergeDefinitionQuery };
    join: MergeJoinType;
    /**
     * The join keys: each entry is the chart's field and one `query.fieldId`
     * reference per other query. The key column takes the chart field's id.
     */
    keys: { [chartFieldId: string]: string[] };
    /** The key column's name, when not the chart field's id. */
    keyNames?: { [chartFieldId: string]: string };
    sort?: SavedMergeDefinitionSort[];
    limit: number;
    tableCalculations?: MergeTableCalculation[];
};

const MERGE_DEFINITION_REFERENCE_SEPARATOR = '.';
const MERGE_DEFINITION_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_]*$/;

/** `query.fieldId` into another query, or a bare chart field id. */
export const parseMergeDefinitionReference = (
    reference: string,
): { query: string | null; fieldId: FieldId } => {
    const separator = reference.indexOf(MERGE_DEFINITION_REFERENCE_SEPARATOR);
    return separator === -1
        ? { query: null, fieldId: reference }
        : {
              query: reference.slice(0, separator),
              fieldId: reference.slice(separator + 1),
          };
};

/** The name the chart's query goes by in the merged result. */
export const getMergeDefinitionChartName = (
    merge: Pick<SavedMergeDefinition, 'chartAs'>,
    chartExploreName: string,
): string => merge.chartAs ?? chartExploreName;

/** The explore names of the queries beside the chart's, in order. */
export const getMergeDefinitionQueryExploreNames = (
    merge: Pick<SavedMergeDefinition, 'queries'>,
): string[] => Object.values(merge.queries).map(({ explore }) => explore);

const getMergeDefinitionJoinKey = (
    merge: Pick<SavedMergeDefinition, 'keys' | 'keyNames'>,
    chartName: string,
): MergeJoinKeyPart[] =>
    Object.entries(merge.keys).map(([chartFieldId, references]) => ({
        name: merge.keyNames?.[chartFieldId] ?? chartFieldId,
        fieldIdBySourceId: {
            [chartName]: chartFieldId,
            ...Object.fromEntries(
                references.map((reference) => {
                    const { query, fieldId } =
                        parseMergeDefinitionReference(reference);
                    return [query ?? chartName, fieldId];
                }),
            ),
        },
    }));

/** The merged field id a sort's `by` names. */
const resolveMergeDefinitionSortField = (
    by: string,
    merge: Pick<
        SavedMergeDefinition,
        'keys' | 'keyNames' | 'tableCalculations'
    >,
    chartName: string,
): FieldId => {
    if (merge.tableCalculations?.some(({ name }) => name === by)) {
        return getItemId({ table: MERGE_TABLE_NAME, name: by });
    }
    if (by in merge.keys) {
        return getItemId({
            table: MERGE_TABLE_NAME,
            name: merge.keyNames?.[by] ?? by,
        });
    }
    const { query, fieldId } = parseMergeDefinitionReference(by);
    return getItemId({ table: query ?? chartName, name: fieldId });
};

/** The `by` that names a merged field id, or null when nothing does. */
const toMergeDefinitionSortReference = (
    mergedFieldId: FieldId,
    {
        chartName,
        queryNames,
        joinKey,
        calculationNames,
    }: {
        chartName: string;
        queryNames: string[];
        joinKey: MergeJoinKeyPart[];
        calculationNames: string[];
    },
): string | null => {
    const calculationName = calculationNames.find(
        (name) =>
            mergedFieldId === name ||
            mergedFieldId === getItemId({ table: MERGE_TABLE_NAME, name }),
    );
    if (calculationName) return calculationName;
    const keyPart = joinKey.find(
        (part) =>
            getItemId({ table: MERGE_TABLE_NAME, name: part.name }) ===
            mergedFieldId,
    );
    if (keyPart) return keyPart.fieldIdBySourceId[chartName] ?? null;
    // Longest name first: `orders_2` must win over `orders`
    const names = [chartName, ...queryNames].sort(
        (a, b) => b.length - a.length,
    );
    const owner = names.find((name) => mergedFieldId.startsWith(`${name}_`));
    if (!owner) return null;
    const fieldId = mergedFieldId.slice(owner.length + 1);
    return owner === chartName
        ? fieldId
        : `${owner}${MERGE_DEFINITION_REFERENCE_SEPARATOR}${fieldId}`;
};

const toMergeDefinitionQuery = (
    metricQuery: MetricQuery,
    repeat: boolean,
): SavedMergeDefinitionQuery => ({
    explore: metricQuery.exploreName,
    dimensions: metricQuery.dimensions,
    metrics: metricQuery.metrics,
    ...(getTotalFilterRules(metricQuery.filters).length > 0
        ? { filters: metricQuery.filters }
        : {}),
    ...(metricQuery.tableCalculations.length > 0
        ? { tableCalculations: metricQuery.tableCalculations }
        : {}),
    ...(metricQuery.additionalMetrics?.length
        ? { additionalMetrics: metricQuery.additionalMetrics }
        : {}),
    ...(metricQuery.customDimensions?.length
        ? { customDimensions: metricQuery.customDimensions }
        : {}),
    ...(metricQuery.metricOverrides &&
    Object.keys(metricQuery.metricOverrides).length > 0
        ? { metricOverrides: metricQuery.metricOverrides }
        : {}),
    ...(metricQuery.dimensionOverrides &&
    Object.keys(metricQuery.dimensionOverrides).length > 0
        ? { dimensionOverrides: metricQuery.dimensionOverrides }
        : {}),
    ...(metricQuery.timezone ? { timezone: metricQuery.timezone } : {}),
    ...(repeat ? { repeat: true } : {}),
});

/**
 * The merge a runnable merge saves as. The chart's source must be one of
 * the sources and every other source must be a metric query, because a
 * saved chart cannot re-run a referenced result.
 */
export const buildSavedMergeDefinition = ({
    mergeQuery,
    chartSourceId,
}: {
    mergeQuery: MergeQuery;
    chartSourceId: string;
}): SavedMergeDefinition => {
    const chartSource = mergeQuery.sources.find(
        (source) => source.id === chartSourceId,
    );
    if (!chartSource || !isMergeMetricSource(chartSource)) {
        throw new Error('A saved merge requires the chart query.');
    }
    const others = mergeQuery.sources.filter(
        (source) => source.id !== chartSourceId,
    );
    const queries = Object.fromEntries(
        others.map((source) => {
            if (!isMergeMetricSource(source)) {
                throw new Error(
                    'A merge over existing query results cannot be saved to a chart.',
                );
            }
            return [
                source.id,
                toMergeDefinitionQuery(
                    source.metricQuery,
                    source.repeatValues === true,
                ),
            ];
        }),
    );
    const keys = Object.fromEntries(
        mergeQuery.joinKey.map((part) => {
            const chartFieldId = part.fieldIdBySourceId[chartSourceId];
            if (!chartFieldId) {
                throw new Error('Every join key needs the chart query.');
            }
            return [
                chartFieldId,
                others.map(
                    (source) =>
                        `${source.id}${MERGE_DEFINITION_REFERENCE_SEPARATOR}${part.fieldIdBySourceId[source.id]}`,
                ),
            ];
        }),
    );
    const keyNames = Object.fromEntries(
        mergeQuery.joinKey.flatMap((part) => {
            const chartFieldId = part.fieldIdBySourceId[chartSourceId];
            return part.name === chartFieldId
                ? []
                : [[chartFieldId, part.name]];
        }),
    );
    const sortContext = {
        chartName: chartSourceId,
        queryNames: others.map(({ id }) => id),
        joinKey: mergeQuery.joinKey,
        calculationNames: mergeQuery.tableCalculations.map(({ name }) => name),
    };
    const sort = (mergeQuery.sorts ?? []).flatMap((field) => {
        const by = toMergeDefinitionSortReference(field.fieldId, sortContext);
        return by === null
            ? []
            : [{ by, direction: field.descending ? 'desc' : 'asc' } as const];
    });
    const chartRepeats = chartSource.repeatValues === true;
    return {
        ...(chartSourceId !== chartSource.metricQuery.exploreName
            ? { chartAs: chartSourceId }
            : {}),
        queries,
        join: mergeQuery.joinType,
        keys,
        ...(Object.keys(keyNames).length > 0 ? { keyNames } : {}),
        ...(sort.length > 0 ? { sort } : {}),
        limit: mergeQuery.limit,
        ...(mergeQuery.tableCalculations.length > 0
            ? { tableCalculations: mergeQuery.tableCalculations }
            : {}),
        ...(chartRepeats ? { chartRepeats: true } : {}),
    };
};

/** Rebuilds a runnable merge from a chart's own query and its stored merge. */
export const buildMergeQueryFromMergeDefinition = (
    chartMetricQuery: MetricQuery,
    merge: SavedMergeDefinition,
): MergeQuery => {
    const chartName = getMergeDefinitionChartName(
        merge,
        chartMetricQuery.exploreName,
    );
    const sources: MergeQueryMetricSource[] = [
        {
            id: chartName,
            metricQuery: chartMetricQuery,
            ...(merge.chartRepeats ? { repeatValues: true } : {}),
        },
        ...Object.entries(merge.queries).map(
            ([name, query]): MergeQueryMetricSource => {
                const { explore, repeat, ...intent } = query;
                return {
                    id: name,
                    metricQuery: {
                        exploreName: explore,
                        ...intent,
                        filters: query.filters ?? {},
                        tableCalculations: query.tableCalculations ?? [],
                        sorts: [],
                        limit: merge.limit,
                    },
                    ...(repeat ? { repeatValues: true } : {}),
                };
            },
        ),
    ];
    return {
        sources,
        joinKey: getMergeDefinitionJoinKey(merge, chartName),
        joinType: merge.join,
        tableCalculations: merge.tableCalculations ?? [],
        sorts: (merge.sort ?? []).map(({ by, direction }) => ({
            fieldId: resolveMergeDefinitionSortField(by, merge, chartName),
            descending: direction === 'desc',
        })),
        limit: merge.limit,
    };
};

/**
 * Rebuilds a runnable merge from a chart's own query and a schema v2 merge,
 * the shape requests and Document chart cells still carry.
 */
export const buildMergeQueryFromSaved = (
    chartMetricQuery: MetricQuery,
    saved: SavedMergeQuery,
): MergeQuery => {
    const repeating = new Set(saved.repeatValuesSourceIds ?? []);
    const sources = saved.sources.map((source): MergeQuerySource => {
        const repeat = repeating.has(source.id) ? { repeatValues: true } : {};
        if (source.kind === 'chart') {
            return { ...repeat, id: source.id, metricQuery: chartMetricQuery };
        }
        return { ...repeat, id: source.id, metricQuery: source.metricQuery };
    });
    const primaryIndex = sources.findIndex(
        (source) => source.id === saved.primarySourceId,
    );
    if (primaryIndex > 0) {
        sources.unshift(...sources.splice(primaryIndex, 1));
    }
    return {
        sources,
        joinKey: saved.joinKey,
        joinType: saved.joinType,
        tableCalculations: saved.tableCalculations,
        // The chart's sort state is the Explorer's, so it may still name
        // primary fields from before the merge was built
        sorts: toMergedSorts({
            sorts: chartMetricQuery.sorts,
            primarySourceId: saved.primarySourceId,
            primaryMetricQuery: chartMetricQuery,
            joinKey: saved.joinKey,
        }),
        limit: chartMetricQuery.limit,
    };
};

/**
 * A pure rewrite of the v2 shape, keeping the ids it had. The chart's sort
 * state was the Explorer's and named primary fields, so it is mapped once
 * here; the chart's limit was the merged result's. A v2 merge whose
 * primary was not the chart has no merge form: the chart is always the
 * first input.
 */
export const upgradeSavedMergeQuery = (
    saved: SavedMergeQuery,
    chartMetricQuery: MetricQuery,
): SavedMergeDefinition | null => {
    const chartSource = saved.sources.find((source) => source.kind === 'chart');
    if (!chartSource || chartSource.id !== saved.primarySourceId) return null;
    return buildSavedMergeDefinition({
        mergeQuery: buildMergeQueryFromSaved(chartMetricQuery, saved),
        chartSourceId: chartSource.id,
    });
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === 'object' && !Array.isArray(value);

const isStringArray = (value: unknown): value is string[] =>
    Array.isArray(value) && value.every((item) => typeof item === 'string');

const isMergeDefinitionName = (value: unknown): value is string =>
    typeof value === 'string' &&
    MERGE_DEFINITION_NAME_PATTERN.test(value) &&
    value !== MERGE_TABLE_NAME;

const parseMergeDefinitionQuery = (
    candidate: unknown,
): SavedMergeDefinitionQuery | null => {
    if (
        !isRecord(candidate) ||
        typeof candidate.explore !== 'string' ||
        !isStringArray(candidate.dimensions) ||
        !isStringArray(candidate.metrics) ||
        (candidate.filters !== undefined && !isRecord(candidate.filters)) ||
        (candidate.tableCalculations !== undefined &&
            !Array.isArray(candidate.tableCalculations)) ||
        (candidate.repeat !== undefined &&
            typeof candidate.repeat !== 'boolean')
    ) {
        return null;
    }
    return toMergeDefinitionQuery(
        {
            exploreName: candidate.explore,
            dimensions: candidate.dimensions,
            metrics: candidate.metrics,
            filters: (candidate.filters as Filters | undefined) ?? {},
            tableCalculations:
                (candidate.tableCalculations as
                    | TableCalculation[]
                    | undefined) ?? [],
            sorts: [],
            limit: 0,
            additionalMetrics: Array.isArray(candidate.additionalMetrics)
                ? (candidate.additionalMetrics as AdditionalMetric[])
                : undefined,
            customDimensions: Array.isArray(candidate.customDimensions)
                ? (candidate.customDimensions as CustomDimension[])
                : undefined,
            metricOverrides: isRecord(candidate.metricOverrides)
                ? (candidate.metricOverrides as MetricOverrides)
                : undefined,
            dimensionOverrides: isRecord(candidate.dimensionOverrides)
                ? (candidate.dimensionOverrides as DimensionOverrides)
                : undefined,
            timezone:
                typeof candidate.timezone === 'string'
                    ? candidate.timezone
                    : undefined,
        },
        candidate.repeat === true,
    );
};

const parseMergeDefinitionKeys = (
    candidate: unknown,
    queryNames: string[],
): SavedMergeDefinition['keys'] | null => {
    if (!isRecord(candidate) || Object.keys(candidate).length === 0)
        return null;
    const entries = Object.entries(candidate).map(
        ([chartFieldId, references]): [string, string[]] | null => {
            if (chartFieldId.length === 0 || !isStringArray(references)) {
                return null;
            }
            // One reference per other query, each into a query that exists
            const referenced = references.map(
                (reference) => parseMergeDefinitionReference(reference).query,
            );
            const complete =
                referenced.length === queryNames.length &&
                queryNames.every((name) => referenced.includes(name)) &&
                references.every(
                    (reference) =>
                        parseMergeDefinitionReference(reference).fieldId
                            .length > 0,
                );
            return complete ? [chartFieldId, references] : null;
        },
    );
    return entries.every((entry) => entry !== null)
        ? Object.fromEntries(entries as [string, string[]][])
        : null;
};

/**
 * Reads a stored merge back, returning null for anything that does not
 * hold together: named queries against explores, one join with a key that
 * reaches every query, a known join type, a numeric limit.
 */
export const parseSavedMergeDefinition = (
    value: unknown,
): SavedMergeDefinition | null => {
    if (!isRecord(value)) return null;
    const rawQueries = value.queries;
    if (!isRecord(rawQueries)) return null;
    const queryNames = Object.keys(rawQueries);
    if (
        queryNames.length === 0 ||
        !queryNames.every(isMergeDefinitionName) ||
        (value.chartAs !== undefined &&
            (!isMergeDefinitionName(value.chartAs) ||
                queryNames.includes(value.chartAs)))
    ) {
        return null;
    }
    const parsedQueries = queryNames.map((name) => [
        name,
        parseMergeDefinitionQuery(rawQueries[name]),
    ]);
    if (parsedQueries.some(([, query]) => query === null)) return null;
    if (!(Object.values(MergeJoinType) as unknown[]).includes(value.join)) {
        return null;
    }
    const keys = parseMergeDefinitionKeys(value.keys, queryNames);
    if (keys === null) return null;
    if (
        value.keyNames !== undefined &&
        (!isRecord(value.keyNames) ||
            !Object.entries(value.keyNames).every(
                ([chartFieldId, name]) =>
                    chartFieldId in keys &&
                    typeof name === 'string' &&
                    name.length > 0,
            ))
    ) {
        return null;
    }
    if (
        value.sort !== undefined &&
        (!Array.isArray(value.sort) ||
            !value.sort.every(
                (sort: unknown) =>
                    isRecord(sort) &&
                    typeof sort.by === 'string' &&
                    (sort.direction === 'asc' || sort.direction === 'desc'),
            ))
    ) {
        return null;
    }
    if (
        typeof value.limit !== 'number' ||
        (value.tableCalculations !== undefined &&
            !Array.isArray(value.tableCalculations)) ||
        (value.chartRepeats !== undefined &&
            typeof value.chartRepeats !== 'boolean')
    ) {
        return null;
    }
    const keyNames = value.keyNames as SavedMergeDefinition['keyNames'];
    const sort = value.sort as SavedMergeDefinitionSort[] | undefined;
    const tableCalculations = value.tableCalculations as
        | MergeTableCalculation[]
        | undefined;
    return {
        ...(value.chartAs !== undefined
            ? { chartAs: value.chartAs as string }
            : {}),
        queries: Object.fromEntries(
            parsedQueries,
        ) as SavedMergeDefinition['queries'],
        join: value.join as MergeJoinType,
        keys,
        ...(keyNames && Object.keys(keyNames).length > 0 ? { keyNames } : {}),
        ...(sort && sort.length > 0 ? { sort } : {}),
        limit: value.limit,
        ...(tableCalculations && tableCalculations.length > 0
            ? { tableCalculations }
            : {}),
        ...(value.chartRepeats === true ? { chartRepeats: true } : {}),
    };
};

/**
 * Reads whatever a chart version stored. A v2 merge is rewritten to a
 * merge with the chart's own sort and limit; an unknown version leaves
 * the chart working without its merge rather than breaking the chart.
 */
export const parseStoredMergeDefinition = ({
    schemaVersion,
    value,
    chartMetricQuery,
}: {
    schemaVersion: number;
    value: unknown;
    chartMetricQuery: MetricQuery;
}): SavedMergeDefinition | null => {
    switch (schemaVersion) {
        case SAVED_MERGE_QUERY_SCHEMA_VERSION:
            return parseSavedMergeDefinition(value);
        case SAVED_MERGE_QUERY_SCHEMA_VERSION_V2: {
            const saved = parseSavedMergeQuery(value);
            return saved
                ? upgradeSavedMergeQuery(saved, chartMetricQuery)
                : null;
        }
        default:
            return null;
    }
};

/** Normalizes either supported request shape to the saved schema v3 definition. */
export const normalizeSavedMergeDefinition = (
    value: SavedMergeDefinition | SavedMergeQuery,
    chartMetricQuery: MetricQuery,
): SavedMergeDefinition | null =>
    'queries' in value
        ? parseSavedMergeDefinition(value)
        : upgradeSavedMergeQuery(value, chartMetricQuery);
