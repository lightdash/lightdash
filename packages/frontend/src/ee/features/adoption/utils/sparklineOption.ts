import { type WeeklyActivePoint } from '@lightdash/common';
import { type EChartsOption } from '../../../../components/EChartsReactWrapper';

// Same token the homepage sparkline passes to ECharts
const COLOR = 'var(--mantine-color-ldGray-6)';

export const hasActivity = (points: WeeklyActivePoint[]): boolean =>
    points.some((point) => point.activeUsers > 0);

export const getSparklineOption = (
    points: WeeklyActivePoint[],
): EChartsOption => ({
    animation: false,
    grid: { left: 2, right: 2, top: 4, bottom: 4 },
    xAxis: {
        type: 'category',
        show: false,
        boundaryGap: false,
        data: points.map((point) => point.weekStart),
    },
    yAxis: {
        type: 'value',
        show: false,
        min: 0,
        splitLine: { show: false },
    },
    series: [
        {
            type: 'line',
            data: points.map((point) => point.activeUsers),
            smooth: true,
            silent: true,
            symbol: 'none',
            lineStyle: { width: 2, color: COLOR },
            areaStyle: { opacity: 0.08, color: COLOR },
        },
    ],
    tooltip: { show: false },
});
