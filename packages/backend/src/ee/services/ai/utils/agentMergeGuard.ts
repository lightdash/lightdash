import {
    AI_AGENT_MERGE_REFUSAL,
    normalizeSavedMergeDefinition,
    ParameterError,
    parseSavedMergeQuery,
    type ChartAsCode,
    type DocumentChartContent,
    type DocumentCharts,
} from '@lightdash/common';
import isEqual from 'lodash/isEqual';
import {
    normalizeFilterIds,
    stripFilterIds,
} from '../../../../services/CoderService/filterIds';

type MergeInputs = { metricQuery: unknown; merge: unknown };

// What running a merged chart reads: the chart's own query, which feeds the
// merge's primary source, and the merge parsed as persistence parses it.
const chartMergeInputs = (
    chart: ChartAsCode | undefined,
): MergeInputs | null => {
    if (!chart?.merge) return null;
    const { metricQuery } = chart;
    return {
        metricQuery: {
            ...metricQuery,
            filters: stripFilterIds(metricQuery.filters),
        },
        merge:
            normalizeSavedMergeDefinition(chart.merge, {
                ...metricQuery,
                filters: normalizeFilterIds(metricQuery.filters),
            }) ?? chart.merge,
    };
};

const documentMergeInputs = (
    documentChart: DocumentChartContent | undefined,
): MergeInputs | null => {
    if (documentChart?.source !== 'merge') return null;
    const { metricQuery, merge } = documentChart.chart;
    return {
        metricQuery: {
            ...metricQuery,
            filters: stripFilterIds(metricQuery.filters),
        },
        merge: parseSavedMergeQuery(merge) ?? merge,
    };
};

// Where a merge is stored or requested, the agent may change presentation only.
const assertSameMergeInputs = (
    next: MergeInputs | null,
    current: MergeInputs | null,
) => {
    if ((next || current) && !isEqual(next, current)) {
        throw new ParameterError(AI_AGENT_MERGE_REFUSAL);
    }
};

export const assertAgentKeepsChartMerge = (
    next: ChartAsCode,
    current: ChartAsCode | undefined,
) => assertSameMergeInputs(chartMergeInputs(next), chartMergeInputs(current));

export const assertAgentKeepsDocumentMerges = (
    next: DocumentCharts,
    current: DocumentCharts,
) =>
    Object.entries(next).forEach(([chartId, documentChart]) =>
        assertSameMergeInputs(
            documentMergeInputs(documentChart),
            documentMergeInputs(
                Object.hasOwn(current, chartId) ? current[chartId] : undefined,
            ),
        ),
    );
