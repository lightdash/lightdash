import {
    deriveDataAppVizFieldMetadata,
    formatRow,
    getDataAppVizChartConfigErrors,
    getEffectiveOptionValues,
    type DataAppVizContext,
    type DataAppVizSchema,
    type ItemsMap,
    type MetricQuery,
    type ToolRunQueryCustomChartTypeConfig,
} from '@lightdash/common';
import { type LightdashConfig } from '../../../config/parseConfig';

/** Where chart type bundles are served: the dedicated preview origin, else the site itself. */
export const getMcpPreviewOrigin = (
    lightdashConfig: Pick<LightdashConfig, 'appRuntime' | 'siteUrl'>,
): string =>
    lightdashConfig.appRuntime.previewOrigin ??
    new URL(lightdashConfig.siteUrl).origin;

export const getMcpCustomChartTypeConfigErrors = (
    chartConfig: ToolRunQueryCustomChartTypeConfig,
    schema: DataAppVizSchema,
    metricQuery: MetricQuery,
): string[] =>
    getDataAppVizChartConfigErrors(
        {
            fieldMapping: chartConfig.fieldMapping,
            optionValues: chartConfig.options ?? undefined,
        },
        schema,
        {
            dimensions: metricQuery.dimensions,
            metrics: metricQuery.metrics,
            tableCalculations: metricQuery.tableCalculations.map(
                (tableCalculation) => tableCalculation.name,
            ),
        },
    );

/** The render context the web app's explorer preview pushes, built from MCP query rows. */
export const buildMcpCustomChartTypeVizContext = ({
    chartConfig,
    schema,
    rows,
    fields,
    displayTimezone,
    colorPalette,
}: {
    chartConfig: ToolRunQueryCustomChartTypeConfig;
    schema: DataAppVizSchema;
    rows: Record<string, unknown>[];
    fields: ItemsMap;
    displayTimezone: string | null;
    colorPalette: string[];
}): DataAppVizContext => ({
    fieldMapping: chartConfig.fieldMapping,
    fields: deriveDataAppVizFieldMetadata(chartConfig.fieldMapping, fields),
    rows: rows.map((row) =>
        formatRow(row, fields, null, undefined, displayTimezone ?? undefined),
    ),
    options: getEffectiveOptionValues(
        schema.configOptions,
        chartConfig.options ?? {},
    ),
    colorPalette,
    seriesColors: {},
    valueColors: {},
    pivotDetails: null,
    underlyingData: { enabled: false },
    drillDown: { enabled: false },
    pointMenu: { enabled: false },
    subtotals: { enabled: false, dimensions: [] },
});

export const buildMcpCustomChartTypeIndexUrl = ({
    previewOrigin,
    dataAppVizUuid,
    version,
    token,
}: {
    previewOrigin: string;
    dataAppVizUuid: string;
    version: number;
    token: string;
}): string =>
    `${previewOrigin}/api/apps/${dataAppVizUuid}/versions/${version}/t/${token}/`;
