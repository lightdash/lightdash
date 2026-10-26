import { Group, Stack, Tooltip } from '@mantine/core';
import { IconHelpCircle } from '@tabler/icons-react';
import React from 'react';
import {
    selectTreemapEditor,
    useVisualizationSelector,
} from '../../../features/visualization/store';
import { useTreemapEditorActions } from '../../../hooks/useTreemapChartConfig';
import MantineIcon from '../../common/MantineIcon';
import { NumberInput } from '../../common/NumberInput';
import { Config } from '../common/Config';
import { useDebouncedDraft } from '../common/useDebouncedDraft';

export const Display: React.FC = () => {
    const { setVisibleMin, setLeafDepth } = useTreemapEditorActions();
    const [visibleMin, onVisibleMinChange] = useDebouncedDraft(
        useVisualizationSelector(
            (state) => selectTreemapEditor(state).visibleMin,
        ),
        setVisibleMin,
    );
    const [leafDepth, onLeafDepthChange] = useDebouncedDraft(
        useVisualizationSelector(
            (state) => selectTreemapEditor(state).leafDepth,
        ),
        setLeafDepth,
    );

    return (
        <Stack>
            <Config>
                <Stack gap="xs">
                    <Group gap="xs">
                        <Config.Heading>Minimum section size</Config.Heading>
                        <Tooltip
                            maw={350}
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
                            size="xs"
                            value={visibleMin}
                            onChange={(value) => {
                                if (typeof value === 'number')
                                    onVisibleMinChange(value);
                            }}
                            min={0}
                            step={500}
                            suffix="px²"
                        />
                    </Group>
                    <Group gap="xs">
                        <Config.Heading>Max leaf depth</Config.Heading>
                        <Tooltip
                            maw={350}
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
                            size="xs"
                            value={leafDepth}
                            onChange={(value) => {
                                if (typeof value === 'number')
                                    onLeafDepthChange(value);
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
