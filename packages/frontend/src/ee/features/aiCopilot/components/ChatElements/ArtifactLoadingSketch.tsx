import { Box, VisuallyHidden } from '@mantine/core';
import { type FC } from 'react';
import { useUiString } from '../../../../providers/Embed/useUiStrings';
import styles from './ArtifactLoadingSketch.module.css';

const BAR_COUNT = 7;
const ROW_COUNT = 4;

type Props = {
    /** Whether the sketch draws bars or table rows. */
    shape?: 'chart' | 'table';
    /** Screen-reader status; defaults to the visualization loading string. */
    label?: string;
};

export const ArtifactLoadingSketch: FC<Props> = ({
    shape = 'chart',
    label,
}) => {
    const defaultLabel = useUiString(
        'aiAgent.artifactPanel.loadingVisualization',
    );
    return (
        <Box className={styles.root} aria-busy="true" data-shape={shape}>
            <Box className={styles.sketch} aria-hidden="true">
                <Box className={styles.title} />
                <Box className={styles.subtitle} />
                {shape === 'chart' ? (
                    <Box className={styles.chart}>
                        {Array.from({ length: BAR_COUNT }, (_, index) => (
                            <Box key={index} />
                        ))}
                    </Box>
                ) : (
                    <Box className={styles.table}>
                        {Array.from({ length: ROW_COUNT }, (_, index) => (
                            <Box key={index}>
                                <Box />
                                <Box />
                                <Box />
                            </Box>
                        ))}
                    </Box>
                )}
            </Box>
            <VisuallyHidden role="status">
                {label ?? defaultLabel}
            </VisuallyHidden>
        </Box>
    );
};
