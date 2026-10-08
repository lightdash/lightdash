import {
    getDocumentChartBlocks,
    type DocumentChartContent,
    type DocumentContent,
    type DocumentExploreChartContent,
    type DocumentSqlChart,
} from '@lightdash/common';
import isEqual from 'lodash/isEqual';

export type DocumentLineChange = {
    type: 'unchanged' | 'added' | 'removed';
    text: string;
};

export type DocumentChartChange = {
    kind: 'added' | 'removed' | 'changed' | 'unchanged';
    name: string;
    /** 1-based position among the charts of each version; null when absent. */
    beforePosition: number | null;
    afterPosition: number | null;
    moved: boolean;
    /** Readable names of the parts of the chart definition that changed. */
    changedParts: string[];
};

export type DocumentVersionDiff = {
    text: DocumentLineChange[];
    charts: DocumentChartChange[];
    hasChanges: boolean;
};

/** `chart` is null for a chart saved by a newer release; `definition` is what was stored. */
type PlacedChart = {
    id: string;
    name: string;
    chart: DocumentChartContent | null;
    definition: unknown;
    position: number;
};

const UNSUPPORTED_CHART_NAME = 'Chart from a newer version';

const getText = (content: DocumentContent): string[] =>
    getDocumentChartBlocks(content)
        .flatMap((block) => {
            if (block.type === 'markdown') return [block.markdown];
            if (block.type === 'unsupportedTag') return [block.line];
            return [];
        })
        .join('\n\n')
        .split('\n');

const getCharts = (content: DocumentContent): PlacedChart[] =>
    getDocumentChartBlocks(content)
        .flatMap((block): Omit<PlacedChart, 'position'>[] => {
            if (block.type === 'chart') {
                return [
                    {
                        id: block.id,
                        name: block.chart.chart.name,
                        chart: block.chart,
                        definition: block.chart,
                    },
                ];
            }
            if (block.type === 'unsupportedChart') {
                return [
                    {
                        id: block.id,
                        name: UNSUPPORTED_CHART_NAME,
                        chart: null,
                        definition: block.raw,
                    },
                ];
            }
            return [];
        })
        .map((chart, index) => ({ ...chart, position: index + 1 }));

/** Line diff from the longest common subsequence; ties prefer removals first. */
export const diffLines = (
    before: string[],
    after: string[],
): DocumentLineChange[] => {
    const lengths = Array.from({ length: before.length + 1 }, () =>
        new Array<number>(after.length + 1).fill(0),
    );
    for (let i = before.length - 1; i >= 0; i -= 1) {
        for (let j = after.length - 1; j >= 0; j -= 1) {
            lengths[i][j] =
                before[i] === after[j]
                    ? lengths[i + 1][j + 1] + 1
                    : Math.max(lengths[i + 1][j], lengths[i][j + 1]);
        }
    }
    const changes: DocumentLineChange[] = [];
    let i = 0;
    let j = 0;
    while (i < before.length || j < after.length) {
        if (i < before.length && j < after.length && before[i] === after[j]) {
            changes.push({ type: 'unchanged', text: before[i] });
            i += 1;
            j += 1;
        } else if (
            i < before.length &&
            (j >= after.length || lengths[i + 1][j] >= lengths[i][j + 1])
        ) {
            changes.push({ type: 'removed', text: before[i] });
            i += 1;
        } else {
            changes.push({ type: 'added', text: after[j] });
            j += 1;
        }
    }
    return changes;
};

const CONTEXT_LINES = 2;
const MIN_COLLAPSED_LINES = 3;

export type DisplayedLine =
    | ({ kind: 'line' } & DocumentLineChange)
    | { kind: 'skipped'; count: number };

