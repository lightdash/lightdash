import { type Series } from '@lightdash/common';
import { type EChartSeries } from '../echarts/useEchartsCartesianConfig';

export interface ChartColorMappingContextProps {
    colorMappings: Map<string, Map<string, number>>;
}

export type SeriesLike = EChartSeries | Series;
