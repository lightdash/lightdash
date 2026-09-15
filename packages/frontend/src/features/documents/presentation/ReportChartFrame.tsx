import { Box, Group, Text } from '@mantine/core';
import type { ReactNode } from 'react';
import styles from './ReportPresentation.module.css';

type Props = {
    title?: ReactNode;
    description?: string;
    ariaLabel?: string;
    actions?: ReactNode;
    children: ReactNode;
};

const ReportChartFrame = ({
    title,
    description,
    ariaLabel,
    actions,
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
            className={styles.chartTile}
            aria-label={
                ariaLabel ?? (typeof title === 'string' ? title : undefined)
            }
        >
            {children}
        </Box>
    </Box>
);

export default ReportChartFrame;
