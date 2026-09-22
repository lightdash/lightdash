import { type CanonicalAiMerge } from '@lightdash/common';
export {
    canonicalizeAiMerge,
    remapFieldIdsDeep,
    type CanonicalAiMerge,
} from '@lightdash/common';
import {
    DEFAULT_ADDITIONAL_SOURCE_ID,
    PRIMARY_SOURCE_ID,
} from '../../../../features/mergeQuery/constants';
import { type MergeUrlState } from '../../../../features/mergeQuery/context/mergeUrlState';

/**
 * The editor state that opens a canonical AI merge in the Explorer: the
 * editor addresses sources by its fixed handles, with the names they run
 * under riding along.
 */
export const toMergeUrlState = ({
    mergeQuery,
}: CanonicalAiMerge): MergeUrlState => {
    const [primary, additional] = mergeQuery.sources;
    const handleBySourceId: Record<string, string> = {
        [primary.id]: PRIMARY_SOURCE_ID,
        [additional.id]: DEFAULT_ADDITIONAL_SOURCE_ID,
    };
    return {
        focus: { kind: 'source', sourceId: PRIMARY_SOURCE_ID },
        primarySourceName:
            primary.id === primary.metricQuery.exploreName ? null : primary.id,
        additionalSources: [
            {
                id: DEFAULT_ADDITIONAL_SOURCE_ID,
                name: additional.id,
                exploreName: additional.metricQuery.exploreName,
                dimensions: additional.metricQuery.dimensions,
                metrics: additional.metricQuery.metrics,
                filters: additional.metricQuery.filters,
                additionalMetrics: additional.metricQuery.additionalMetrics,
                customDimensions: additional.metricQuery.customDimensions,
            },
        ],
        joinParts: mergeQuery.joinKey.map((part) => ({
            fieldIdBySourceId: Object.fromEntries(
                Object.entries(part.fieldIdBySourceId).map(
                    ([sourceId, fieldId]) => [
                        handleBySourceId[sourceId] ?? sourceId,
                        fieldId,
                    ],
                ),
            ),
        })),
        joinType: mergeQuery.joinType,
        repeatValuesSourceIds: mergeQuery.sources.flatMap((source) =>
            source.repeatValues === true
                ? [handleBySourceId[source.id] ?? source.id]
                : [],
        ),
        tableCalculations: mergeQuery.tableCalculations,
    };
};
