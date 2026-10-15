import {
    PieChartLegendLabelMaxLengthDefault,
    PieChartLegendPositions,
    type PieChartLegendPosition,
} from '@lightdash/common';
import {
    Collapse,
    Group,
    SegmentedControl,
    Stack,
    Switch,
    TextInput,
} from '@mantine/core';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { isPieVisualizationConfig } from '../../LightdashVisualization/types';
import { useVisualizationContext } from '../../LightdashVisualization/useVisualizationContext';
import { Config } from '../common/Config';

export const Display: React.FC = () => {
    const { t } = useTranslation('vizConfig');
    const { visualizationConfig } = useVisualizationContext();

    if (!isPieVisualizationConfig(visualizationConfig)) return null;

    const {
        showLegend,
        toggleShowLegend,
        legendPosition,
        legendPositionChange,
        legendMaxItemLength,
        legendMaxItemLengthChange,
    } = visualizationConfig.chartConfig;

    return (
        <Stack>
            <Config>
                <Group>
                    <Config.Heading>
                        {t('pie.display.showLegend')}
                    </Config.Heading>
                    <Switch
                        size="xs"
                        checked={showLegend}
                        onChange={toggleShowLegend}
                    />
                </Group>
            </Config>

            <Collapse expanded={showLegend}>
                <Stack gap="xs">
                    <Group gap="xs">
                        <Config.Label>
                            {t('pie.display.orientation')}
                        </Config.Label>
                        <SegmentedControl
                            name="orient"
                            value={legendPosition}
                            onChange={(val: string) =>
                                legendPositionChange(
                                    val as PieChartLegendPosition,
                                )
                            }
                            data={Object.keys(PieChartLegendPositions).map(
                                (position) => ({
                                    label: t(
                                        `pie.display.legendPositions.${position}`,
                                    ),
                                    value: position,
                                }),
                            )}
                        />
                    </Group>
                    <Group>
                        <Config.Label>
                            {t('pie.display.labelMaxLength')}
                        </Config.Label>
                        <TextInput
                            size="xs"
                            type="number"
                            value={legendMaxItemLength}
                            placeholder={PieChartLegendLabelMaxLengthDefault.toString()}
                            onChange={(e) => {
                                const parsedNumber = Number.parseInt(
                                    e.target.value,
                                    10,
                                );
                                legendMaxItemLengthChange(
                                    !Number.isNaN(parsedNumber)
                                        ? parsedNumber
                                        : undefined,
                                );
                            }}
                        />
                    </Group>
                </Stack>
            </Collapse>
        </Stack>
    );
};