/** Changed lines with a little unchanged context; long unchanged runs collapse. */
export const withContext = (lines: DocumentLineChange[]): DisplayedLine[] => {
    const nearChange = lines.map((_, index) =>
        lines
            .slice(
                Math.max(0, index - CONTEXT_LINES),
                index + CONTEXT_LINES + 1,
            )
            .some((line) => line.type !== 'unchanged'),
    );
    const shown: DisplayedLine[] = [];
    let hidden: DocumentLineChange[] = [];
    const flushHidden = () => {
        // Folding fewer lines than this would take more room than showing them
        if (hidden.length >= MIN_COLLAPSED_LINES) {
            shown.push({ kind: 'skipped', count: hidden.length });
        } else {
            shown.push(
                ...hidden.map((line) => ({ kind: 'line' as const, ...line })),
            );
        }
        hidden = [];
    };
    lines.forEach((line, index) => {
        if (nearChange[index]) {
            flushHidden();
            shown.push({ kind: 'line', ...line });
        } else {
            hidden.push(line);
        }
    });
    flushHidden();
    return shown;
};

const CHART_PARTS: Array<
    [string, (content: DocumentExploreChartContent) => unknown]
> = [
    ['Title', ({ chart }) => chart.name],
    ['Description', ({ chart }) => chart.description ?? ''],
    ['Explore', ({ chart }) => chart.tableName],
    ['Chart type', ({ chart }) => chart.chartConfig.type],
    ['Dimensions', ({ chart }) => chart.metricQuery.dimensions],
    ['Metrics', ({ chart }) => chart.metricQuery.metrics],
    ['Filters', ({ chart }) => chart.metricQuery.filters],
    ['Sorts', ({ chart }) => chart.metricQuery.sorts],
    ['Row limit', ({ chart }) => chart.metricQuery.limit],
    ['Table calculations', ({ chart }) => chart.metricQuery.tableCalculations],
    [
        'Custom fields',
        ({ chart }) => [
            chart.metricQuery.additionalMetrics ?? [],
            chart.metricQuery.customDimensions ?? [],
        ],
    ],
    ['Visualization', ({ chart }) => chart.chartConfig],
    ['Table settings', ({ chart }) => [chart.tableConfig, chart.pivotConfig]],
    ['Parameters', ({ chart }) => chart.parameters ?? {}],
    [
        'Merge',
        (content) => (content.source === 'merge' ? content.chart.merge : null),
    ],
];

const getExploreChangedParts = (
    before: DocumentExploreChartContent,
    after: DocumentExploreChartContent,
): string[] => {
    const parts = CHART_PARTS.filter(
        ([, read]) => !isEqual(read(before), read(after)),
    ).map(([label]) => label);
    // The chart type already says it when only the type changed
    const visualizationOnlyFollowsType =
        parts.includes('Chart type') &&
        parts.includes('Visualization') &&
        before.chart.chartConfig.type !== after.chart.chartConfig.type;
    const named = visualizationOnlyFollowsType
        ? parts.filter((part) => part !== 'Visualization')
        : parts;
    // Changes to the query not covered above, e.g. timezone or overrides
    return named.length > 0 || isEqual(before, after)
        ? named
        : ['Query settings'];
};

const SQL_CHART_PARTS: Array<[string, (chart: DocumentSqlChart) => unknown]> = [
    ['Title', (chart) => chart.name],
    ['Description', (chart) => chart.description ?? ''],
    ['SQL', (chart) => chart.sql],
    ['Chart type', (chart) => chart.chartKind],
    ['Row limit', (chart) => chart.limit],
    ['Connection', (chart) => chart.warehouseConnectionUuid ?? null],
    ['Visualization', (chart) => chart.config],
];

const getKnownChangedParts = (
    before: DocumentChartContent,
    after: DocumentChartContent,
): string[] => {
    if (before.source === 'sql' || after.source === 'sql') {
        if (before.source !== 'sql' || after.source !== 'sql') {
            return ['Query source'];
        }
        return SQL_CHART_PARTS.filter(
            ([, read]) => !isEqual(read(before.chart), read(after.chart)),
        ).map(([label]) => label);
    }
    return getExploreChangedParts(before, after);
};

