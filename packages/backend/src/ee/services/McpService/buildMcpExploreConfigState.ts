import {
    getRunQueryChartConfig,
    isCustomChartTypeSlugChartConfig,
    type CreateSavedChartVersion,
    type ItemsMap,
    type MetricQuery,
    type ToolRunQueryArgsTransformed,
} from '@lightdash/common';

type McpExploreConfigState = Pick<
    CreateSavedChartVersion,
    'tableName' | 'metricQuery' | 'tableConfig' | 'chartConfig' | 'pivotConfig'
>;

export const buildMcpExploreConfigState = ({
    queryTool,
    metricQuery,
    fieldsMap,
    columnOrder,
}: {
    queryTool: ToolRunQueryArgsTransformed;
    metricQuery: MetricQuery;
    fieldsMap: ItemsMap;
    columnOrder: string[];
}): McpExploreConfigState => {
    const { chartConfig } = queryTool;
    const groupBy = isCustomChartTypeSlugChartConfig(chartConfig)
        ? null
        : (chartConfig?.groupBy ?? null);
    return {
        tableName: queryTool.queryConfig.exploreName,
        metricQuery,
        tableConfig: {
            columnOrder,
        },
        chartConfig: getRunQueryChartConfig({
            queryTool,
            metricQuery,
            fieldsMap,
        }),
        pivotConfig: groupBy?.length ? { columns: groupBy } : undefined,
    };
};
