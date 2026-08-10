import { DimensionType, FieldType, type FieldId, type ItemsMap } from './field';
import { type MetricQuery } from './metricQuery';
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
 * A dimension spread into columns. The value set is part of the request
 * because SQL has to name the columns: widening is only possible over a
 * bounded, known set.
 */
export type MergePivot = {
    fieldId: FieldId;
    values: string[];
    /** Emit a column for rows whose dimension is null. */
    includeNulls: boolean;
};

/**
 * One side of a merge: a metric query, plus the dimension it spreads into
 * columns before the join.
 */
export type MergeQuerySource = {
    /** Stable id. Names the CTE and prefixes this source's output columns. */
    id: string;
    metricQuery: MetricQuery;
    /**
     * Dimension pivoted into columns *before* the join, or null. This is grain
     * repair, not presentation: a dimension only one source has cannot survive
     * the join as rows without fanning the other source out, but it can survive
     * as columns. See `getUnaccountedDimensions`.
     */
    pivot: MergePivot | null;
};

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
    /**
     * Join key part spread into columns *after* the join. Naming a key part
     * rather than a field id is deliberate: a post-pivot is only correct when
     * every source carries the dimension, so restricting it to the join key
     * makes the incorrect case unrepresentable instead of merely rejected.
     */
    postPivot: {
        keyName: string;
        values: string[];
        includeNulls: boolean;
    } | null;
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
    /**
     * Merged column name for each source column, keyed by source id. When the
     * merge is post-pivoted the inner key is `<column>.<pivot value>`.
     */
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
};

/** Field metadata by field id, for every field named in a join key. */
export type MergeFieldTypes = Record<FieldId, MergeFieldMeta>;

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
 * Merged columns are renamed to keep two sources from colliding, and a
 * pre-pivoted metric becomes one column per value, so the mapping back to the
 * field a column came from cannot be recovered from its name — it has to be
 * carried.
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
    /** The pivot value this column holds, when it was spread into columns. */
    pivotValue: string | null;
};

export enum MergeQueryErrorKind {
    TOO_FEW_SOURCES = 'too_few_sources',
    DUPLICATE_SOURCE_ID = 'duplicate_source_id',
    EMPTY_JOIN_KEY = 'empty_join_key',
    JOIN_KEY_COVERAGE = 'join_key_coverage',
    UNKNOWN_SOURCE_IN_JOIN_KEY = 'unknown_source_in_join_key',
    /**
     * A source still carries a dimension that is neither part of the join key
     * nor pivoted away. Joining it would repeat the other sources' rows once
     * per value — the merged table looks reasonable and every aggregate over it
     * is wrong.
     */
    FAN_OUT = 'fan_out',
    /** Pre-pivoting a join key part would consume the column being joined on. */
    PIVOT_ON_JOIN_KEY = 'pivot_on_join_key',
    /** Pre-pivoting a dimension the source does not select. */
    PIVOT_DIMENSION_NOT_SELECTED = 'pivot_dimension_not_selected',
    UNKNOWN_POST_PIVOT_KEY = 'unknown_post_pivot_key',
    /** Widening needs at least one column to widen into. */
    EMPTY_PIVOT_VALUES = 'empty_pivot_values',
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
    /** More pivot columns than the warehouse/pivot limit allows. */
    TOO_MANY_PIVOT_COLUMNS = 'too_many_pivot_columns',
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
}

export type MergeQueryError = {
    kind: MergeQueryErrorKind;
    /** The source at fault, or null for errors about the merge as a whole. */
    sourceId: string | null;
    fieldIds: FieldId[];
    message: string;
};

const getJoinKeyFieldIdsForSource = (
    joinKey: MergeJoinKeyPart[],
    sourceId: string,
): FieldId[] =>
    joinKey.flatMap((part) => {
        const fieldId = part.fieldIdBySourceId[sourceId];
        return fieldId === undefined ? [] : [fieldId];
    });

