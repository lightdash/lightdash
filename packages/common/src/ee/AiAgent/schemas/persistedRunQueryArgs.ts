import {
    toolRunQueryExpressionResolvedArgsSchemaTransformed,
    type ToolRunQueryExpressionResolvedArgs,
} from './filterExpressions/resolvedArgs';
import {
    parsePersistedRunQueryArgs,
    type ToolRunQueryArgs,
    type ToolRunQueryArgsTransformed,
    type ToolRunQueryArgsV3,
} from './tools/toolRunQueryArgs';

/**
 * Opaque run-query data stored for replay. Existing formats use one shared
 * filter connector; filter-expression results can store one connector per
 * category. Always parse this payload before reading its filters.
 */
export type PersistedRunQueryPayload =
    | ToolRunQueryArgs
    | ToolRunQueryExpressionResolvedArgs;

export type PersistedMergeRunQueryPayload =
    | ToolRunQueryArgsV3
    | ToolRunQueryExpressionResolvedArgs;

/**
 * Parses every supported persisted run-query shape. Existing formats take
 * their unchanged parser path; only per-category filter payloads use the
 * filter-expression transform.
 */
export const parsePersistedRunQueryPayload = (
    raw: unknown,
): ToolRunQueryArgsTransformed | null => {
    const existing = parsePersistedRunQueryArgs(raw);
    if (existing !== null) return existing;

    const resolved =
        toolRunQueryExpressionResolvedArgsSchemaTransformed.safeParse(raw);
    return resolved.success ? resolved.data : null;
};
