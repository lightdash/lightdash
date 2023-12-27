import { assertUnreachable, ChartConfig, ChartType } from '@lightdash/common';
import { EMPTY_CARTESIAN_CHART_CONFIG } from '../../../hooks/cartesianChartConfig/useCartesianChartConfig';
import { ConfigCacheMap } from '../types';

export const getValidChartConfig = (
    chartType: ChartType,
    chartConfig: ChartConfig | undefined,
    cachedConfigs?: Partial<ConfigCacheMap>,
): ChartConfig => {
    switch (chartType) {
        case ChartType.CARTESIAN: {
            const cachedConfig = cachedConfigs?.[chartType];

            return {
                type: chartType,
                config:
                    chartConfig && chartConfig.type === ChartType.CARTESIAN
                        ? chartConfig.config
                        : cachedConfig
                        ? cachedConfig
                        : EMPTY_CARTESIAN_CHART_CONFIG,
            };
        }
        case ChartType.BIG_NUMBER: {
            const cachedConfig = cachedConfigs?.[chartType];

            return {
                type: chartType,
                config:
                    chartConfig && chartConfig.type === ChartType.BIG_NUMBER
                        ? chartConfig.config
                        : cachedConfig
                        ? cachedConfig
                        : {},
            };
        }
        case ChartType.TABLE: {
            const cachedConfig = cachedConfigs?.[chartType];

            return {
                type: chartType,
                config:
                    chartConfig && chartConfig.type === ChartType.TABLE
                        ? chartConfig.config
                        : cachedConfig
                        ? cachedConfig
                        : {},
            };
        }
        case ChartType.PIE: {
            const cachedConfig = cachedConfigs?.[chartType];

            return {
                type: chartType,
                config:
                    chartConfig && chartConfig.type === ChartType.PIE
                        ? chartConfig.config
                        : cachedConfig
                        ? cachedConfig
                        : {},
            };
        }
        case ChartType.CUSTOM: {
            const cachedConfig = cachedConfigs?.[chartType];

            return {
                type: chartType,
                config:
                    chartConfig && chartConfig.type === ChartType.CUSTOM
                        ? chartConfig.config
                        : cachedConfig
                        ? cachedConfig
                        : {},
            };
        }
        default:
            return assertUnreachable(
                chartType,
                `Invalid chart type ${chartType}`,
            );
    }
};
