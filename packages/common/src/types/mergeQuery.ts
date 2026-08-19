import {
    DimensionType,
    type FieldId,
    type ItemsMap,
    type TimestampDomain,
} from './field';
import { type MetricQuery } from './metricQuery';
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

/** One side of a merge: a metric query compiled and run as part of the merge. */
export type MergeQueryMetricSource = {
    /** Stable id. Names the CTE, and the table its merged fields belong to. */
    id: string;
    metricQuery: MetricQuery;
};

/**
 * One side of a merge: an existing query result, referenced by queryUuid and
 * joined as the rows it already holds — nothing re-runs. Its structure and
 * types resolve at compile time from the stored query metadata, and the join
 * executes on the compose engine (`requiresCompose` on the compiled merge),
 * so a merge with a result source is refused where that engine is
 * unavailable. Results are creator-scoped and expire; an expired reference
 * is re-submitted as a query, not refreshed by handle.
 */
export type MergeQueryResultSource = {
    /** Stable id. Names the CTE, and the table its merged fields belong to. */
    id: string;
    queryUuid: string;
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
 * A calculation over the *merged* result, which is the only place a row-wise
 * calculation across two queries can correctly live. References name a source
 * and one of its fields, `${sourceId.fieldId}`, because the merged statement
 * renames columns to keep two sources from colliding.
 */
export type MergeTableCalculation = {
    name: string;
    displayName: string;
    sql: string;
};

/** `${sourceId.fieldId}` inside a merge table calculation. */
export const mergeCalculationReferencePattern = /\$\{([a-zA-Z0-9_.-]+)\}/g;

export type MergeQuery = {
    sources: MergeQuerySource[];
    joinKey: MergeJoinKeyPart[];
    joinType: MergeJoinType;
    /** Calculations over the merged result. Applied last, after any pivot. */
    tableCalculations: MergeTableCalculation[];
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
     * The merge references existing query results, which only the compose
     * engine can join — there is no warehouse statement to fall back to.
     */
    COMPOSE_REQUIRED = 'compose_required',
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
 * Every reason this merge would produce a wrong or unbuildable result. Empty
 * means the merge is safe to compile.
 */
/**
 * Table merged columns that belong to no single source are attributed to:
 * join keys, which are shared by every source, and calculations over the
 * merged result.
 */
export const MERGE_TABLE_NAME = 'merge';

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
            // references a column the warehouse has never heard of. Result
            // sources defer this to the compiler, which has their structure.
            if (
                isMergeMetricSource(source) &&
                !source.metricQuery.dimensions.includes(fieldId)
            ) {
                errors.push({
                    kind: MergeQueryErrorKind.JOIN_KEY_NOT_SELECTED,
                    sourceId: source.id,
                    fieldIds: [fieldId],
                    message: `Query "${source.id}" joins on ${fieldId}, which it does not group by. Add it to that query, or join on a field it already has.`,
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
        if (unaccounted.length > 0) {
            errors.push({
                kind: MergeQueryErrorKind.FAN_OUT,
                sourceId: source.id,
                fieldIds: unaccounted,
                message: `Query "${source.id}" carries ${unaccounted.join(
                    ', ',
                )}, which is not joined on. Merging would repeat the other queries' rows once per value.`,
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
 * The terminal stage of a merged statement, owned by the run path: sort,
 * limit, and truncation detection. Kept as data rather than SQL text so the
 * run path can attach it above whatever it stacked on the core (for example a
 * date spine), and so the composable core stays clean under `SELECT *`.
 */
export type MergeTerminalWrapper = {
    /** ORDER BY terms in output-alias space, already quoted for the dialect. */
    orderBy: string[];
    limit: number | null;
    /** Boolean SQL expression that is true when a source exceeded its cap. */
    sourceLimitExceededSql: string | null;
};

/**
 * What the compile endpoint returns. `sql` is null exactly when `errors` is
 * non-empty: a merge that would produce wrong numbers is reported, not run.
 */
export type ApiCompiledMergeQueryResults = {
    sql: string | null;
    /**
     * The composable core: a self-contained single-statement SELECT with no
     * ORDER BY, no LIMIT and no guard column — valid under `SELECT *`, so it
     * can back a virtual view. `sql` is this core with the terminal wrapper
     * attached.
     */
    coreSql: string | null;
    /** The core's columns, in the order the statement returns them. */
    typedColumns: MergeTypedColumn[] | null;
    /** The terminal stage `sql` attaches over the core. */
    terminalWrapper: MergeTerminalWrapper | null;
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
     * The merge references existing query results, so it has no warehouse
     * statement (`sql`/`coreSql` stay null without that being an error) and
     * only the compose engine can run it.
     */
    requiresCompose: boolean;
    errors: MergeQueryError[];
};

/**
 * Column the merged statement carries to report that a query produced more
 * rows than the merge is willing to join. It is a guard, not data: the caller
 * refuses the result rather than showing a partial join.
 */
export const MERGE_TRUNCATED_COLUMN = '__merge_truncated';

/** Internal marker that distinguishes the empty-result guard row from data. */
export const MERGE_ROW_PRESENT_COLUMN = '__merge_row_present';

/** Label for the pseudo-table a source's merged fields belong to. */
export const getMergeSourceTableLabel = (sourceIndex: number): string =>
    `Query ${String.fromCharCode(65 + sourceIndex)}`;

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

/** Current JSON schema stored in `saved_queries_version_merges.merge`. */
export const SAVED_MERGE_QUERY_SCHEMA_VERSION = 2;

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

/** Canonical, scalable representation of a merge stored on a chart version. */
export type SavedMergeQuery = {
    /** Source whose rows a LEFT merge preserves. */
    primarySourceId: string;
    sources: SavedMergeQuerySource[];
    joinKey: MergeJoinKeyPart[];
    joinType: MergeJoinType;
    tableCalculations: MergeTableCalculation[];
};

/**
 * Rebuilds a runnable merge from a chart's own query and its stored merge.
 */
export const buildMergeQueryFromSaved = (
    chartMetricQuery: MetricQuery,
    saved: SavedMergeQuery,
): MergeQuery => {
    const sources = saved.sources.map((source): MergeQuerySource => {
        if (source.kind === 'chart') {
            return { id: source.id, metricQuery: chartMetricQuery };
        }
        return { id: source.id, metricQuery: source.metricQuery };
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
        limit: chartMetricQuery.limit,
    };
};

const parseJoinType = (value: unknown): MergeJoinType =>
    (Object.values(MergeJoinType) as unknown[]).includes(value)
        ? (value as MergeJoinType)
        : MergeJoinType.FULL;

/**
 * Reads a stored merge back, returning null for anything that does not hold
 * together. An unknown future version leaves the chart working without its
 * merge rather than breaking the chart entirely.
 */
export const parseSavedMergeQuery = (
    schemaVersion: number,
    value: unknown,
): SavedMergeQuery | null => {
    if (schemaVersion !== SAVED_MERGE_QUERY_SCHEMA_VERSION) return null;
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

    return {
        primarySourceId: candidate.primarySourceId,
        sources: candidate.sources,
        joinKey: candidate.joinKey,
        joinType: parseJoinType(candidate.joinType),
        tableCalculations: Array.isArray(candidate.tableCalculations)
            ? candidate.tableCalculations
            : [],
    };
};
