import {
    isMergeMetricSource,
    type MergeQuery,
    type SavedMergeQuery,
} from '../types/mergeQuery';

export const MERGE_PRIMARY_SOURCE_ID = 'a';
export const MERGE_ADDITIONAL_SOURCE_ID = 'b';
export const MERGE_JOIN_KEY = 'join_key';

export const toSavedMerge = (mergeQuery: MergeQuery): SavedMergeQuery => {
    if (
        !mergeQuery.sources.some(
            (source) => source.id === MERGE_PRIMARY_SOURCE_ID,
        )
    ) {
        throw new Error('A saved merge requires the chart query.');
    }
    const repeatValuesSourceIds = mergeQuery.sources.flatMap((source) =>
        source.repeatValues === true ? [source.id] : [],
    );
    return {
        primarySourceId: MERGE_PRIMARY_SOURCE_ID,
        sources: mergeQuery.sources.map((source) => {
            if (source.id === MERGE_PRIMARY_SOURCE_ID) {
                return {
                    id: source.id,
                    kind: 'chart' as const,
                };
            }
            // Result sources reference ephemeral query results, which a
            // saved chart cannot re-run — the editor never produces them.
            if (!isMergeMetricSource(source)) {
                throw new Error(
                    'A merge over existing query results cannot be saved to a chart.',
                );
            }
            return {
                id: source.id,
                kind: 'query' as const,
                metricQuery: source.metricQuery,
            };
        }),
        joinKey: mergeQuery.joinKey.map((part) => ({
            name: part.name,
            fieldIdBySourceId: part.fieldIdBySourceId,
        })),
        joinType: mergeQuery.joinType,
        tableCalculations: mergeQuery.tableCalculations,
        ...(repeatValuesSourceIds.length > 0 ? { repeatValuesSourceIds } : {}),
    };
};
