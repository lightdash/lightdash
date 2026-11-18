import {
    ChartType,
    getDataAppVizChartConfigErrors,
    type ChartAsCode,
    type DataAppVizFieldMapping,
    type DataAppVizOptionValues,
    type DataAppVizSchema,
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
        // Chart description for the library rendering's own query.
        description: string;
    } | null;
};

// A chart type installed in the project, with its latest renderable schema.
export type UsableLibraryChartType = {
    appSlug: string;
    vizSchema: DataAppVizSchema;
};

export type RejectedLibraryChart = {
    chartSlug: string;
    typeSlug: string;
    errors: string[];
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

// Swaps a chart to its library type only when the binding is valid against the installed schema.
export const withLibraryCharts = (
    charts: ChartAsCode[],
    bindings: ReadonlyMap<string, LibraryChartBinding>,
    usableTypes: ReadonlyMap<string, UsableLibraryChartType>, // keyed by registry slug
): { charts: ChartAsCode[]; rejected: RejectedLibraryChart[] } => {
    const rejected: RejectedLibraryChart[] = [];
    const swapped = charts.map((chart): ChartAsCode => {
        const binding = bindings.get(chart.slug);
        const type = binding && usableTypes.get(binding.slug);
        if (!binding || !type) return chart;
        const { query } = binding;
        const errors = getDataAppVizChartConfigErrors(
            {
                fieldMapping: binding.fieldMapping,
                optionValues: binding.optionValues,
            },
            type.vizSchema,
            query
                ? {
                      dimensions: query.dimensions,
                      metrics: query.metrics,
                      tableCalculations: [],
                  }
                : {
                      dimensions: chart.metricQuery.dimensions,
                      metrics: chart.metricQuery.metrics,
                      tableCalculations: (
                          chart.metricQuery.tableCalculations ?? []
                      ).map(({ name }) => name),
                  },
        );
        if (errors.length > 0) {
            rejected.push({
                chartSlug: chart.slug,
                typeSlug: binding.slug,
                errors,
            });
            return chart;
        }
        return {
            ...chart,
            ...(query && {
                description: query.description,
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
                    dataAppVizSlug: type.appSlug,
                    fieldMapping: binding.fieldMapping,
                    optionValues: binding.optionValues,
                },
            },
        };
    });
    return { charts: swapped, rejected };
};