/**
 * Dimensions a source carries that the merge cannot account for: not in the
 * join key, not pivoted into columns. A non-empty result is the fan-out trap,
 * and is what the explorer renders as an incomplete merge row.
 */
export const getUnaccountedDimensions = (
    source: MergeQuerySource,
    joinKey: MergeJoinKeyPart[],
): FieldId[] => {
    const accounted = new Set([
        ...getJoinKeyFieldIdsForSource(joinKey, source.id),
        ...(source.pivot ? [source.pivot.fieldId] : []),
    ]);
    return source.metricQuery.dimensions.filter(
        (dimension) => !accounted.has(dimension),
    );
};

/**
 * Every reason this merge would produce a wrong or unbuildable result. Empty
 * means the merge is safe to compile.
 */
export const validateMergeQuery = (
    mergeQuery: MergeQuery,
    /**
     * Types of every field named in the join key. Omitting it skips the type
     * and granularity checks — structural validation still runs, but a
     * mismatched join will only show up as a puzzling empty result.
     */
    fieldTypes?: MergeFieldTypes,
    /** Max pivot columns, mirroring the pivot table's own column limit. */
    maxPivotColumns?: number,
): MergeQueryError[] => {
    const { sources, joinKey, postPivot } = mergeQuery;
    const errors: MergeQueryError[] = [];

    if (sources.length < 2) {
        errors.push({
            kind: MergeQueryErrorKind.TOO_FEW_SOURCES,
            sourceId: null,
            fieldIds: [],
            message: 'A merge needs at least two queries.',
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
            if (part.fieldIdBySourceId[source.id] === undefined) {
                errors.push({
                    kind: MergeQueryErrorKind.JOIN_KEY_COVERAGE,
                    sourceId: source.id,
                    fieldIds: [],
                    message: `Query "${source.id}" has no field to join on for "${part.name}".`,
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

        const joined = Object.values(part.fieldIdBySourceId).flatMap(
            (fieldId) => {
                const meta = fieldTypes[fieldId];
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
        const joinKeyFieldIds = new Set(
            getJoinKeyFieldIdsForSource(joinKey, source.id),
        );
        const selectedDimensions = new Set(source.metricQuery.dimensions);

        const pivotFieldIds = source.pivot ? [source.pivot.fieldId] : [];
        const pivotedJoinKeys = pivotFieldIds.filter((dimension) =>
            joinKeyFieldIds.has(dimension),
        );
        if (pivotedJoinKeys.length > 0) {
            errors.push({
                kind: MergeQueryErrorKind.PIVOT_ON_JOIN_KEY,
                sourceId: source.id,
                fieldIds: pivotedJoinKeys,
                message: `Query "${source.id}" pivots a field it also joins on, which would consume the join key.`,
            });
        }

        const unselectedPivots = pivotFieldIds.filter(
            (dimension) => !selectedDimensions.has(dimension),
        );
        if (unselectedPivots.length > 0) {
            errors.push({
                kind: MergeQueryErrorKind.PIVOT_DIMENSION_NOT_SELECTED,
                sourceId: source.id,
                fieldIds: unselectedPivots,
                message: `Query "${source.id}" pivots a field it does not select.`,
            });
        }

        if (source.pivot && source.pivot.values.length === 0) {
            errors.push({
                kind: MergeQueryErrorKind.EMPTY_PIVOT_VALUES,
                sourceId: source.id,
                fieldIds: [source.pivot.fieldId],
                message: `Query "${source.id}" pivots ${source.pivot.fieldId} but names no values to spread into columns.`,
            });
        }

        if (
            source.pivot &&
            maxPivotColumns !== undefined &&
            source.pivot.values.length *
                Math.max(source.metricQuery.metrics.length, 1) >
                maxPivotColumns
        ) {
            errors.push({
                kind: MergeQueryErrorKind.TOO_MANY_PIVOT_COLUMNS,
                sourceId: source.id,
                fieldIds: [source.pivot.fieldId],
                message: `Query "${source.id}" would spread into more than ${maxPivotColumns} columns. Narrow the values or filter the query first.`,
            });
        }

        const unaccounted = getUnaccountedDimensions(source, joinKey);
        if (unaccounted.length > 0) {
            errors.push({
                kind: MergeQueryErrorKind.FAN_OUT,
                sourceId: source.id,
                fieldIds: unaccounted,
                message: `Query "${source.id}" carries ${unaccounted.join(
                    ', ',
                )}, which is neither joined on nor pivoted. Merging would repeat the other queries' rows once per value.`,
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

    // Reference resolution is deliberately not checked here: a pre-pivoted
    // source replaces one metric column with one per value, so only the
    // compiler knows the real column names. See ProjectService.compileMergeQuery.

    if (postPivot !== null) {
        if (!joinKey.some((part) => part.name === postPivot.keyName)) {
            errors.push({
                kind: MergeQueryErrorKind.UNKNOWN_POST_PIVOT_KEY,
                sourceId: null,
                fieldIds: [],
                message: `Cannot pivot the merged result by "${postPivot.keyName}" because it is not part of the join key.`,
            });
        }
        const postPivotColumns =
            postPivot.values.length *
            sources.reduce(
                (total, source) =>
                    total +
                    Math.max(source.metricQuery.metrics.length, 1) *
                        (source.pivot
                            ? Math.max(source.pivot.values.length, 1)
                            : 1),
                0,
            );
        if (
            maxPivotColumns !== undefined &&
            postPivotColumns > maxPivotColumns
        ) {
            errors.push({
                kind: MergeQueryErrorKind.TOO_MANY_PIVOT_COLUMNS,
                sourceId: null,
                fieldIds: [],
                message: `Pivoting the merged result by "${postPivot.keyName}" would produce ${postPivotColumns} columns, past the ${maxPivotColumns} column limit.`,
            });
        }
        if (postPivot.values.length === 0) {
            errors.push({
                kind: MergeQueryErrorKind.EMPTY_PIVOT_VALUES,
                sourceId: null,
                fieldIds: [],
                message: `Cannot pivot the merged result by "${postPivot.keyName}" without naming values to spread into columns.`,
            });
        }
    }

    return errors;
};

/**
 * What the compile endpoint returns. `sql` is null exactly when `errors` is
 * non-empty: a merge that would produce wrong numbers is reported, not run.
 */
export type ApiCompiledMergeQueryResults = {
    sql: string | null;
    columns: MergeQueryColumns | null;
    /** Selectable description of every merged column. Empty when sql is null. */
    fields: MergeQueryField[];
    errors: MergeQueryError[];
};

/** Distinct values available to spread into columns, and whether the list was cut. */
export type ApiMergePivotValuesResults = {
    values: string[];
    truncated: boolean;
};

/** Table name merged columns are attributed to. They belong to no explore. */
export const MERGE_TABLE_NAME = 'merge';

/**
 * Presents merged columns as ordinary fields, so everything downstream —
 * formatting, sorting, chart configuration, saving — can treat a merged result
 * like any other result instead of growing a second code path for it.
 *
 * `sql` is empty on purpose: these describe columns that already exist in a
 * compiled statement, so nothing needs to compile them again. They are display
 * identities, not query fragments.
 */
export const getMergeItemsMap = (fields: MergeQueryField[]): ItemsMap =>
    Object.fromEntries(
        fields.map((field) => [
            field.column,
            {
                fieldType:
                    field.kind === 'metric'
                        ? FieldType.METRIC
                        : FieldType.DIMENSION,
                type: field.type,
                name: field.column,
                label: field.label,
                table: MERGE_TABLE_NAME,
                tableLabel: field.sourceId
                    ? `Query ${field.sourceId.toUpperCase()}`
                    : 'Merged',
                sql: '',
                hidden: false,
            },
        ]),
    ) as ItemsMap;
