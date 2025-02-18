import {
    type ApiQueryResults,
    type ChartType,
    type ItemsMap,
} from '@lightdash/common';
import type EChartsReact from 'echarts-for-react';
import { createContext, type RefObject } from 'react';
import { type CartesianTypeOptions } from '../../hooks/cartesianChartConfig/useCartesianChartConfig';
import { type EChartSeries } from '../../hooks/echarts/useEchartsCartesianConfig';
import { type SeriesLike } from '../../hooks/useChartColorConfig/types';
import { type EchartSeriesClickEvent } from '../SimpleChart';
import { type VisualizationConfig } from './types';

type VisualizationContext = {
    minimal: boolean;
    chartRef: RefObject<EChartsReact | null>;
    pivotDimensions: string[] | undefined;
    resultsData: ApiQueryResults | undefined;
    isLoading: boolean;
    columnOrder: string[];
    itemsMap: ItemsMap | undefined;
    visualizationConfig: VisualizationConfig;
    // cartesian config related
    setStacking: (value: boolean | undefined) => void;
    setCartesianType(args: CartesianTypeOptions | undefined): void;
    // --
    onSeriesContextMenu?: (
        e: EchartSeriesClickEvent,
        series: EChartSeries[],
    ) => void;
    setChartType: (value: ChartType) => void;
    setPivotDimensions: (value: string[] | undefined) => void;

    getSeriesColor: (seriesLike: SeriesLike) => string;
    getGroupColor: (groupPrefix: string, groupName: string) => string;
    colorPalette: string[];
};

const Context = createContext<VisualizationContext | undefined>(undefined);

export default Context;
