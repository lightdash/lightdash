import { ECHARTS_DEFAULT_COLORS } from '@lightdash/common';
import { Group, Stack, Text } from '@mantine/core';
import { memo, type FC } from 'react';
import { DEFAULT_MAP_COLORS } from '../../../hooks/useMapChartConfig';
import { isMapVisualizationConfig } from '../../LightdashVisualization/types';
import { useVisualizationContext } from '../../LightdashVisualization/useVisualizationContext';
import ColorSelector from '../ColorSelector';
import { Config } from '../common/Config';

export const Display: FC = memo(() => {
    const { visualizationConfig } = useVisualizationContext();

    if (!isMapVisualizationConfig(visualizationConfig)) {
        return null;
    }

    const {
        chartConfig: {
            validConfig,
            setColorRangeLow,
            setColorRangeMid,
            setColorRangeHigh,
        },
    } = visualizationConfig;

    return (
        <Stack>
            <Config>
                <Config.Section>
                    <Config.Heading>Color Range</Config.Heading>
                    <Text size="xs" c="dimmed" mb="sm">
                        Set the gradient colors for region values (low to high)
                    </Text>
                    <Group spacing="md">
                        <Stack spacing={4}>
                            <Text size="xs" fw={500}>
                                Low
                            </Text>
                            <ColorSelector
                                color={
                                    validConfig.colorRangeLow ||
                                    DEFAULT_MAP_COLORS.low
                                }
                                swatches={ECHARTS_DEFAULT_COLORS}
                                onColorChange={setColorRangeLow}
                            />
                        </Stack>
                        <Stack spacing={4}>
                            <Text size="xs" fw={500}>
                                Mid
                            </Text>
                            <ColorSelector
                                color={
                                    validConfig.colorRangeMid ||
                                    DEFAULT_MAP_COLORS.mid
                                }
                                swatches={ECHARTS_DEFAULT_COLORS}
                                onColorChange={setColorRangeMid}
                            />
                        </Stack>
                        <Stack spacing={4}>
                            <Text size="xs" fw={500}>
                                High
                            </Text>
                            <ColorSelector
                                color={
                                    validConfig.colorRangeHigh ||
                                    DEFAULT_MAP_COLORS.high
                                }
                                swatches={ECHARTS_DEFAULT_COLORS}
                                onColorChange={setColorRangeHigh}
                            />
                        </Stack>
                    </Group>
                </Config.Section>
            </Config>
        </Stack>
    );
});
