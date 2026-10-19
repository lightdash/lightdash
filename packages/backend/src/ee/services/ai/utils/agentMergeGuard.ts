import {
    AI_AGENT_MERGE_REFUSAL,
    normalizeSavedMergeDefinition,
    ParameterError,
    parseSavedMergeQuery,
    type ChartAsCode,
    type DocumentChartContent,
    type DocumentCharts,
    type SemanticChartAsCode,
} from '@lightdash/common';
import isEqual from 'lodash/isEqual';
import omit from 'lodash/omit';
import {
    normalizeFilterIds,
    stripFilterIds,
} from '../../../../services/CoderService/filterIds';

// The only fields an agent may change on a merged chart; anything else,
// including fields added later, counts as a change to what the merge runs.
const PRESENTATION_FIELDS = [
    'name',
    'description',
    'chartConfig',
    'tableConfig',
    'pivotConfig',
    'slug',
    'spaceSlug',
] as const;

type FormatOverrides = Record<string, object> | undefined;

// Overrides only carry formatOptions today; any other key stays compared.
const withoutFormatting = (overrides: FormatOverrides): FormatOverrides => {
    const kept = Object.entries(overrides ?? {}).flatMap(([fieldId, value]) => {
        const rest = omit(value, 'formatOptions');
        return Object.keys(rest).length > 0 ? [[fieldId, rest]] : [];
    });
    return kept.length > 0 ? Object.fromEntries(kept) : undefined;
};

const queryInputs = ({
    metricOverrides,
    dimensionOverrides,
    ...metricQuery
}: ChartAsCode['metricQuery']) => {
    const metrics = withoutFormatting(metricOverrides);
    const dimensions = withoutFormatting(dimensionOverrides);
    return {
        ...metricQuery,
        filters: stripFilterIds(metricQuery.filters),
        ...(metrics ? { metricOverrides: metrics } : {}),
        ...(dimensions ? { dimensionOverrides: dimensions } : {}),
    };
};

const chartInputs = (
    chart: ChartAsCode | SemanticChartAsCode,
    merge: unknown,
) => ({
    ...omit(chart, [...PRESENTATION_FIELDS, 'merge']),
    metricQuery: queryInputs(chart.metricQuery),
    merge,
});

const chartAsCodeInputs = (chart: ChartAsCode | undefined) =>
    chart &&
    chartInputs(
        chart,
        chart.merge
            ? (normalizeSavedMergeDefinition(chart.merge, {
                  ...chart.metricQuery,
                  filters: normalizeFilterIds(chart.metricQuery.filters),
              }) ?? chart.merge)
            : null,
    );

const documentChartInputs = (
    documentChart: DocumentChartContent | undefined,
) => {
    if (!documentChart || documentChart.source === 'sql') return documentChart;
    return {
        source: documentChart.source,
        chart: chartInputs(
            documentChart.chart,
            documentChart.source === 'merge'
                ? (parseSavedMergeQuery(documentChart.chart.merge) ??
                      documentChart.chart.merge)
                : null,
        ),
    };
};

const assertSameInputs = (
    hasMerge: boolean,
    next: unknown,
    current: unknown,
) => {
    if (hasMerge && !isEqual(next, current)) {
        throw new ParameterError(AI_AGENT_MERGE_REFUSAL);
    }
};

// Where a merge is stored or requested, the agent may change presentation only.
export const assertAgentKeepsChartMerge = (
    next: ChartAsCode,
    current: ChartAsCode | undefined,
) =>
    assertSameInputs(
        !!next.merge || !!current?.merge,
        chartAsCodeInputs(next),
        chartAsCodeInputs(current),
    );

export const assertAgentKeepsDocumentMerges = (
    next: DocumentCharts,
    current: DocumentCharts,
) =>
    Object.entries(next).forEach(([chartId, documentChart]) => {
        const stored = Object.hasOwn(current, chartId)
            ? current[chartId]
            : undefined;
        assertSameInputs(
            documentChart.source === 'merge' || stored?.source === 'merge',
            documentChartInputs(documentChart),
            documentChartInputs(stored),
        );
    });
