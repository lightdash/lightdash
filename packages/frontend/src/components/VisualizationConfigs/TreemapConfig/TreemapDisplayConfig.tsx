import { Group, Stack, Tooltip } from '@mantine/core';
import { IconHelpCircle } from '@tabler/icons-react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import MantineIcon from '../../common/MantineIcon';
import { NumberInput } from '../../common/NumberInput';
import { isTreemapVisualizationConfig } from '../../LightdashVisualization/types';
import { useVisualizationContext } from '../../LightdashVisualization/useVisualizationContext';
import { Config } from '../common/Config';

export const Display: React.FC = () => {
    const { t } = useTranslation('vizConfig');
    const { visualizationConfig } = useVisualizationContext();

    if (!isTreemapVisualizationConfig(visualizationConfig)) return null;

    const { visibleMin, setVisibleMin, leafDepth, setLeafDepth } =
        visualizationConfig.chartConfig;

    return (
        <Stack>
            <Config>
                <Stack gap="xs">
                    <Group gap="xs">
                        <Config.Heading>
                            {t('treemap.display.minimumSectionSize')}
                        </Config.Heading>
                        <Tooltip
                            maw={350}
                            label={t('treemap.display.minimumSectionSizeHelp')}
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
                                    setVisibleMin(value);
                            }}
                            min={0}
                            step={500}
                            suffix="px²"
                        />
                    </Group>
                    <Group gap="xs">
                        <Config.Heading>
                            {t('treemap.display.maxLeafDepth')}
                        </Config.Heading>
                        <Tooltip
                            maw={350}
                            label={t('treemap.display.maxLeafDepthHelp')}
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
                                    setLeafDepth(value);
                            }}
                            min={1}
                            placeholder={t('treemap.display.noLimit')}
                        />
                    </Group>
                </Stack>
            </Config>
        </Stack>
    );
};
