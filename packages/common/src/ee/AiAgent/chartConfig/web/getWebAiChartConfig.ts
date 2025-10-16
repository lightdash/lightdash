import { type ItemsMap } from '../../../../types/field';
import { type MetricQuery } from '../../../../types/metricQuery';
import assertUnreachable from '../../../../utils/assertUnreachable';
import {
    type ToolRunQueryArgs,
    type ToolTableVizArgs,
    type ToolTimeSeriesArgs,
    type ToolVerticalBarArgs,
} from '../../schemas';
import { AiResultType } from '../../types';
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
    vizConfig:
        | ToolTableVizArgs
        | ToolTimeSeriesArgs
        | ToolVerticalBarArgs
        | ToolRunQueryArgs;
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
            return {
                type: parsedConfig.type,
                vizTool: parsedConfig.vizTool,
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
