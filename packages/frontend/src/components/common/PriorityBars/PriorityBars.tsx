import { Box } from '@mantine/core';
import { type FC } from 'react';
import styles from './PriorityBars.module.css';

export type PriorityLevel = 'none' | 'low' | 'medium' | 'high' | 'urgent';

const FILLED_BARS: Record<PriorityLevel, number> = {
    none: 0,
    low: 1,
    medium: 2,
    high: 3,
    urgent: 3,
};

type Props = {
    priority: PriorityLevel;
};

// Signal-strength glyph: one bar per level; urgent fills all three in darker ink.
export const PriorityBars: FC<Props> = ({ priority }) => {
    const filled = FILLED_BARS[priority];

    return (
        <Box
            component="svg"
            className={`${styles.bars} ${
                priority === 'urgent' ? styles.urgent : ''
            }`}
            width={10}
            height={9}
            viewBox="0 0 10 9"
            aria-hidden
        >
            {[0, 1, 2].map((index) => (
                <rect
                    key={index}
                    x={index * 4}
                    y={6 - index * 3}
                    width={2}
                    height={3 + index * 3}
                    rx={0.5}
                    className={index < filled ? styles.filled : styles.empty}
                />
            ))}
        </Box>
    );
};
