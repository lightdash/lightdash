import { Box, Group, Text } from '@mantine/core';
import type { ReactNode } from 'react';
import styles from './ReportPresentation.module.css';

type Props = {
    title?: ReactNode;
    description?: string;
    ariaLabel?: string;
    actions?: ReactNode;
    /** 'content' lets short charts such as tables shrink to their rows. */
    fit?: 'fixed' | 'content';
    children: ReactNode;
};

const ReportChartFrame = ({
    title,
    description,
    ariaLabel,
    actions,
    fit = 'fixed',
    children,
}: Props) => (
    <Box className={styles.reportEvidence}>
        {(title || actions) && (
            <Group justify="space-between" mb="sm">
                <Text fw={600}>{title}</Text>
                {actions}
            </Group>
        )}
        {description && (
            <Text c="dimmed" size="sm" mb="sm">
                {description}
            </Text>
        )}
        <Box
            component="figure"
            className={
                fit === 'content'
                    ? `${styles.chartTile} ${styles.chartTileFitContent}`
                    : styles.chartTile
            }
            aria-label={
                ariaLabel ?? (typeof title === 'string' ? title : undefined)
            }
        >
            {children}
        </Box>
    </Box>
);

export default ReportChartFrame;
