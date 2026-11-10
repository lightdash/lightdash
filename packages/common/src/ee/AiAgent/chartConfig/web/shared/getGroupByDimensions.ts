import { isCustomChartTypeSlugChartConfig } from '../../../../../composer/runQueryChart/chartConfigSchema';
import { type getWebAiChartConfig } from '../getWebAiChartConfig';

export const getGroupByDimensions = (
    args: ReturnType<typeof getWebAiChartConfig>,
) => {
    const chartConfig = args.vizTool?.chartConfig;
    if (isCustomChartTypeSlugChartConfig(chartConfig)) return undefined;
    return chartConfig?.groupBy ?? undefined;
};
