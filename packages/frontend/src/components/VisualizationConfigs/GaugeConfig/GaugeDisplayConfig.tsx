import { getItemId } from '@lightdash/common';
import {
    Center,
    Checkbox,
    Group,
    NumberInput,
    SegmentedControl,
    Stack,
    Tooltip,
} from '@mantine/core';
import { memo, type FC } from 'react';
import FieldSelect from '../../common/FieldSelect';
import { isGaugeVisualizationConfig } from '../../LightdashVisualization/types';
import { useVisualizationContext } from '../../LightdashVisualization/useVisualizationContext';
import { Config } from '../common/Config';
import GaugeSections from './GaugeSections';
import { GaugeValueMode } from './types';

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

    const maxValueMode = maxFieldId
        ? GaugeValueMode.FIELD
        : GaugeValueMode.FIXED;
    const maxField = getField(maxFieldId);

    const numericMetricsList = Object.values(numericMetrics ?? {});

    return (
        <Stack>
            <Config>
                <Config.Section>
                    <Config.Heading>Scale</Config.Heading>
                    <NumberInput
                        label="Minimum value"
                        description="Set the minimum value for the gauge scale"
                        value={min}
                        onChange={(value) => setMin(Number(value))}
                        placeholder="0"
                    />
                    <Group spacing="xs" align="flex-end">
                        {maxValueMode === GaugeValueMode.FIXED ? (
                            <NumberInput
                                label="Maximum value"
                                description="Set the maximum value for the gauge scale"
                                value={max}
                                onChange={(value) => setMax(Number(value))}
                                placeholder="100"
                                style={{ flex: 1 }}
                            />
                        ) : (
                            <FieldSelect
                                label="Maximum value"
                                description="Select a field to use as the maximum value"
                                item={maxField}
                                items={numericMetricsList}
                                onChange={(newValue) => {
                                    setMaxFieldId(
                                        newValue
                                            ? getItemId(newValue)
                                            : undefined,
                                    );
                                }}
                                hasGrouping
                                style={{ flex: 1 }}
                            />
                        )}
                        <SegmentedControl
                            size="xs"
                            value={maxValueMode}
                            onChange={(value) => {
                                if (value === GaugeValueMode.FIXED) {
                                    // When switching to fixed mode, clear the field selection
                                    setMaxFieldId(undefined);
                                } else {
                                    // When switching to field mode, set to first available field
                                    if (numericMetricsList.length > 0) {
                                        setMaxFieldId(
                                            getItemId(numericMetricsList[0]),
                                        );
                                    }
                                }
                            }}
                            data={[
                                {
                                    label: (
                                        <Tooltip
                                            label="Set the maximum value"
                                            withinPortal
                                            variant="xs"
                                        >
                                            <Center>Value</Center>
                                        </Tooltip>
                                    ),
                                    value: GaugeValueMode.FIXED,
                                },
                                {
                                    label: (
                                        <Tooltip
                                            label="Select a field to use as the maximum value"
                                            withinPortal
                                            variant="xs"
                                        >
                                            <Center>Field</Center>
                                        </Tooltip>
                                    ),
                                    value: GaugeValueMode.FIELD,
                                },
                            ]}
                        />
                    </Group>
                </Config.Section>
            </Config>
            <Config>
                <Config.Section>
                    <Config.Heading>Appearance</Config.Heading>

                    <Checkbox
                        label="Show axis labels"
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
