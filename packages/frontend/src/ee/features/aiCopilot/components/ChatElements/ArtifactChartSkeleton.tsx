import { Box, Skeleton, Text } from '@mantine/core';
import { type FC } from 'react';
import { useUiString } from '../../../../providers/Embed/useUiStrings';
import styles from './ArtifactChartSkeleton.module.css';

const BAR_HEIGHTS = [38, 56, 44, 72, 60, 84, 66];

// Chart-shaped placeholder that fills the same area as the rendered chart.
type Props = {
    /** Off when the panel header already shows the chart's title. */
    withHeading?: boolean;
};

export const ArtifactChartSkeleton: FC<Props> = ({ withHeading = true }) => {
    const label = useUiString('aiAgent.artifactPanel.loadingVisualization');
    return (
        <Box className={styles.root} aria-busy="true">
            {withHeading && (
                <Box className={styles.head}>
                    <Skeleton height={16} width="45%" radius="sm" />
                    <Skeleton height={12} width="70%" radius="sm" />
                </Box>
            )}
            <Box className={styles.plot} aria-hidden="true">
                {BAR_HEIGHTS.map((height, index) => (
                    <Skeleton
                        key={index}
                        className={styles.bar}
                        h={`${height}%`}
                        radius="sm"
                    />
                ))}
            </Box>
            <Text role="status" className={styles.caption}>
                {label}
            </Text>
        </Box>
    );
};
