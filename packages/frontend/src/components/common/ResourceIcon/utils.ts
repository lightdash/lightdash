import { ChartKind } from '@lightdash/common';
import {
    AreaChartIcon,
    BarChartIcon,
    BigNumberIcon,
    CustomChartTypeIcon,
    FunnelChartIcon,
    GaugeChartIcon,
    LineChartIcon,
    MapChartIcon,
    MixedChartIcon,
    PieChartIcon,
    SankeyChartIcon,
    ScatterChartIcon,
    TableIcon,
    TreemapChartIcon,
    VegaChartIcon,
} from '../ContentIcons';

export const getChartIcon = (chartKind: ChartKind | undefined) => {
    switch (chartKind) {
        case undefined:
        case ChartKind.VERTICAL_BAR:
            return BarChartIcon;
        case ChartKind.HORIZONTAL_BAR:
            return BarChartIcon;
        case ChartKind.LINE:
            return LineChartIcon;
        case ChartKind.SCATTER:
            return ScatterChartIcon;
        case ChartKind.AREA:
            return AreaChartIcon;
        case ChartKind.MIXED:
            return MixedChartIcon;
        case ChartKind.PIE:
            return PieChartIcon;
        case ChartKind.FUNNEL:
            return FunnelChartIcon;
        case ChartKind.TREEMAP:
            return TreemapChartIcon;
        case ChartKind.GAUGE:
            return GaugeChartIcon;
        case ChartKind.TABLE:
            return TableIcon;
        case ChartKind.BIG_NUMBER:
            return BigNumberIcon;
        case ChartKind.CUSTOM:
            return VegaChartIcon;
        case ChartKind.MAP:
            return MapChartIcon;
        case ChartKind.SANKEY:
            return SankeyChartIcon;
        case ChartKind.DATA_APP_VIZ:
            return CustomChartTypeIcon;
        default:
            return BarChartIcon;
    }
};
