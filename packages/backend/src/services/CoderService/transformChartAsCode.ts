import {
    ChartAsCode,
    ContentAsCodeType,
    currentVersion,
    getContentAsCodePathFromLtreePath,
    NotFoundError,
    SavedChartDAO,
    type ContentVerificationInfo,
    type SpaceSummaryBase,
} from '@lightdash/common'; // pragma: allowlist secret

export const transformChartAsCode = (
    chart: SavedChartDAO,
    spaceSummary: Pick<SpaceSummaryBase, 'uuid' | 'name' | 'path'>[],
    dashboardSlugs: Record<string, string>,
    verificationMap: Map<string, ContentVerificationInfo>,
): ChartAsCode => {
    const contentSpace = spaceSummary.find(
        (space) => space.uuid === chart.spaceUuid,
    );
    if (!contentSpace) {
        throw new NotFoundError(`Space ${chart.spaceUuid} not found`);
    }

    const spaceSlug = getContentAsCodePathFromLtreePath(contentSpace.path);

    const additionalMetrics = chart.metricQuery.additionalMetrics?.map(
        ({ uuid: _uuid, ...metric }) => metric,
    );
    const dimensionOverrides =
        chart.metricQuery.dimensionOverrides &&
        Object.keys(chart.metricQuery.dimensionOverrides).length > 0
            ? chart.metricQuery.dimensionOverrides
            : undefined;

    return {
        name: chart.name,
        description: chart.description,
        tableName: chart.tableName,
        updatedAt: chart.updatedAt,
        metricQuery: {
            ...chart.metricQuery,
            additionalMetrics,
            dimensionOverrides,
        },
        chartConfig: chart.chartConfig,
        pivotConfig: chart.pivotConfig,
        dashboardSlug: chart.dashboardUuid
            ? dashboardSlugs[chart.dashboardUuid]
            : undefined,
        slug: chart.slug,
        tableConfig: chart.tableConfig,
        spaceSlug,
        version: currentVersion,
        contentType: ContentAsCodeType.CHART,
        downloadedAt: new Date(),
        parameters: chart.parameters,
        verified: verificationMap.has(chart.uuid) ? true : undefined,
        verification: verificationMap.get(chart.uuid) ?? null,
    };
};
