import { type ItemsMap } from '../../../../types/field';
import { type MetricQuery } from '../../../../types/metricQuery';
import assertUnreachable from '../../../../utils/assertUnreachable';
import { AiResultType, type AiArtifactChartConfig } from '../../types';
import { parseVizConfig } from '../../utils';
import { getVerticalBarChartConfig } from './generateBarVizConfigTool/getVerticalBarChartConfig';
import { getTableChartConfig } from './generateTableVizConfigTool/getTableChartConfig';
import { getTimeSeriesChartConfig } from './generateTimeSeriesVizConfigTool/getTimeSeriesChartConfig';
import { getRunQueryChartConfig } from './runQueryTool/getRunQueryChartConfig';

export const getWebAiChartConfig = ({
    vizConfig,
    metricQuery,
    maxQueryLimit,
    fieldsMap,
    overrideChartType,
}: {
    vizConfig: AiArtifactChartConfig;
    metricQuery: MetricQuery;
    maxQueryLimit?: number;
    fieldsMap: ItemsMap;
    overrideChartType?:
        | 'table'
        | 'bar'
        | 'horizontal'
        | 'line'
        | 'scatter'
        | 'pie'
        | 'funnel';
}) => {
    const parsedConfig = parseVizConfig(vizConfig, maxQueryLimit);
    if (!parsedConfig) {
        throw new Error('Invalid viz config');
    }

    switch (parsedConfig.type) {
        case AiResultType.VERTICAL_BAR_RESULT:
            return {
                ...parsedConfig,
                echartsConfig: getVerticalBarChartConfig(
                    parsedConfig.vizTool.vizConfig,
                    metricQuery,
                    {
                        title: parsedConfig.vizTool.title,
                        description: parsedConfig.vizTool.description,
                    },
                    fieldsMap,
                ),
            };
        case AiResultType.TIME_SERIES_RESULT:
            return {
                ...parsedConfig,
                echartsConfig: getTimeSeriesChartConfig(
                    parsedConfig.vizTool.vizConfig,
                    metricQuery,
                    {
                        title: parsedConfig.vizTool.title,
                        description: parsedConfig.vizTool.description,
                    },
                    fieldsMap,
                ),
            };
        case AiResultType.TABLE_RESULT:
            return {
                ...parsedConfig,
                echartsConfig: getTableChartConfig(),
            };
        case AiResultType.QUERY_RESULT:
            // Chart-as-code already carries a runtime ChartConfig — render it as-is.
            if (parsedConfig.chartAsCode) {
                return {
                    type: parsedConfig.type,
                    vizTool: null,
                    chartAsCode: parsedConfig.chartAsCode,
                    metricQuery: parsedConfig.metricQuery,
                    echartsConfig: parsedConfig.chartAsCode.chartConfig,
                } as const;
            }
            return {
                type: parsedConfig.type,
                vizTool: parsedConfig.vizTool,
                chartAsCode: null,
                metricQuery: parsedConfig.metricQuery,
                echartsConfig: getRunQueryChartConfig({
                    queryTool: parsedConfig.vizTool,
                    metricQuery,
                    fieldsMap,
                    overrideChartType,
                }),
            };
        default:
            return assertUnreachable(parsedConfig, 'Invalid chart type');
    }
};
