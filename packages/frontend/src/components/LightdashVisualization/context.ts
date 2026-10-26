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
import { type VisualizationInputs } from '../../features/visualization/store/inputs';
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

// Inputs: results, fields, colours and flags. Stable while a chart is edited.
export type VisualizationState = VisualizationInputs & {
    minimal: boolean;
    isLoading: boolean;
    getGroupColor: (groupPrefix: string, groupName: string) => string;
    savedChartUuid?: string;
    savedChartReference?: SavedChartReference;
    apiErrorDetail?: ApiErrorDetail | null;
    isDashboard?: boolean;
    isEditMode?: boolean;
    embeddedDashboardInteractivity?: EmbeddedDashboardInteractivity;
    hasExplorerStore: boolean;
    // Resolved timezone for formatting (undefined when EnableTimezoneSupport flag is off)
    resolvedTimezone?: string;
    // Date-zoom granularity applied by the surface (dashboards); undefined elsewhere.
    dateZoom?: DateZoom;
};

// The editor's current config and what derives from it; changes on every edit.
export type VisualizationConfigValue = {
    visualizationConfig: VisualizationConfig;
    /** The chart config as the editor currently has it */
    chartConfig: ChartConfig;
    getSeriesColor: (seriesLike: SeriesLike) => string;
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
export const ConfigContext = createContext<
    VisualizationConfigValue | undefined
>(undefined);

export type VisualizationContextValue = VisualizationServices &
    VisualizationLayout &
    VisualizationState &
    VisualizationConfigValue;
