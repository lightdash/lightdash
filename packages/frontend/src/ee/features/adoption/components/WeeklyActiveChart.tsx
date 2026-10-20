import { type DepartmentWeeklyActivePoint } from '@lightdash/common';
import dayjs from 'dayjs';
import { useMemo, type FC } from 'react';
import EChartsReact, {
    type EChartsOption,
} from '../../../../components/EChartsReactWrapper';
import { getWeeklyChartLabel } from '../utils/departmentDetail';

const DEPARTMENT_COLOR = 'var(--mantine-color-text)';
const AVERAGE_COLOR = 'var(--mantine-color-dimmed)';

export const WeeklyActiveChart: FC<{
    points: DepartmentWeeklyActivePoint[];
}> = ({ points }) => {
    const option = useMemo<EChartsOption>(
        () => ({
            animation: false,
            grid: { left: 36, right: 16, top: 32, bottom: 28 },
            legend: { top: 0, left: 0, icon: 'roundRect' },
            tooltip: { trigger: 'axis' },
            xAxis: {
                type: 'category',
                boundaryGap: false,
                data: points.map((p) => dayjs(p.weekStart).format('D MMM')),
            },
            yAxis: { type: 'value', min: 0, minInterval: 1 },
            series: [
                {
                    name: 'This department',
                    type: 'line',
                    data: points.map((p) => p.activeUsers),
                    symbol: 'circle',
                    symbolSize: 6,
                    lineStyle: { width: 2, color: DEPARTMENT_COLOR },
                    itemStyle: { color: DEPARTMENT_COLOR },
                },
                {
                    name: 'Average department',
                    type: 'line',
                    data: points.map((p) => p.orgAverage),
                    symbol: 'none',
                    lineStyle: {
                        width: 2,
                        type: 'dashed',
                        color: AVERAGE_COLOR,
                    },
                    itemStyle: { color: AVERAGE_COLOR },
                },
            ],
        }),
        [points],
    );

    return (
        <div role="img" aria-label={getWeeklyChartLabel(points)}>
            <EChartsReact
                option={option}
                notMerge
                opts={{ renderer: 'svg' }}
                style={{ height: 260, width: '100%' }}
            />
        </div>
    );
};
