import { Checkbox, NumberInput } from '@mantine/core';
import { memo, type FC } from 'react';
import { isGaugeVisualizationConfig } from '../../LightdashVisualization/types';
import { useVisualizationContext } from '../../LightdashVisualization/useVisualizationContext';
import { Config } from '../common/Config';

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
            showProgress,
            setShowProgress,
            isRadial,
            setIsRadial,
        },
    } = visualizationConfig;

    return (
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

            <Config.Section>
                <Config.Heading>Appearance</Config.Heading>
                <Checkbox
                    label="Radial Gauge"
                    description="Display as full circle (radial) or half circle"
                    checked={isRadial}
                    onChange={(event) =>
                        setIsRadial(event.currentTarget.checked)
                    }
                />

                <Checkbox
                    label="Show Progress"
                    description="Display progress arc around the gauge"
                    checked={showProgress}
                    onChange={(event) =>
                        setShowProgress(event.currentTarget.checked)
                    }
                />
            </Config.Section>
        </Config>
    );
});
