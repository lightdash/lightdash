import {
    ChartType,
    type ChartAsCode,
    type DataAppVizFieldMapping,
    type DataAppVizOptionValues,
} from '@lightdash/common';

export type LibraryChartBinding = {
    slug: string; // registry slug
    minVersion: string; // registry semver the mapping was written against
    fieldMapping: DataAppVizFieldMapping;
    optionValues: DataAppVizOptionValues;
    // Query the library chart runs in place of the fallback's; null when it shares the fallback query.
    query: {
        dimensions: string[];
        metrics: string[];
        sorts: ChartAsCode['metricQuery']['sorts'];
        limit: number;
    } | null;
};

// Field names each supported type accepts, and which are required.
export const libraryChartFields: Record<
    string,
    { fields: readonly string[]; required: readonly string[] }
> = {
    heatmap: { fields: ['x', 'y', 'value'], required: ['x', 'y', 'value'] },
    'vega-trellis': {
        fields: ['x', 'value', 'panel'],
        required: ['x', 'value'],
    },
    'sortable-pivot-table': {
        fields: ['rowDimension', 'rowDimension2', 'series', 'metric'],
        required: ['rowDimension', 'metric'],
    },
    'customizable-cartesian-chart': {
        fields: ['x', 'm1', 'm2', 'm3', 'm4', 'splitBy'],
        required: ['x', 'm1'],
    },
    'big-number-with-sparkline-trend': {
        fields: [
            'value',
            'comparisonValue',
            'time',
            'sparklineMetric',
            'comparisonValue2',
            'comparisonValue3',
            'secondary',
            'target',
        ],
        required: ['value'],
    },
};

// Returns charts unchanged unless their slug has a binding whose type is usable.
export const withLibraryCharts = (
    charts: ChartAsCode[],
    bindings: ReadonlyMap<string, LibraryChartBinding>,
    usableTypes: ReadonlyMap<string, string>, // registry slug -> project app slug
): ChartAsCode[] =>
    charts.map((chart) => {
        const binding = bindings.get(chart.slug);
        const appSlug = binding && usableTypes.get(binding.slug);
        if (!binding || !appSlug) return chart;
        const { query } = binding;
        return {
            ...chart,
            ...(query && {
                metricQuery: {
                    ...chart.metricQuery,
                    dimensions: query.dimensions,
                    metrics: query.metrics,
                    sorts: query.sorts,
                    limit: query.limit,
                    // Calculations may reference fields the override drops.
                    tableCalculations: [],
                },
                tableConfig: {
                    columnOrder: [...query.dimensions, ...query.metrics],
                },
            }),
            chartConfig: {
                type: ChartType.DATA_APP_VIZ,
                config: {
                    dataAppVizSlug: appSlug,
                    fieldMapping: binding.fieldMapping,
                    optionValues: binding.optionValues,
                },
            },
        };
    });
