import { Stack, Text } from '@mantine-8/core';
import { IconPuzzle } from '@tabler/icons-react';
import { useEffect, useRef, type FC } from 'react';
import MantineIcon from '../common/MantineIcon';
import { isDataAppVizVisualizationConfig } from '../LightdashVisualization/types';
import { useVisualizationContext } from '../LightdashVisualization/useVisualizationContext';

type Props = {
    onScreenshotReady?: () => void;
    onScreenshotError?: () => void;
};

const DataAppVizRenderer: FC<Props> = ({ onScreenshotReady }) => {
    const { visualizationConfig } = useVisualizationContext();
    const hasSignaledScreenshotReady = useRef(false);

    useEffect(() => {
        if (hasSignaledScreenshotReady.current) return;
        onScreenshotReady?.();
        hasSignaledScreenshotReady.current = true;
    }, [onScreenshotReady]);

    if (!isDataAppVizVisualizationConfig(visualizationConfig)) return null;

    return (
        <Stack align="center" justify="center" gap="xs" h="100%" w="100%">
            <MantineIcon icon={IconPuzzle} size="xl" color="ldGray.5" />
            <Text c="dimmed" size="sm" ta="center">
                The data app viz renderer isn't wired up yet.
            </Text>
        </Stack>
    );
};

export default DataAppVizRenderer;
