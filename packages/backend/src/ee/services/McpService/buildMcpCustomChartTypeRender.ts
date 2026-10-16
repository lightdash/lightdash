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

const escapeHtmlAttribute = (value: string): string =>
    value
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

// Browsers ignore these in a <meta> policy and log a warning for each.
const META_UNSUPPORTED_CSP_DIRECTIVES = new Set([
    'frame-ancestors',
    'report-uri',
    'sandbox',
]);

export const toMetaContentSecurityPolicy = (cspHeader: string): string =>
    cspHeader
        .split(';')
        .map((directive) => directive.trim())
        .filter(
            (directive) =>
                directive.length > 0 &&
                !META_UNSUPPORTED_CSP_DIRECTIVES.has(
                    directive.split(/\s+/)[0].toLowerCase(),
                ),
        )
        .join('; ');

/**
 * The chart view runs the bundle from a blob: URL, so the bundle's own policy
 * and relative asset URLs come from tags placed before anything else in <head>.
 * Null when the document has no <head> to anchor them.
 */
export const prepareMcpCustomChartTypeHtml = ({
    indexHtml,
    indexUrl,
    cspHeader,
}: {
    indexHtml: string;
    indexUrl: string;
    cspHeader: string;
}): string | null => {
    // Hosts may drop base-uri for the view, so asset tags carry absolute URLs too.
    const withAbsoluteAssets = indexHtml.replace(
        /\b(src|href)="(\.\/[^"]*)"/g,
        (_match, attribute: string, path: string) =>
            `${attribute}="${escapeHtmlAttribute(new URL(path, indexUrl).toString())}"`,
    );
    const head = /<head(\s[^>]*)?>/i.exec(withAbsoluteAssets);
    if (!head) return null;
    const insertAt = head.index + head[0].length;
    const tags = `<meta http-equiv="Content-Security-Policy" content="${escapeHtmlAttribute(
        toMetaContentSecurityPolicy(cspHeader),
    )}"><base href="${escapeHtmlAttribute(indexUrl)}">`;
    return (
        withAbsoluteAssets.slice(0, insertAt) +
        tags +
        withAbsoluteAssets.slice(insertAt)
    );
};
