import { type SavedChart, type SemanticChartAsCode } from '@lightdash/common';

/** A saved chart as a Document chart: the runtime config the visualization reads. */
export const toSemanticChartAsCode = (
    chart: SavedChart,
    overrides: { name?: string; description?: string } = {},
): SemanticChartAsCode =>
    ({
        name: overrides.name ?? chart.name,
        description: overrides.description ?? chart.description,
        tableName: chart.tableName,
        metricQuery: chart.metricQuery,
        chartConfig: chart.chartConfig,
        tableConfig: chart.tableConfig,
        pivotConfig: chart.pivotConfig,
        parameters: chart.parameters,
    }) as SemanticChartAsCode;
