import { type EChartsSeries, type Series } from '@lightdash/common';

export interface ChartColorMappingContextProps {
    colorMappings: Map<string, Map<string, number>>;
}

export type SeriesLike = EChartsSeries | Series;
