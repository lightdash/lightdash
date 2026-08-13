import { Box, Group, Text } from '@mantine/core';
import { type FC } from 'react';
import { useMergeSetup } from '../hooks/useMergeSetup';
import { getMergeSetupProgress } from '../utils/getMergeSetupProgress';
import styles from './MergeSetupGuide.module.css';

export const MergeSetupGuide: FC = () => {
    const { queryB, effectiveParts } = useMergeSetup();
    const progress = getMergeSetupProgress({
        hasExplore: !!queryB.exploreName,
        dimensionCount: queryB.dimensions.length,
        metricCount: queryB.metrics.length,
        hasJoin: effectiveParts.every(
            (part) => part.fieldA !== null && part.fieldB !== null,
        ),
    });

    return (
        <Box className={styles.root} aria-label="Merge setup progress">
            <Box className={styles.progress} aria-hidden>
                {[1, 2, 3, 4].map((step) => (
                    <Box
                        key={step}
                        className={styles.segment}
                        data-complete={step <= progress.step}
                    />
                ))}
            </Box>
            <Group gap="xs" justify="space-between" wrap="nowrap">
                <Text size="xs" fw={600}>
                    {progress.title}
                </Text>
                <Text size="xs" c="dimmed" style={{ flex: 'none' }}>
                    {progress.step} of 4
                </Text>
            </Group>
            <Text size="xs" c="dimmed">
                {progress.description}
            </Text>
        </Box>
    );
};
