import type {
    ApiErrorDetail,
    ChartConfig,
    ChartType,
    DrillConfig,
    DrillPath,
    EChartsSeries,
    ItemsMap,
    MetricQuery,
    ParametersValuesMap,
    ResultValue,
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

type VisualizationContext = {
    minimal: boolean;
    chartRef: RefObject<EChartsReact | null>;
    leafletMapRef: RefObject<LeafletMap | null>;
    pivotDimensions: string[] | undefined;
    resultsData:
        | (InfiniteQueryResults & {
              metricQuery?: MetricQuery;
              fields?: ItemsMap;
          })
        | undefined;
    isLoading: boolean;
    columnOrder: string[];
    itemsMap: ItemsMap | undefined;
    visualizationConfig: VisualizationConfig;
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

    getSeriesColor: (seriesLike: SeriesLike) => string;
    getGroupColor: (groupPrefix: string, groupName: string) => string;
    colorPalette: string[];
    chartConfig: ChartConfig;
    apiErrorDetail?: ApiErrorDetail | null;
    parameters?: ParametersValuesMap;
    // Container dimensions for responsive visualizations
    containerWidth?: number;
    containerHeight?: number;
    isDashboard?: boolean;
    isEditMode?: boolean;
    drillConfig?: DrillConfig;
    onDrill?: (params: {
        drillPath: DrillPath;
        fieldValues: Record<string, ResultValue>;
        dimensionIds: string[];
    }) => void;
    onLinkedChartDrill?: (params: {
        drillPathId: string;
        linkedChartUuid: string;
        fieldValues: Record<string, ResultValue>;
        dimensionIds: string[];
    }) => void;
    // Touch device detection for tooltip positioning
    isTouchDevice: boolean;
};

const Context = createContext<VisualizationContext | undefined>(undefined);

export default Context;
