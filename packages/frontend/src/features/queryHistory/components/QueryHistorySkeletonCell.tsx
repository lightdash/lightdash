import { Box, Skeleton } from '@mantine/core';
import { type FC } from 'react';
import styles from '../QueryHistory.module.css';

type Props = {
    width: string | number;
    align?: 'start' | 'end';
    /** Adds the dimmed second line that query rows render under the title. */
    withSubline?: boolean;
    sublineWidth?: string | number;
};

/**
 * Placeholder for one table cell while a window's page is in flight. The
 * wrappers reproduce the line boxes of a real query cell, so a skeleton row
 * is exactly as tall as the row that replaces it.
 */
export const QueryHistorySkeletonCell: FC<Props> = ({
    width,
    align = 'start',
    withSubline = false,
    sublineWidth = '40%',
}) => (
    <Box className={styles.skeletonLines}>
        <Box
            className={
                align === 'end'
                    ? `${styles.skeletonTitleLine} ${styles.skeletonAlignEnd}`
                    : styles.skeletonTitleLine
            }
        >
            <Skeleton h={12} w={width} radius="xl" />
        </Box>
        {withSubline ? (
            <Box className={styles.skeletonSubLine}>
                <Skeleton h={10} w={sublineWidth} radius="xl" opacity={0.6} />
            </Box>
        ) : null}
    </Box>
);
