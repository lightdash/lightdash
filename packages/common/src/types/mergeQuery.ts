import { type FieldId } from './field';
import { type MetricQuery } from './metricQuery';

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

    if (postPivot !== null) {
        if (!joinKey.some((part) => part.name === postPivot.keyName)) {
            errors.push({
                kind: MergeQueryErrorKind.UNKNOWN_POST_PIVOT_KEY,
                sourceId: null,
                fieldIds: [],
                message: `Cannot pivot the merged result by "${postPivot.keyName}" because it is not part of the join key.`,
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
    errors: MergeQueryError[];
};
