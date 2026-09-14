import {
    getItemId,
    isMergeMetricSource,
    MERGE_TABLE_NAME,
    type MergeQuery,
    type MergeQueryMetricSource,
} from '@lightdash/common';
import {
    DEFAULT_ADDITIONAL_SOURCE_ID,
    JOIN_KEY,
    PRIMARY_SOURCE_ID,
} from '../../../../features/mergeQuery/constants';

export type CanonicalAiMerge = {
    mergeQuery: MergeQuery & { sources: MergeQueryMetricSource[] };
    /** Merged output column ids under the AI's names to their canonical ids. */
    fieldIdByAiFieldId: Record<string, string>;
};

// Merged output columns are fields of the merge/source "tables", so getItemId
// is the naming authority.
const mergedColumnId = (table: string, name: string) =>
    getItemId({ table, name });

/**
 * Renames the AI's free-form source and join-key names to the merge editor's
 * fixed conventions, so everything downstream treats an AI merge exactly like
 * one built by hand. Chart configs referencing the AI's merged column ids must
 * be remapped with `fieldIdByAiFieldId`.
 */
export const canonicalizeAiMerge = (
    mergeQuery: MergeQuery,
): CanonicalAiMerge | null => {
    if (mergeQuery.sources.length !== 2) return null;
    // AI merges are built from metric queries; a merge over existing results
    // has no canonical editor form to rename into.
    const metricSources = mergeQuery.sources.filter(isMergeMetricSource);
    if (metricSources.length !== 2) return null;
    const [primary, additional] = metricSources;
    const idBySourceId: Record<string, string> = {
        [primary.id]: PRIMARY_SOURCE_ID,
        [additional.id]: DEFAULT_ADDITIONAL_SOURCE_ID,
    };

    const fieldIdByAiFieldId: Record<string, string> = {};
    metricSources.forEach((source) => {
        const canonicalId = idBySourceId[source.id];
        [
            ...source.metricQuery.metrics,
            ...source.metricQuery.tableCalculations.map(
                (calculation) => calculation.name,
            ),
        ].forEach((column) => {
            fieldIdByAiFieldId[mergedColumnId(source.id, column)] =
                mergedColumnId(canonicalId, column);
        });
    });

    const joinKey = mergeQuery.joinKey.map((part, index) => {
        const name = `${JOIN_KEY}_${index}`;
        fieldIdByAiFieldId[mergedColumnId(MERGE_TABLE_NAME, part.name)] =
            mergedColumnId(MERGE_TABLE_NAME, name);
        return {
            name,
            fieldIdBySourceId: Object.fromEntries(
                Object.entries(part.fieldIdBySourceId).map(
                    ([sourceId, fieldId]) => [idBySourceId[sourceId], fieldId],
                ),
            ),
        };
    });

    return {
        mergeQuery: {
            sources: metricSources.map((source) => ({
                id: idBySourceId[source.id],
                metricQuery: source.metricQuery,
            })),
            joinKey,
            joinType: mergeQuery.joinType,
            tableCalculations: mergeQuery.tableCalculations,
            limit: mergeQuery.limit,
        },
        fieldIdByAiFieldId,
    };
};

/**
 * Replaces field-id references throughout a config value: string values and
 * object keys that exactly match a map entry are renamed, everything else is
 * left alone. Field ids only ever appear as whole strings, so exact matching
 * cannot corrupt labels or SQL.
 */
export const remapFieldIdsDeep = <T>(
    value: T,
    fieldIdMap: Record<string, string>,
): T => {
    if (typeof value === 'string') {
        return (fieldIdMap[value] ?? value) as T;
    }
    if (Array.isArray(value)) {
        return value.map((item) => remapFieldIdsDeep(item, fieldIdMap)) as T;
    }
    if (value !== null && typeof value === 'object') {
        return Object.fromEntries(
            Object.entries(value).map(([key, item]) => [
                fieldIdMap[key] ?? key,
                remapFieldIdsDeep(item, fieldIdMap),
            ]),
        ) as T;
    }
    return value;
};
