import { ChartType, type ChartConfig, type Series } from '@lightdash/common';
import omit from 'lodash/omit';
import { EMPTY_CARTESIAN_CHART_CONFIG } from '../../hooks/cartesianChartConfig/useCartesianChartConfig';
import { type ConfigCacheMap } from './types';

const DEFAULTS: Record<ChartType, () => unknown> = {
    [ChartType.CARTESIAN]: () => ({ ...EMPTY_CARTESIAN_CHART_CONFIG }), // factory to avoid shared refs
    [ChartType.BIG_NUMBER]: () => ({}),
    [ChartType.TABLE]: () => ({}),
    [ChartType.PIE]: () => ({}),
    [ChartType.FUNNEL]: () => ({}),
    [ChartType.TREEMAP]: () => ({}),
    [ChartType.CUSTOM]: () => ({}),
};

// simple clone; reducer guarantees we’re not handing in drafts
const clone = <T>(v: T): T => structuredClone(v as unknown as object) as T;

export const getValidChartConfig = (
    chartType: ChartType,
    cachedConfigs?: Partial<ConfigCacheMap>,
    chartConfig?: ChartConfig,
): ChartConfig => {
    const fromAction =
        chartConfig?.type === chartType ? chartConfig.config : undefined;

    const fromCache = cachedConfigs?.[chartType]?.chartConfig;
    const fromDefault = DEFAULTS[chartType]();

    const source = fromAction ?? fromCache ?? fromDefault;
    const config = clone(source);

    return { type: chartType, config } as ChartConfig;
};

export const getCachedPivotConfig = (
    chartType: ChartType,
    cachedConfigs?: Partial<ConfigCacheMap>,
): { columns: string[] } | undefined => {
    return cachedConfigs?.[chartType]?.pivotConfig;
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
