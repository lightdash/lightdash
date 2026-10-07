import { type WeeklyActivePoint } from '@lightdash/common';
import { useMemo, type FC } from 'react';
import EChartsReact, {
    type EChartsOption,
} from '../../../../components/EChartsReactWrapper';
import styles from './ActivitySparkline.module.css';

const COLOR = 'var(--mantine-color-dimmed)';

export const ActivitySparkline: FC<{ points: WeeklyActivePoint[] }> = ({
    points,
}) => {
    const option = useMemo<EChartsOption>(
        () => ({
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
        }),
        [points],
    );

    return (
        <EChartsReact
            className={styles.chart}
            option={option}
            notMerge
            opts={{ renderer: 'svg' }}
        />
    );
};
