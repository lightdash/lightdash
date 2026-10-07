import { type WeeklyActivePoint } from '@lightdash/common';
import { useMemo, type FC } from 'react';
import EChartsReact from '../../../../components/EChartsReactWrapper';
import { getSparklineLabel } from '../utils/sparklineLabel';
import { getSparklineOption, hasActivity } from '../utils/sparklineOption';
import styles from './ActivitySparkline.module.css';

export const ActivitySparkline: FC<{ points: WeeklyActivePoint[] }> = ({
    points,
}) => {
    const active = hasActivity(points);
    const option = useMemo(() => getSparklineOption(points), [points]);

    return (
        <div
            role="img"
            aria-label={getSparklineLabel(points)}
            className={styles.chart}
        >
            {active ? (
                <EChartsReact
                    className={styles.chart}
                    option={option}
                    notMerge
                    opts={{ renderer: 'svg' }}
                />
            ) : (
                <div className={styles.rule} />
            )}
        </div>
    );
};
