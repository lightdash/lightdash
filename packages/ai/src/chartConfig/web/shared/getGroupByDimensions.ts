import { AiResultType } from '../../../types';
import { type getWebAiChartConfig } from '../getWebAiChartConfig';

export const getGroupByDimensions = (
    args: ReturnType<typeof getWebAiChartConfig>,
) => {
    switch (args.type) {
        case AiResultType.QUERY_RESULT:
            return args.vizTool?.chartConfig?.groupBy ?? undefined;
        case AiResultType.VERTICAL_BAR_RESULT:
        case AiResultType.TIME_SERIES_RESULT:
            return args.vizTool?.vizConfig.breakdownByDimension
                ? [args.vizTool.vizConfig.breakdownByDimension]
                : undefined;
        default:
            return undefined;
    }
};
