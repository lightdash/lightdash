import { getItemId } from '@lightdash/common';
import { Checkbox, NumberInput, SegmentedControl, Stack } from '@mantine/core';
import { memo, type FC } from 'react';
import FieldSelect from '../../common/FieldSelect';
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
            maxFieldId,
            setMaxFieldId,
            getField,
            showAxisLabels,
            setShowAxisLabels,
        },
        numericMetrics,
    } = visualizationConfig;

    const maxValueMode = maxFieldId ? 'metric' : 'fixed';
    const maxField = getField(maxFieldId);

    const numericMetricsList = Object.values(numericMetrics ?? {});

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

                    <SegmentedControl
                        value={maxValueMode}
                        onChange={(value) => {
                            const newMode = value as 'fixed' | 'metric';
                            if (newMode === 'fixed') {
                                // When switching to fixed mode, clear the metric selection
                                setMaxFieldId(undefined);
                            } else {
                                // When switching to metric mode, set to first available metric
                                if (numericMetricsList.length > 0) {
                                    setMaxFieldId(
                                        getItemId(numericMetricsList[0]),
                                    );
                                }
                            }
                        }}
                        data={[
                            { label: 'Fixed value', value: 'fixed' },
                            { label: 'From metric', value: 'metric' },
                        ]}
                        fullWidth
                    />

                    {maxValueMode === 'fixed' ? (
                        <NumberInput
                            label="Maximum Value"
                            description="Set the maximum value for the gauge scale"
                            value={max}
                            onChange={(value) => setMax(Number(value))}
                            placeholder="100"
                        />
                    ) : (
                        <FieldSelect
                            label="Maximum Value Metric"
                            description="Select a metric to use as the maximum value"
                            item={maxField}
                            items={numericMetricsList}
                            onChange={(newValue) => {
                                setMaxFieldId(
                                    newValue ? getItemId(newValue) : undefined,
                                );
                            }}
                            hasGrouping
                        />
                    )}
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
