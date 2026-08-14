import {
    parseSavedMergeQuery,
    SAVED_MERGE_QUERY_SCHEMA_VERSION,
} from '@lightdash/common';
import { MAX_MERGE_SOURCES } from '../constants';

/**
 * Turns a chart's stored merge back into editable state.
 *
 * The runtime boundary accepts unknown because an already-open browser can
 * retain an older API response after the app updates. Unsupported shapes are
 * ignored rather than crashing the chart; they are never converted.
 */
export const restoreSavedMerge = (value: unknown) => {
    const saved = parseSavedMergeQuery(SAVED_MERGE_QUERY_SCHEMA_VERSION, value);
    if (!saved) return null;

    const additionalSources = saved.sources.filter(
        (source) => source.kind === 'query',
    );
    const chartSource = saved.sources.find((source) => source.kind === 'chart');
    // Persistence is N-shaped; the current editor's product limit stays
    // explicit here rather than leaking positional A/B state through callers.
    if (
        !chartSource ||
        saved.primarySourceId !== chartSource.id ||
        saved.sources.length > MAX_MERGE_SOURCES
    ) {
        return null;
    }

    return {
        focus: { kind: 'source' as const, sourceId: chartSource.id },
        additionalSources: additionalSources.map((source) => ({
            id: source.id,
            exploreName: source.metricQuery.exploreName,
            dimensions: source.metricQuery.dimensions,
            metrics: source.metricQuery.metrics,
            filters: source.metricQuery.filters ?? {},
            additionalMetrics: source.metricQuery.additionalMetrics,
            customDimensions: source.metricQuery.customDimensions,
        })),
        joinParts: saved.joinKey.map((part) => ({
            fieldIdBySourceId: Object.fromEntries(
                saved.sources.map((source) => [
                    source.id,
                    part.fieldIdBySourceId[source.id] ?? null,
                ]),
            ),
        })),
        joinType: saved.joinType,
    };
};
