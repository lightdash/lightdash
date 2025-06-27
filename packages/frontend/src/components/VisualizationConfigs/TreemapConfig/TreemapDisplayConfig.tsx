import { Group, NumberInput, Stack, Tooltip } from '@mantine/core';
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
                <Group>
                    <Config.Heading>Minimum Pixels Visible</Config.Heading>

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
                        onChange={setVisibleMin}
                        min={0}
                        step={500}
                        formatter={(value) => (value ? `${value}px\u00B2` : '')}
                        parser={(value) => value.replace(/px\u00B2\s?$/, '')}
                    />
                    <Config.Heading>Max Leaf Depth</Config.Heading>
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
                        onChange={setLeafDepth}
                        min={1}
                    />
                </Group>
            </Config>
        </Stack>
    );
};
