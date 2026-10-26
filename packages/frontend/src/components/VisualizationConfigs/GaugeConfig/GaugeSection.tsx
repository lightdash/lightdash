import {
    getItemId,
    getItemLabelWithoutTableName,
    type GaugeSection,
} from '@lightdash/common';
import {
    Accordion,
    Center,
    Group,
    SegmentedControl,
    Stack,
    Tooltip,
} from '@mantine/core';
import { memo, type FC } from 'react';
import {
    getGaugeItem,
    selectNumericMetricsAndTableCalculations,
} from '../../../features/visualization/store';
import FieldSelect from '../../common/FieldSelect';
import {
    useVisualizationInputs,
    useVisualizationInputSelector,
} from '../../LightdashVisualization/useVisualizationContext';
import ColorSelector from '../ColorSelector';
import { AccordionControl } from '../common/AccordionControl';
import { DebouncedNumberInput } from './DebouncedNumberInput';
import { GaugeValueMode } from './types';

export type Props = {
    onClick: () => void;
    index: number;
    section: GaugeSection;
    onUpdate: (section: GaugeSection, changes: Partial<GaugeSection>) => void;
    onRemove: (index: number) => void;
};

const GaugeSectionComponent: FC<Props> = memo(
    ({ index, onClick, section, onUpdate, onRemove }) => {
        const { colorPalette, itemsMap } = useVisualizationInputs();
        const numericMetrics = useVisualizationInputSelector(
            selectNumericMetricsAndTableCalculations,
        );

        const minValueMode = section.minFieldId
            ? GaugeValueMode.FIELD
            : GaugeValueMode.FIXED;
        const maxValueMode = section.maxFieldId
            ? GaugeValueMode.FIELD
            : GaugeValueMode.FIXED;
        const minField = getGaugeItem(itemsMap, section.minFieldId);
        const maxField = getGaugeItem(itemsMap, section.maxFieldId);
        const numericMetricsList = Object.values(numericMetrics);

        const minLabel = minField
            ? getItemLabelWithoutTableName(minField)
            : section.min != null
              ? String(section.min)
              : undefined;
        const maxLabel = maxField
            ? getItemLabelWithoutTableName(maxField)
            : section.max != null
              ? String(section.max)
              : undefined;
        const description =
            minLabel !== undefined && maxLabel !== undefined
                ? `${minLabel} – ${maxLabel}`
                : undefined;

        return (
            <Accordion.Item value={`${index}`}>
                <AccordionControl
                    label={`Section ${index + 1}`}
                    description={description}
                    onControlClick={onClick}
                    onRemove={() => onRemove(index)}
                    extraControlElements={
                        <ColorSelector
                            color={section.color}
                            swatches={colorPalette}
                            onColorChange={(color) =>
                                onUpdate(section, { color })
                            }
                        />
                    }
                />
                <Accordion.Panel>
                    <Stack gap="md">
                        <Group gap="xs" align="flex-end">
                            {minValueMode === GaugeValueMode.FIXED ? (
                                <DebouncedNumberInput
                                    size="xs"
                                    label="Min value"
                                    description="Set the minimum value for the section"
                                    value={section.min}
                                    onCommit={(value) =>
                                        onUpdate(section, { min: value ?? 0 })
                                    }
                                    flex={1}
                                    decimalScale={2}
                                />
                            ) : (
                                <FieldSelect
                                    label="Min value"
                                    description="Select a field to use as the minimum value"
                                    item={minField}
                                    items={numericMetricsList}
                                    onChange={(newValue) => {
                                        onUpdate(section, {
                                            minFieldId: newValue
                                                ? getItemId(newValue)
                                                : undefined,
                                        });
                                    }}
                                    hasGrouping
                                    flex={1}
                                />
                            )}
                            <SegmentedControl
                                value={minValueMode}
                                onChange={(value) => {
                                    if (value === GaugeValueMode.FIXED) {
                                        onUpdate(section, {
                                            minFieldId: undefined,
                                        });
                                    } else {
                                        if (numericMetricsList.length > 0) {
                                            onUpdate(section, {
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
                                            <Tooltip label="Set the minimum value">
                                                <Center>Value</Center>
                                            </Tooltip>
                                        ),
                                        value: GaugeValueMode.FIXED,
                                    },
                                    {
                                        label: (
                                            <Tooltip label="Select a field to use as the maximum value">
                                                <Center>Field</Center>
                                            </Tooltip>
                                        ),
                                        value: GaugeValueMode.FIELD,
                                    },
                                ]}
                            />
                        </Group>

                        <Group gap="xs" align="flex-end">
                            {maxValueMode === GaugeValueMode.FIXED ? (
                                <DebouncedNumberInput
                                    size="xs"
                                    label="Max value"
                                    description="Set the maximum value for the section"
                                    value={section.max}
                                    onCommit={(value) =>
                                        onUpdate(section, { max: value ?? 0 })
                                    }
                                    decimalScale={2}
                                    flex={1}
                                />
                            ) : (
                                <FieldSelect
                                    label="Max value"
                                    description="Select a field to use as the maximum value"
                                    item={maxField}
                                    items={numericMetricsList}
                                    onChange={(newValue) => {
                                        onUpdate(section, {
                                            maxFieldId: newValue
                                                ? getItemId(newValue)
                                                : undefined,
                                        });
                                    }}
                                    hasGrouping
                                    flex={1}
                                />
                            )}
                            <SegmentedControl
                                value={maxValueMode}
                                onChange={(value) => {
                                    if (value === GaugeValueMode.FIXED) {
                                        onUpdate(section, {
                                            maxFieldId: undefined,
                                        });
                                    } else {
                                        if (numericMetricsList.length > 0) {
                                            onUpdate(section, {
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
                                            <Tooltip label="Set the maximum value">
                                                <Center>Value</Center>
                                            </Tooltip>
                                        ),
                                        value: GaugeValueMode.FIXED,
                                    },
                                    {
                                        label: (
                                            <Tooltip label="Select a field to use as the maximum value">
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
