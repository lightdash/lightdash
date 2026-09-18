import { parsePipelineReference, parseSavedPipeline } from '@lightdash/common';
import {
    DEFAULT_ADDITIONAL_SOURCE_ID,
    MAX_MERGE_SOURCES,
    PRIMARY_SOURCE_ID,
} from '../constants';
import { type MergeUrlState } from './mergeUrlState';

/**
 * Turns a chart's stored pipeline back into editable state. The editor
 * addresses the chart's query and the other query by fixed handles; the
 * names they run under ride along so the saved chart's column ids hold.
 *
 * The runtime boundary accepts unknown because an already-open browser can
 * retain an older API response after the app updates. Unsupported shapes are
 * ignored rather than crashing the chart; they are never converted.
 */
export const restoreSavedMerge = (value: unknown): MergeUrlState | null => {
    const pipeline = parseSavedPipeline(value);
    if (!pipeline) return null;
    const queries = Object.entries(pipeline.queries);
    // Persistence is N-shaped; the current editor's product limit stays
    // explicit here rather than leaking positional A/B state through callers.
    if (queries.length + 1 > MAX_MERGE_SOURCES) return null;
    const [[name, query]] = queries;
    const handle = DEFAULT_ADDITIONAL_SOURCE_ID;

    return {
        focus: { kind: 'source', sourceId: PRIMARY_SOURCE_ID },
        primarySourceName: pipeline.chartAs ?? null,
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
        joinParts: Object.entries(pipeline.keys).map(
            ([chartFieldId, references]) => {
                const keyName = pipeline.keyNames?.[chartFieldId];
                const reference = references.find(
                    (candidate) =>
                        parsePipelineReference(candidate).query === name,
                );
                return {
                    ...(keyName ? { name: keyName } : {}),
                    fieldIdBySourceId: {
                        [PRIMARY_SOURCE_ID]: chartFieldId,
                        [handle]: reference
                            ? parsePipelineReference(reference).fieldId
                            : null,
                    },
                };
            },
        ),
        joinType: pipeline.join,
        repeatValuesSourceIds: [
            ...(pipeline.chartRepeats ? [PRIMARY_SOURCE_ID] : []),
            ...(query.repeat ? [handle] : []),
        ],
    };
};
