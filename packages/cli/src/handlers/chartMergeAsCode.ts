import {
    normalizeSavedChartMerge,
    parseSavedMergeDefinition,
    upgradeSavedMergeQuery,
    type ChartAsCode,
} from '@lightdash/common';

/** Named YAML is a file format; keep the wire contract readable by older servers and CLIs. */
export const chartMergeForDownload = (chart: ChartAsCode): ChartAsCode => {
    if (!chart.merge || !('sources' in chart.merge)) return chart;
    const named = upgradeSavedMergeQuery(chart.merge, {
        ...chart.metricQuery,
        // Chart filters stay on the chart, outside the merge conversion.
        filters: {},
    });
    // A v2 merge can preserve a different primary source. Keep it losslessly in v2.
    return named && parseSavedMergeDefinition(named)
        ? { ...chart, merge: named }
        : chart;
};

export const chartMergeForUpload = (chart: ChartAsCode): ChartAsCode => {
    if (!chart.merge || 'sources' in chart.merge) return chart;
    const normalized = normalizeSavedChartMerge(
        { ...chart.metricQuery, filters: {} },
        chart.merge,
    );
    return {
        ...chart,
        merge: normalized.merge,
        metricQuery: {
            ...chart.metricQuery,
            sorts: normalized.metricQuery.sorts,
            limit: normalized.metricQuery.limit,
        },
    };
};