const getChangedParts = (before: PlacedChart, after: PlacedChart): string[] => {
    if (before.chart === null || after.chart === null) {
        return isEqual(before.definition, after.definition)
            ? []
            : ['Chart definition'];
    }
    return getKnownChangedParts(before.chart, after.chart);
};

/** Indexes of pairs that keep their relative order (longest increasing run). */
const getStablePairs = (afterPositions: number[]): Set<number> => {
    const tails: number[] = [];
    const previous = new Array<number>(afterPositions.length).fill(-1);
    afterPositions.forEach((position, index) => {
        let low = 0;
        let high = tails.length;
        while (low < high) {
            const middle = Math.floor((low + high) / 2);
            if (afterPositions[tails[middle]] < position) low = middle + 1;
            else high = middle;
        }
        if (low > 0) previous[index] = tails[low - 1];
        tails[low] = index;
    });
    const stable = new Set<number>();
    for (
        let index = tails.length > 0 ? tails[tails.length - 1] : -1;
        index !== -1;
        index = previous[index]
    ) {
        stable.add(index);
    }
    return stable;
};

/**
 * What changed from one Document version to another. Charts are paired by
 * identical definition first, then by id, so ids that were assigned by
 * position in older versions still pair up charts that kept their content.
 */
export const diffDocumentVersions = (
    before: DocumentContent,
    after: DocumentContent,
): DocumentVersionDiff => {
    const text = diffLines(getText(before), getText(after));
    const beforeCharts = getCharts(before);
    const afterCharts = getCharts(after);
    const pairs = new Map<PlacedChart, PlacedChart>();
    const pairedAfter = new Set<PlacedChart>();
    const pairUp = (
        matches: (left: PlacedChart, right: PlacedChart) => boolean,
    ) =>
        beforeCharts
            .filter((chart) => !pairs.has(chart))
            .forEach((chart) => {
                const match = afterCharts.find(
                    (candidate) =>
                        !pairedAfter.has(candidate) &&
                        matches(chart, candidate),
                );
                if (match) {
                    pairs.set(chart, match);
                    pairedAfter.add(match);
                }
            });
    pairUp((left, right) => isEqual(left.definition, right.definition));
    pairUp((left, right) => left.id === right.id);

    const pairList = beforeCharts.flatMap((chart) => {
        const match = pairs.get(chart);
        return match ? [[chart, match] as const] : [];
    });
    const stable = getStablePairs(pairList.map(([, match]) => match.position));
    const paired: DocumentChartChange[] = pairList.map(
        ([chart, match], index) => {
            const changedParts = getChangedParts(chart, match);
            return {
                kind: changedParts.length > 0 ? 'changed' : 'unchanged',
                name: match.name,
                beforePosition: chart.position,
                afterPosition: match.position,
                moved: !stable.has(index),
                changedParts,
            };
        },
    );
    const added: DocumentChartChange[] = afterCharts
        .filter((chart) => !pairedAfter.has(chart))
        .map((chart) => ({
            kind: 'added',
            name: chart.name,
            beforePosition: null,
            afterPosition: chart.position,
            moved: false,
            changedParts: [],
        }));
    const removed: DocumentChartChange[] = beforeCharts
        .filter((chart) => !pairs.has(chart))
        .map((chart) => ({
            kind: 'removed',
            name: chart.name,
            beforePosition: chart.position,
            afterPosition: null,
            moved: false,
            changedParts: [],
        }));
    // Current order first, then what was removed in its old order
    const charts = [
        ...[...paired, ...added].sort(
            (left, right) =>
                (left.afterPosition ?? 0) - (right.afterPosition ?? 0),
        ),
        ...removed,
    ];
    return {
        text,
        charts,
        hasChanges:
            text.some((line) => line.type !== 'unchanged') ||
            charts.some((chart) => chart.kind !== 'unchanged' || chart.moved),
    };
};
