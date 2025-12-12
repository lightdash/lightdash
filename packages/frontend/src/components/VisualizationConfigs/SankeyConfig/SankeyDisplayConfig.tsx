import { Switch } from '@mantine/core';
import { memo, type FC } from 'react';
import { isSankeyVisualizationConfig } from '../../LightdashVisualization/types';
import { useVisualizationContext } from '../../LightdashVisualization/useVisualizationContext';
import { Config } from '../common/Config';

export const SankeyDisplayConfig: FC = memo(() => {
    const { visualizationConfig } = useVisualizationContext();

    if (!isSankeyVisualizationConfig(visualizationConfig)) {
        return null;
    }

    const {
        chartConfig: { showLabels, setShowLabels },
    } = visualizationConfig;

    return (
        <Config>
            <Config.Section>
                <Config.Heading>Labels</Config.Heading>
                <Switch
                    label="Show node labels"
                    checked={showLabels}
                    onChange={(e) => setShowLabels(e.currentTarget.checked)}
                />
            </Config.Section>
        </Config>
    );
});
