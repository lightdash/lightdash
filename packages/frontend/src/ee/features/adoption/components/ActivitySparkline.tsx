import { type WeeklyActivePoint } from '@lightdash/common';
import { useMemo, type FC } from 'react';
import EChartsReact from '../../../../components/EChartsReactWrapper';
import { getSparklineLabel } from '../utils/sparklineLabel';
import { getSparklineOption } from '../utils/sparklineOption';
import styles from './ActivitySparkline.module.css';

export const ActivitySparkline: FC<{ points: WeeklyActivePoint[] }> = ({
    points,
}) => {
    const option = useMemo(() => getSparklineOption(points), [points]);

    return (
        <div
            role="img"
            aria-label={getSparklineLabel(points)}
            className={styles.chart}
        >
            <EChartsReact
                className={styles.chart}
                option={option}
                notMerge
                opts={{ renderer: 'svg' }}
            />
        </div>
    );
};
