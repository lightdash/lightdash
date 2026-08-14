import {
    parseSavedMergeQuery,
    SAVED_MERGE_QUERY_SCHEMA_VERSION,
} from '@lightdash/common';
import { type MergeFocus } from './context';

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
    // The persisted shape supports more sources than today's editor. Keep the
    // chart usable if a newer producer writes a merge this UI cannot edit yet.
    if (
        !chartSource ||
        saved.primarySourceId !== chartSource.id ||
        additionalSources.length !== 1
    ) {
        return null;
    }
    const [secondSource] = additionalSources;

    return {
        focus: 'a' as MergeFocus,
        queryB: {
            exploreName: secondSource.metricQuery.exploreName,
            dimensions: secondSource.metricQuery.dimensions,
            metrics: secondSource.metricQuery.metrics,
            additionalMetrics: secondSource.metricQuery.additionalMetrics,
            customDimensions: secondSource.metricQuery.customDimensions,
        },
        joinParts: saved.joinKey.map((part) => ({
            fieldA: part.fieldIdBySourceId[chartSource.id],
            fieldB: part.fieldIdBySourceId[secondSource.id],
        })),
        joinType: saved.joinType,
        filtersB: secondSource.metricQuery.filters ?? {},
    };
};
