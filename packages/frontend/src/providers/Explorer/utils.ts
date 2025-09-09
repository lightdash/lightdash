import {
    ChartType,
    assertUnreachable,
    type ChartConfig,
    type Series,
} from '@lightdash/common';
import omit from 'lodash/omit';
import { EMPTY_CARTESIAN_CHART_CONFIG } from '../../hooks/cartesianChartConfig/useCartesianChartConfig';
import { type ConfigCacheMap } from './types';

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
        case ChartType.FUNNEL: {
            const cachedConfig = cachedConfigs?.[chartType];

            return {
                type: chartType,
                config:
                    chartConfig && chartConfig.type === ChartType.FUNNEL
                        ? chartConfig.config
                        : cachedConfig
                        ? cachedConfig
                        : {},
            };
        }
        case ChartType.TREEMAP: {
            const cachedConfig = cachedConfigs?.[chartType];

            return {
                type: chartType,
                config:
                    chartConfig && chartConfig.type === ChartType.TREEMAP
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

// Clean the config to remove runtime-only properties like isFilteredOut
export const cleanConfig = (config: ChartConfig): ChartConfig => {
    if (
        config.type === ChartType.CARTESIAN &&
        config.config?.eChartsConfig?.series
    ) {
        return {
            ...config,
            config: {
                ...config.config,
                eChartsConfig: {
                    ...config.config.eChartsConfig,
                    series: config.config.eChartsConfig.series.map(
                        (s: Series) => omit(s, ['isFilteredOut']),
                    ),
                },
            },
        };
    }
    return config;
};
