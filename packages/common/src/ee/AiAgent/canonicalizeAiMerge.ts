import {
    DEFAULT_ADDITIONAL_SOURCE_ID,
    JOIN_KEY,
    PRIMARY_SOURCE_ID,
    type MergeUrlState,
} from '../../types/mergeEditorState';
import {
    isMergeMetricSource,
    MERGE_TABLE_NAME,
    type MergeQuery,
    type MergeQueryMetricSource,
} from '../../types/mergeQuery';
import { getItemId } from '../../utils/item';

export type CanonicalAiMerge = {
    mergeQuery: MergeQuery & {
        /** Primary first; canonicalization refuses anything but two. */
        sources: [MergeQueryMetricSource, MergeQueryMetricSource];
    };
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
            sources: [
                { id: PRIMARY_SOURCE_ID, metricQuery: primary.metricQuery },
                {
                    id: DEFAULT_ADDITIONAL_SOURCE_ID,
                    metricQuery: additional.metricQuery,
                },
            ],
            joinKey,
            joinType: mergeQuery.joinType,
            tableCalculations: mergeQuery.tableCalculations,
            limit: mergeQuery.limit,
        },
        fieldIdByAiFieldId,
    };
};

/**
 * The merge editor state a canonical AI merge restores from — one authority
 * for the merge URL payload the web and Slack links carry.
 */
export const mergeUrlStateFromCanonicalAiMerge = (
    canonical: CanonicalAiMerge,
): MergeUrlState => {
    const [primary, additional] = canonical.mergeQuery.sources;
    return {
        focus: { kind: 'source', sourceId: primary.id },
        additionalSources: [
            {
                id: additional.id,
                exploreName: additional.metricQuery.exploreName,
                dimensions: additional.metricQuery.dimensions,
                metrics: additional.metricQuery.metrics,
                filters: additional.metricQuery.filters,
                additionalMetrics: additional.metricQuery.additionalMetrics,
                customDimensions: additional.metricQuery.customDimensions,
            },
        ],
        joinParts: canonical.mergeQuery.joinKey.map((part) => ({
            fieldIdBySourceId: part.fieldIdBySourceId,
        })),
        joinType: canonical.mergeQuery.joinType,
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
