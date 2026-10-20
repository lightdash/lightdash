import type {
    ApiErrorDetail,
    ChartConfig,
    ChartType,
    DateZoom,
    EChartsSeries,
    ItemsMap,
    MetricQuery,
    ParametersValuesMap,
    StackType,
} from '@lightdash/common';
import type { Map as LeafletMap } from 'leaflet';
import { createContext, type RefObject } from 'react';
import { type CartesianTypeOptions } from '../../hooks/cartesianChartConfig/useCartesianChartConfig';
import { type SeriesLike } from '../../hooks/useChartColorConfig/types';
import { type InfiniteQueryResults } from '../../hooks/useQueryResults';
import { type EChartsReact } from '../EChartsReactWrapper';
import { type EchartsSeriesClickEvent } from '../SimpleChart';
import { type VisualizationConfig } from './types';

export type EmbeddedDashboardInteractivity = {
    canDrillDown: boolean;
    canCrossFilter: boolean;
};

export type SavedChartReference = {
    uuid: string;
    chartConfig: ChartConfig;
};

// Refs and actions: identities never change for the provider's lifetime,
// except that an optional caller callback is undefined while absent.
export type VisualizationServices = {
    chartRef: RefObject<EChartsReact | null>;
    leafletMapRef: RefObject<LeafletMap | null>;
    // cartesian config related
    setStacking: (value: boolean | StackType | undefined) => void;
    setCartesianType(args: CartesianTypeOptions | undefined): void;
    // --
    onSeriesContextMenu?: (
        e: EchartsSeriesClickEvent,
        series: EChartsSeries[],
    ) => void;
    setChartType: (value: ChartType) => void;
    setPivotDimensions: (value: string[] | undefined) => void;
    // Touch device detection for tooltip positioning
    isTouchDevice: boolean;
};

// Container dimensions for responsive visualizations; change on every resize.
export type VisualizationLayout = {
    containerWidth?: number;
    containerHeight?: number;
};

export type VisualizationState = {
    minimal: boolean;
    pivotDimensions: string[] | undefined;
    resultsData:
        | (InfiniteQueryResults & {
              metricQuery?: MetricQuery;
              fields?: ItemsMap;
              resolvedTimezone?: string;
          })
        | undefined;
    isLoading: boolean;
    columnOrder: string[];
    itemsMap: ItemsMap | undefined;
    visualizationConfig: VisualizationConfig;
    getSeriesColor: (seriesLike: SeriesLike) => string;
    getGroupColor: (groupPrefix: string, groupName: string) => string;
    colorPalette: string[];
    chartConfig: ChartConfig;
    savedChartUuid?: string;
    savedChartReference?: SavedChartReference;
    apiErrorDetail?: ApiErrorDetail | null;
    parameters?: ParametersValuesMap;
    isDashboard?: boolean;
    isEditMode?: boolean;
    embeddedDashboardInteractivity?: EmbeddedDashboardInteractivity;
    hasExplorerStore: boolean;
    // Resolved timezone for formatting (undefined when EnableTimezoneSupport flag is off)
    resolvedTimezone?: string;
    // Date-zoom granularity applied by the surface (dashboards); undefined elsewhere.
    dateZoom?: DateZoom;
};

export const ServicesContext = createContext<VisualizationServices | undefined>(
    undefined,
);
export const LayoutContext = createContext<VisualizationLayout | undefined>(
    undefined,
);
export const StateContext = createContext<VisualizationState | undefined>(
    undefined,
);

export type VisualizationContextValue = VisualizationServices &
    VisualizationLayout &
    VisualizationState;
