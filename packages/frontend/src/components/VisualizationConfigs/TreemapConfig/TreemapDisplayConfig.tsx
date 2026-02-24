import { Group, NumberInput, Stack, Tooltip } from '@mantine-8/core';
import { IconHelpCircle } from '@tabler/icons-react';
import React from 'react';
import MantineIcon from '../../common/MantineIcon';
import { isTreemapVisualizationConfig } from '../../LightdashVisualization/types';
import { useVisualizationContext } from '../../LightdashVisualization/useVisualizationContext';
import { Config } from '../common/Config';

export const Display: React.FC = () => {
    const { visualizationConfig } = useVisualizationContext();

    if (!isTreemapVisualizationConfig(visualizationConfig)) return null;

    const { visibleMin, setVisibleMin, leafDepth, setLeafDepth } =
        visualizationConfig.chartConfig;

    return (
        <Stack>
            <Config>
                <Stack gap="xs">
                    <Group gap="xs">
                        <Config.Heading>Minimum section size</Config.Heading>
                        <Tooltip
                            withinPortal={true}
                            maw={350}
                            variant="xs"
                            multiline
                            label="Any sections smaller than this will not be displayed. You can zoom in to see smaller sections."
                        >
                            <MantineIcon
                                icon={IconHelpCircle}
                                size="md"
                                display="inline"
                                color="gray"
                            />
                        </Tooltip>
                        <NumberInput
                            value={visibleMin}
                            onChange={(value) => {
                                if (typeof value === 'number')
                                    setVisibleMin(value);
                            }}
                            min={0}
                            step={500}
                            suffix="px²"
                        />
                    </Group>
                    <Group gap="xs">
                        <Config.Heading>Max leaf depth</Config.Heading>
                        <Tooltip
                            withinPortal={true}
                            maw={350}
                            variant="xs"
                            multiline
                            label="The maximum depth of the treemap. If set, deeper levels can be viewed by clicking on nodes."
                        >
                            <MantineIcon
                                icon={IconHelpCircle}
                                size="md"
                                display="inline"
                                color="gray"
                            />
                        </Tooltip>
                        <NumberInput
                            value={leafDepth}
                            onChange={(value) => {
                                if (typeof value === 'number')
                                    setLeafDepth(value);
                            }}
                            min={1}
                            placeholder="No limit"
                        />
                    </Group>
                </Stack>
            </Config>
        </Stack>
    );
};
