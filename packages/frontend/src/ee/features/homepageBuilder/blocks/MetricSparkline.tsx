import { type MetricExploreDataPointWithDateValue } from '@lightdash/common';
import { type EChartsOption } from 'echarts';
import { useMemo, type FC } from 'react';
import EChartsReact from '../../../../components/EChartsReactWrapper';
import classes from './MetricSparkline.module.css';

const NEUTRAL_COLOR = 'var(--mantine-color-ldGray-6)';
const UP_COLOR = 'var(--mantine-color-green-6)';
const DOWN_COLOR = 'var(--mantine-color-red-6)';

const getSparklineColor = (change: number | undefined): string => {
    if (change === undefined || change === 0) {
        return NEUTRAL_COLOR;
    }
    return change > 0 ? UP_COLOR : DOWN_COLOR;
};

type Props = {
    points: MetricExploreDataPointWithDateValue[];
    change: number | undefined;
};

const MetricSparkline: FC<Props> = ({ points, change }) => {
    const color = getSparklineColor(change);

    const option = useMemo<EChartsOption>(
        () => ({
            animation: false,
            grid: { left: 2, right: 2, top: 4, bottom: 4 },
            xAxis: {
                type: 'category',
                show: false,
                boundaryGap: false,
                data: points.map((_, index) => index),
            },
            yAxis: {
                type: 'value',
                show: false,
                splitLine: { show: false },
            },
            series: [
                {
                    type: 'line',
                    data: points.map((point) => point.metric.value),
                    smooth: true,
                    silent: true,
                    symbol: 'none',
                    lineStyle: { width: 2, color },
                    areaStyle: { opacity: 0.08, color },
                },
            ],
            tooltip: { show: false },
        }),
        [points, color],
    );

    return (
        <EChartsReact
            className={classes.sparkline}
            option={option}
            notMerge
            opts={{ renderer: 'svg' }}
            style={{ height: 40, width: '100%' }}
        />
    );
};

export default MetricSparkline;
