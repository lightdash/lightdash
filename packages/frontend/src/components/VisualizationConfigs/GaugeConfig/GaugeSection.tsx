import { getItemId, type GaugeSection } from '@lightdash/common';
import {
    Accordion,
    Center,
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
import ColorSelector from '../ColorSelector';
import { AccordionControl } from '../common/AccordionControl';
import { GaugeValueMode } from './types';

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

        const minValueMode = section.minFieldId
            ? GaugeValueMode.FIELD
            : GaugeValueMode.FIXED;
        const maxValueMode = section.maxFieldId
            ? GaugeValueMode.FIELD
            : GaugeValueMode.FIXED;
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
                        <Group spacing="xs" align="flex-end">
                            {minValueMode === GaugeValueMode.FIXED ? (
                                <NumberInput
                                    label="Min value"
                                    description="Set the minimum value for the section"
                                    value={section.min}
                                    onChange={(value) =>
                                        onUpdate(index, { min: Number(value) })
                                    }
                                    style={{ flex: 1 }}
                                    precision={2}
                                    removeTrailingZeros={true}
                                />
                            ) : (
                                <FieldSelect
                                    label="Min value"
                                    description="Select a field to use as the minimum value"
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
                                    style={{ flex: 1 }}
                                />
                            )}
                            <SegmentedControl
                                value={minValueMode}
                                onChange={(value) => {
                                    if (value === GaugeValueMode.FIXED) {
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
                                    {
                                        label: (
                                            <Tooltip
                                                label="Set the minimum value"
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

                        <Group spacing="xs" align="flex-end">
                            {maxValueMode === GaugeValueMode.FIXED ? (
                                <NumberInput
                                    label="Max value"
                                    description="Set the maximum value for the section"
                                    value={section.max}
                                    onChange={(value) =>
                                        onUpdate(index, { max: Number(value) })
                                    }
                                    precision={2}
                                    removeTrailingZeros={true}
                                    style={{ flex: 1 }}
                                />
                            ) : (
                                <FieldSelect
                                    label="Max value"
                                    description="Select a field to use as the maximum value"
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
                                    style={{ flex: 1 }}
                                />
                            )}
                            <SegmentedControl
                                value={maxValueMode}
                                onChange={(value) => {
                                    if (value === GaugeValueMode.FIXED) {
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
                    </Stack>
                </Accordion.Panel>
            </Accordion.Item>
        );
    },
);

export default GaugeSectionComponent;
