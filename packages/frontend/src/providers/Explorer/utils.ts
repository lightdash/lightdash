import {
    ChartType,
    type ChartConfig,
    type SavedChart,
    type Series,
} from '@lightdash/common';
import omit from 'lodash/omit';
import { EMPTY_CARTESIAN_CHART_CONFIG } from '../../hooks/cartesianChartConfig/useCartesianChartConfig';
import { type ConfigCacheMap } from './types';

const DEFAULTS = {
    [ChartType.CARTESIAN]: () => ({ ...EMPTY_CARTESIAN_CHART_CONFIG }), // factory to avoid shared refs
    [ChartType.BIG_NUMBER]: () => ({ showTableNamesInLabel: false }),
    [ChartType.TABLE]: () => ({
        showTableNames: false,
    }),
    [ChartType.PIE]: () => ({ showLegend: false, valueLabel: 'outside' }),
    [ChartType.FUNNEL]: () => ({}),
    [ChartType.TREEMAP]: () => ({}),
    [ChartType.GAUGE]: () => ({}),
    [ChartType.MAP]: () => ({}),
    [ChartType.CUSTOM]: () => ({}),
    [ChartType.SANKEY]: () => ({}),
    [ChartType.DATA_APP_VIZ]: () => ({}),
};

// simple clone; reducer guarantees we’re not handing in drafts
const clone = <T>(v: T): T => structuredClone(v as unknown as object) as T;

// A config given for the requested type is taken as it is, absent included:
// that is how a data app viz chart says it points at no viz yet.
export const getValidChartConfig = (
    chartType: ChartType,
    cachedConfigs?: Partial<ConfigCacheMap>,
    chartConfig?: ChartConfig,
): ChartConfig => {
    const source =
        chartConfig?.type === chartType
            ? chartConfig.config
            : (cachedConfigs?.[chartType]?.chartConfig ??
              DEFAULTS[chartType]());
    return (
        source === undefined
            ? { type: chartType }
            : { type: chartType, config: clone(source) }
    ) as ChartConfig;
};

export const getCachedPivotConfig = (
    chartType: ChartType,
    cachedConfigs?: Partial<ConfigCacheMap>,
): SavedChart['pivotConfig'] => {
    return cachedConfigs?.[chartType]?.pivotConfig;
};

// Clean the config to remove runtime-only properties like isFilteredOut
// and merge with defaults to handle backwards compatibility when new properties are added
export const cleanConfig = (config: ChartConfig): ChartConfig => {
    if (
        config.type === ChartType.CARTESIAN &&
        config.config?.eChartsConfig?.series
    ) {
        // Merge with defaults to ensure old saved charts have new default properties
        const defaults = DEFAULTS[ChartType.CARTESIAN]();

        return {
            type: config.type,
            config: {
                ...defaults,
                ...config.config,
                eChartsConfig: {
                    ...defaults.eChartsConfig,
                    ...config.config.eChartsConfig,
                    series: config.config.eChartsConfig.series.map(
                        (s: Series) => omit(s, ['isFilteredOut']),
                    ),
                },
            },
        } as ChartConfig;
    }

    // For non-Cartesian charts, still merge with defaults
    const defaults = DEFAULTS[config.type]();
    return {
        type: config.type,
        config: {
            ...defaults,
            ...config.config,
        },
    } as ChartConfig;
};
