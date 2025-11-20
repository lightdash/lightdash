import { getItemId, type GaugeSection } from '@lightdash/common';
import { Accordion, NumberInput, SegmentedControl, Stack } from '@mantine/core';
import { memo, type FC } from 'react';
import FieldSelect from '../../common/FieldSelect';
import { isGaugeVisualizationConfig } from '../../LightdashVisualization/types';
import { useVisualizationContext } from '../../LightdashVisualization/useVisualizationContext';
import ColorSelector from '../ColorSelector';
import { AccordionControl } from '../common/AccordionControl';

export type Props = {
    onClick: () => void;
    index: number;
    section: GaugeSection;
    onUpdate: (index: number, updatedSection: Partial<GaugeSection>) => void;
    onRemove: (index: number) => void;
};

const GaugeSectionComponent: FC<Props> = memo(
    ({ index, onClick, section, onUpdate, onRemove }) => {
        const { colorPalette, visualizationConfig } = useVisualizationContext();

        if (!isGaugeVisualizationConfig(visualizationConfig)) {
            return null;
        }

        const {
            chartConfig: { getField },
            numericMetrics,
        } = visualizationConfig;

        const minValueMode = section.minFieldId ? 'metric' : 'fixed';
        const maxValueMode = section.maxFieldId ? 'metric' : 'fixed';
        const minField = getField(section.minFieldId);
        const maxField = getField(section.maxFieldId);
        const numericMetricsList = Object.values(numericMetrics ?? {});

        return (
            <Accordion.Item value={`${index}`}>
                <AccordionControl
                    label={`Section ${index + 1}`}
                    onControlClick={onClick}
                    onRemove={() => onRemove(index)}
                    extraControlElements={
                        <ColorSelector
                            color={section.color}
                            swatches={colorPalette}
                            onColorChange={(color) =>
                                onUpdate(index, { color })
                            }
                        />
                    }
                />
                <Accordion.Panel>
                    <Stack spacing="md">
                        <Stack spacing="xs">
                            <SegmentedControl
                                value={minValueMode}
                                onChange={(value) => {
                                    const newMode = value as 'fixed' | 'metric';
                                    if (newMode === 'fixed') {
                                        onUpdate(index, {
                                            minFieldId: undefined,
                                        });
                                    } else {
                                        if (numericMetricsList.length > 0) {
                                            onUpdate(index, {
                                                minFieldId: getItemId(
                                                    numericMetricsList[0],
                                                ),
                                            });
                                        }
                                    }
                                }}
                                data={[
                                    { label: 'Fixed min', value: 'fixed' },
                                    { label: 'From metric', value: 'metric' },
                                ]}
                                fullWidth
                            />
                            {minValueMode === 'fixed' ? (
                                <NumberInput
                                    label="Min Value"
                                    value={section.min}
                                    onChange={(value) =>
                                        onUpdate(index, { min: Number(value) })
                                    }
                                />
                            ) : (
                                <FieldSelect
                                    label="Min Value Metric"
                                    description="Select a metric to use as the minimum value"
                                    item={minField}
                                    items={numericMetricsList}
                                    onChange={(newValue) => {
                                        onUpdate(index, {
                                            minFieldId: newValue
                                                ? getItemId(newValue)
                                                : undefined,
                                        });
                                    }}
                                    hasGrouping
                                />
                            )}
                        </Stack>

                        <Stack spacing="xs">
                            <SegmentedControl
                                value={maxValueMode}
                                onChange={(value) => {
                                    const newMode = value as 'fixed' | 'metric';
                                    if (newMode === 'fixed') {
                                        onUpdate(index, {
                                            maxFieldId: undefined,
                                        });
                                    } else {
                                        if (numericMetricsList.length > 0) {
                                            onUpdate(index, {
                                                maxFieldId: getItemId(
                                                    numericMetricsList[0],
                                                ),
                                            });
                                        }
                                    }
                                }}
                                data={[
                                    { label: 'Fixed max', value: 'fixed' },
                                    { label: 'From metric', value: 'metric' },
                                ]}
                                fullWidth
                            />
                            {maxValueMode === 'fixed' ? (
                                <NumberInput
                                    label="Max Value"
                                    value={section.max}
                                    onChange={(value) =>
                                        onUpdate(index, { max: Number(value) })
                                    }
                                />
                            ) : (
                                <FieldSelect
                                    label="Max Value Metric"
                                    description="Select a metric to use as the maximum value"
                                    item={maxField}
                                    items={numericMetricsList}
                                    onChange={(newValue) => {
                                        onUpdate(index, {
                                            maxFieldId: newValue
                                                ? getItemId(newValue)
                                                : undefined,
                                        });
                                    }}
                                    hasGrouping
                                />
                            )}
                        </Stack>
                    </Stack>
                </Accordion.Panel>
            </Accordion.Item>
        );
    },
);

export default GaugeSectionComponent;
