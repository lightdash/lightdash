import { type ItemsMap } from '../../../../types/field';
import { type MetricQuery } from '../../../../types/metricQuery';
import { type PersistedRunQueryPayload } from '../../schemas';
import { parseVizConfig } from '../../utils';
import { getRunQueryChartConfig } from './runQueryTool/getRunQueryChartConfig';

export const getWebAiChartConfig = ({
    vizConfig,
    metricQuery,
    maxQueryLimit,
    fieldsMap,
    overrideChartType,
}: {
    vizConfig: PersistedRunQueryPayload;
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
};
