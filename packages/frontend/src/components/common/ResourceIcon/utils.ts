import { assertUnreachable, ChartKind } from '@lightdash/common';
import {
    IconChartArea,
    IconChartAreaLine,
    IconChartBar,
    IconChartDots,
    IconChartLine,
    IconChartPie,
    IconChartTreemap,
    IconCode,
    IconFilter,
    IconGauge,
    IconMap,
    IconSquareNumber1,
    IconTable,
} from '@tabler/icons-react';

export const getChartIcon = (chartKind: ChartKind | undefined) => {
    switch (chartKind) {
        case undefined:
        case ChartKind.VERTICAL_BAR:
            return IconChartBar;
        case ChartKind.HORIZONTAL_BAR:
            return IconChartBar;
        case ChartKind.LINE:
            return IconChartLine;
        case ChartKind.SCATTER:
            return IconChartDots;
        case ChartKind.AREA:
            return IconChartArea;
        case ChartKind.MIXED:
            return IconChartAreaLine;
        case ChartKind.PIE:
            return IconChartPie;
        case ChartKind.FUNNEL:
            return IconFilter;
        case ChartKind.TREEMAP:
            return IconChartTreemap;
        case ChartKind.GAUGE:
            return IconGauge;
        case ChartKind.TABLE:
            return IconTable;
        case ChartKind.BIG_NUMBER:
            return IconSquareNumber1;
        case ChartKind.CUSTOM:
            return IconCode;
        case ChartKind.MAP:
            return IconMap;
        default:
            return assertUnreachable(
                chartKind,
                `Chart type ${chartKind} not supported`,
            );
    }
};
