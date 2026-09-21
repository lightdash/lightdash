import {
    parseMergeDefinitionReference,
    parseSavedMergeDefinition,
    parseSavedMergeQuery,
} from '@lightdash/common';
import {
    DEFAULT_ADDITIONAL_SOURCE_ID,
    MAX_MERGE_SOURCES,
    PRIMARY_SOURCE_ID,
} from '../constants';
import { type MergeUrlState } from './mergeUrlState';

/** Restores stable API responses and named definitions held by an already-open editor. */
export const restoreSavedMerge = (value: unknown): MergeUrlState | null => {
    const saved = parseSavedMergeQuery(value);
    if (saved) {
        const chart = saved.sources.find((source) => source.kind === 'chart');
        const additional = saved.sources.filter(
            (source) => source.kind === 'query',
        );
        if (
            !chart ||
            saved.primarySourceId !== chart.id ||
            saved.sources.length > MAX_MERGE_SOURCES
        )
            return null;
        const [query] = additional;
        const handle = DEFAULT_ADDITIONAL_SOURCE_ID;
        return {
            focus: { kind: 'source', sourceId: PRIMARY_SOURCE_ID },
            primarySourceName: chart.id,
            additionalSources: [
                {
                    id: handle,
                    name: query.id,
                    exploreName: query.metricQuery.exploreName,
                    dimensions: query.metricQuery.dimensions,
                    metrics: query.metricQuery.metrics,
                    filters: query.metricQuery.filters ?? {},
                    additionalMetrics: query.metricQuery.additionalMetrics,
                    customDimensions: query.metricQuery.customDimensions,
                },
            ],
            joinParts: saved.joinKey.map((part) => ({
                name: part.name,
                fieldIdBySourceId: {
                    [PRIMARY_SOURCE_ID]: part.fieldIdBySourceId[chart.id],
                    [handle]: part.fieldIdBySourceId[query.id],
                },
            })),
            joinType: saved.joinType,
            repeatValuesSourceIds: [
                ...(saved.repeatValuesSourceIds?.includes(chart.id)
                    ? [PRIMARY_SOURCE_ID]
                    : []),
                ...(saved.repeatValuesSourceIds?.includes(query.id)
                    ? [handle]
                    : []),
            ],
        };
    }
    const merge = parseSavedMergeDefinition(value);
    if (!merge) return null;
    const queries = Object.entries(merge.queries);
    // Persistence is N-shaped; the current editor's product limit stays
    // explicit here rather than leaking positional A/B state through callers.
    if (queries.length + 1 > MAX_MERGE_SOURCES) return null;
    const [[name, query]] = queries;
    const handle = DEFAULT_ADDITIONAL_SOURCE_ID;

    return {
        focus: { kind: 'source', sourceId: PRIMARY_SOURCE_ID },
        primarySourceName: merge.chartAs ?? null,
        additionalSources: [
            {
                id: handle,
                name,
                exploreName: query.explore,
                dimensions: query.dimensions,
                metrics: query.metrics,
                filters: query.filters ?? {},
                additionalMetrics: query.additionalMetrics,
                customDimensions: query.customDimensions,
            },
        ],
        joinParts: Object.entries(merge.keys).map(
            ([chartFieldId, references]) => {
                const keyName = merge.keyNames?.[chartFieldId];
                const reference = references.find(
                    (candidate) =>
                        parseMergeDefinitionReference(candidate).query === name,
                );
                return {
                    ...(keyName ? { name: keyName } : {}),
                    fieldIdBySourceId: {
                        [PRIMARY_SOURCE_ID]: chartFieldId,
                        [handle]: reference
                            ? parseMergeDefinitionReference(reference).fieldId
                            : null,
                    },
                };
            },
        ),
        joinType: merge.join,
        repeatValuesSourceIds: [
            ...(merge.chartRepeats ? [PRIMARY_SOURCE_ID] : []),
            ...(query.repeat ? [handle] : []),
        ],
    };
};
