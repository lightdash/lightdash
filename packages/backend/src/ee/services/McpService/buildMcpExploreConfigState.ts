import {
    ChartType,
    deriveDataAppVizPivotConfig,
    getRunQueryChartConfig,
    isCustomChartTypeSlugChartConfig,
    type CreateSavedChartVersion,
    type DataAppVizSchema,
    type ItemsMap,
    type MetricQuery,
    type ToolRunQueryArgsTransformed,
    type ToolRunQueryCustomChartTypeConfig,
} from '@lightdash/common';

type McpExploreConfigState = Pick<
    CreateSavedChartVersion,
    'tableName' | 'metricQuery' | 'tableConfig' | 'chartConfig' | 'pivotConfig'
>;

export type McpExploreCustomChart = {
    config: ToolRunQueryCustomChartTypeConfig;
    chartType: {
        dataAppVizUuid: string;
        dataAppVizVersion: number;
        fields: DataAppVizSchema['fields'];
    };
};

export const buildMcpExploreConfigState = ({
    queryTool,
    metricQuery,
    fieldsMap,
    columnOrder,
    customChart,
}: {
    queryTool: ToolRunQueryArgsTransformed;
    metricQuery: MetricQuery;
    fieldsMap: ItemsMap;
    columnOrder: string[];
    customChart: McpExploreCustomChart | null;
}): McpExploreConfigState => {
    const base = {
        tableName: queryTool.queryConfig.exploreName,
        metricQuery,
        tableConfig: {
            columnOrder,
        },
    };
    if (!customChart) {
        const { chartConfig } = queryTool;
        const groupBy = isCustomChartTypeSlugChartConfig(chartConfig)
            ? null
            : (chartConfig?.groupBy ?? null);
        return {
            ...base,
            chartConfig: getRunQueryChartConfig({
                queryTool,
                metricQuery,
                fieldsMap,
            }),
            pivotConfig: groupBy?.length ? { columns: groupBy } : undefined,
        };
    }
    const { config, chartType } = customChart;
    return {
        ...base,
        chartConfig: {
            type: ChartType.DATA_APP_VIZ,
            config: {
                dataAppVizUuid: chartType.dataAppVizUuid,
                dataAppVizVersion: chartType.dataAppVizVersion,
                fieldMapping: structuredClone(config.fieldMapping),
                optionValues: config.options ?? undefined,
            },
        },
        pivotConfig: deriveDataAppVizPivotConfig(
            chartType.fields,
            config.fieldMapping,
        ),
    };
};
