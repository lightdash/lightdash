import { Checkbox, NumberInput, Stack } from '@mantine/core';
import { memo, type FC } from 'react';
import { isGaugeVisualizationConfig } from '../../LightdashVisualization/types';
import { useVisualizationContext } from '../../LightdashVisualization/useVisualizationContext';
import { Config } from '../common/Config';
import GaugeSections from './GaugeSections';

export const GaugeDisplayConfig: FC = memo(() => {
    const { visualizationConfig } = useVisualizationContext();

    if (!isGaugeVisualizationConfig(visualizationConfig)) {
        return null;
    }

    const {
        chartConfig: {
            min,
            setMin,
            max,
            setMax,
            showAxisLabels,
            setShowAxisLabels,
        },
    } = visualizationConfig;

    return (
        <Stack>
            <Config>
                <Config.Section>
                    <Config.Heading>Scale</Config.Heading>
                    <NumberInput
                        label="Minimum Value"
                        description="Set the minimum value for the gauge scale"
                        value={min}
                        onChange={(value) => setMin(Number(value))}
                        placeholder="0"
                    />

                    <NumberInput
                        label="Maximum Value"
                        description="Set the maximum value for the gauge scale"
                        value={max}
                        onChange={(value) => setMax(Number(value))}
                        placeholder="100"
                    />
                </Config.Section>
            </Config>
            <Config>
                <Config.Section>
                    <Config.Heading>Appearance</Config.Heading>

                    <Checkbox
                        label="Show Axis Labels"
                        description="Display axis labels and tick marks"
                        checked={showAxisLabels}
                        onChange={(event) =>
                            setShowAxisLabels(event.currentTarget.checked)
                        }
                    />
                </Config.Section>
            </Config>
            <GaugeSections />
        </Stack>
    );
});
