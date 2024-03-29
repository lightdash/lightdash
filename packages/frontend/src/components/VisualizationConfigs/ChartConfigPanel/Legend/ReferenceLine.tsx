import {
    fieldId as getFieldId,
    formatDate,
    isCustomDimension,
    isDateItem,
    isDimension,
    isField,
    isNumericItem,
    TimeFrames,
    type CompiledDimension,
    type CustomDimension,
    type Field,
    type TableCalculation,
    type WeekDay,
} from '@lightdash/common';
import dayjs from 'dayjs';
import { useMemo, useState, type FC } from 'react';

import {
    ActionIcon,
    Box,
    Checkbox,
    Collapse,
    ColorInput,
    Flex,
    Group,
    SegmentedControl,
    Stack,
    Text,
    TextInput,
    Tooltip,
} from '@mantine/core';
import { IconChevronDown, IconChevronUp, IconX } from '@tabler/icons-react';
import FieldSelect from '../../../common/FieldSelect';
import FilterDatePicker from '../../../common/Filters/FilterInputs/FilterDatePicker';
import FilterMonthAndYearPicker from '../../../common/Filters/FilterInputs/FilterMonthAndYearPicker';
import FilterWeekPicker from '../../../common/Filters/FilterInputs/FilterWeekPicker';
import FilterYearPicker from '../../../common/Filters/FilterInputs/FilterYearPicker';
import { getFirstDayOfWeek } from '../../../common/Filters/utils/filterDateUtils';
import MantineIcon from '../../../common/MantineIcon';
import { type ReferenceLineField } from '../../../common/ReferenceLine';
import { isCartesianVisualizationConfig } from '../../../LightdashVisualization/VisualizationConfigCartesian';
import { useVisualizationContext } from '../../../LightdashVisualization/VisualizationProvider';

type UpdateReferenceLineProps = {
    value?: string;
    field?: Field | TableCalculation | CompiledDimension | CustomDimension;
    label: string | undefined;
    lineColor: string;
    useAverage?: boolean;
    labelPosition: 'start' | 'middle' | 'end';
    lineId: string;
};

export type ReferenceLineProps = {
    index: number;
    items: (Field | TableCalculation | CompiledDimension | CustomDimension)[];
    referenceLine: ReferenceLineField;
    startOfWeek: WeekDay | undefined;
    updateReferenceLine: (updateProps: UpdateReferenceLineProps) => void;
    removeReferenceLine: (lineId: string) => void;
    isDefaultOpen: boolean;
};

type ReferenceLineValueProps = {
    field:
        | Field
        | TableCalculation
        | CompiledDimension
        | CustomDimension
        | undefined;
    value: string | undefined;
    startOfWeek: WeekDay | undefined;
    disabled?: boolean;
    onChange: (value: string) => void;
};

const ReferenceLineValue: FC<ReferenceLineValueProps> = ({
    field,
    value,
    startOfWeek,
    disabled,
    onChange,
}) => {
    if (isCustomDimension(field)) return <></>;
    if (isDateItem(field)) {
        if (isDimension(field) && field.timeInterval) {
            // Uses the current date if the provided value is invalid
            const parsedDate = dayjs(value).isValid()
                ? dayjs(value).toDate()
                : dayjs().toDate();

            switch (field.timeInterval.toUpperCase()) {
                case TimeFrames.WEEK:
                    return (
                        <FilterWeekPicker
                            size="sm"
                            disabled={disabled}
                            value={parsedDate}
                            firstDayOfWeek={getFirstDayOfWeek(startOfWeek)}
                            onChange={(dateValue) => {
                                if (!dateValue) return;

                                onChange(
                                    formatDate(
                                        dateValue,
                                        TimeFrames.WEEK,
                                        false,
                                    ),
                                );
                            }}
                        />
                    );
                case TimeFrames.MONTH:
                    return (
                        <FilterMonthAndYearPicker
                            size="sm"
                            disabled={disabled}
                            value={parsedDate}
                            onChange={(dateValue: Date) => {
                                onChange(
                                    formatDate(
                                        dateValue,
                                        TimeFrames.MONTH,
                                        false,
                                    ),
                                );
                            }}
                        />
                    );

                case TimeFrames.YEAR:
                    return (
                        <FilterYearPicker
                            size="sm"
                            disabled={disabled}
                            value={parsedDate}
                            onChange={(dateValue: Date) => {
                                onChange(
                                    formatDate(
                                        dateValue,
                                        TimeFrames.YEAR,
                                        false,
                                    ),
                                );
                            }}
                        />
                    );
            }

            return (
                <FilterDatePicker
                    size="sm"
                    disabled={disabled}
                    value={parsedDate}
                    firstDayOfWeek={getFirstDayOfWeek(startOfWeek)}
                    onChange={(newValue) => {
                        onChange(formatDate(newValue, TimeFrames.DAY, false));
                    }}
                />
            );
        }
    }

    return (
        <TextInput
            disabled={!isNumericItem(field) || disabled}
            title={
                isNumericItem(field)
                    ? ''
                    : 'Selected field must be of type Number'
            }
            value={value}
            onChange={(e) => {
                onChange(e.target.value);
            }}
            placeholder="Line value"
        />
    );
};

export const ReferenceLine: FC<ReferenceLineProps> = ({
    index,
    items,
    referenceLine,
    isDefaultOpen,
    startOfWeek,
    updateReferenceLine,
    removeReferenceLine,
}) => {
    const { visualizationConfig, colorPalette } = useVisualizationContext();

    const isCartesianChart =
        isCartesianVisualizationConfig(visualizationConfig);

    const fieldsInAxes = useMemo(() => {
        if (!isCartesianChart) return [];

        const { dirtyLayout } = visualizationConfig.chartConfig;

        const fieldNames = [
            dirtyLayout?.xField,
            ...(dirtyLayout?.yField || []),
        ];
        return items.filter((item) => {
            const fieldId = isField(item) ? getFieldId(item) : item.name;
            // Filter numeric and date fields (remove if we start supporting other types)

            // TODO implement reference lines for custom dimensions
            if (isCustomDimension(item)) return false;
            return (
                fieldNames.includes(fieldId) &&
                (isNumericItem(item) || isDateItem(item))
            );
        });
    }, [isCartesianChart, items, visualizationConfig]);

    const markLineKey = useMemo(() => {
        return referenceLine.data.xAxis !== undefined ? 'xAxis' : 'yAxis';
    }, [referenceLine]);

    const [value, setValue] = useState<string | undefined>(
        referenceLine.data[markLineKey] || referenceLine.data.type,
    );

    const [label, setLabel] = useState<string | undefined>(
        referenceLine.data.name,
    );
    const [isOpen, setIsOpen] = useState<boolean>(
        isDefaultOpen || referenceLine.fieldId === undefined,
    );
    const [lineColor, setLineColor] = useState<string>(
        referenceLine.data.lineStyle?.color || '#000',
    );
    const [labelPosition, setLabelPosition] = useState<
        'start' | 'middle' | 'end'
    >(referenceLine.data.label?.position || 'end');

    const selectedFieldDefault = useMemo(() => {
        if (markLineKey === undefined) return;
        return fieldsInAxes.find((field) => {
            const fieldId = isField(field) ? getFieldId(field) : field.name;
            return fieldId === referenceLine.fieldId;
        });
    }, [fieldsInAxes, markLineKey, referenceLine.fieldId]);

    const [selectedField, setSelectedField] = useState<
        | Field
        | TableCalculation
        | CompiledDimension
        | CustomDimension
        | undefined
    >(selectedFieldDefault);

    const [useAverage, setUseAverage] = useState<boolean>(false);

    const lineId =
        referenceLine.data.uuid ||
        referenceLine.data.value ||
        referenceLine.data.name ||
        '';

    const currentLineConfig = {
        value,
        field: selectedField,
        label,
        lineColor,
        useAverage,
        labelPosition,
        lineId: lineId,
    };

    const isDateField =
        selectedField &&
        !isCustomDimension(selectedField) &&
        isDateItem(selectedField);

    const averageAvailable = !isDateField && markLineKey === 'yAxis';

    return (
        <Stack spacing="xs">
            <Group noWrap position="apart">
                <Group spacing="xs">
                    <ActionIcon onClick={() => setIsOpen(!isOpen)} size="sm">
                        <MantineIcon
                            icon={isOpen ? IconChevronUp : IconChevronDown}
                        />
                    </ActionIcon>

                    <Text fw={500}>Line {index}</Text>
                </Group>

                <Tooltip
                    label="Remove reference line"
                    position="left"
                    withinPortal
                >
                    <ActionIcon
                        onClick={() => removeReferenceLine(lineId)}
                        size="sm"
                    >
                        <MantineIcon icon={IconX} />
                    </ActionIcon>
                </Tooltip>
            </Group>
            <Collapse in={isOpen}>
                <Stack
                    bg={'gray.0'}
                    p="sm"
                    spacing="sm"
                    sx={(theme) => ({
                        borderRadius: theme.radius.sm,
                    })}
                >
                    <FieldSelect
                        label="Field"
                        item={selectedField}
                        items={fieldsInAxes}
                        placeholder="Search field..."
                        onChange={(newField) => {
                            setSelectedField(newField);

                            if (newField !== undefined)
                                updateReferenceLine({
                                    ...currentLineConfig,
                                    field: newField,
                                });
                        }}
                    />
                    <Box>
                        <Text fw={600} mb={3}>
                            Value
                        </Text>
                        <Flex w="100%" align="center">
                            <Box style={{ flex: 3 }}>
                                <ReferenceLineValue
                                    field={selectedField}
                                    startOfWeek={startOfWeek}
                                    value={value}
                                    disabled={useAverage && averageAvailable}
                                    onChange={(newValue: string) => {
                                        setValue(newValue);
                                        if (selectedField !== undefined)
                                            updateReferenceLine({
                                                ...currentLineConfig,
                                                value: newValue,
                                            });
                                    }}
                                />
                            </Box>
                            <Text
                                color="gray"
                                style={{ flex: 1, textAlign: 'center' }}
                            >
                                OR
                            </Text>
                            <Checkbox
                                style={{ flex: 4 }}
                                label="Use series average"
                                disabled={!averageAvailable}
                                checked={useAverage}
                                onChange={(newState) => {
                                    setUseAverage(newState.target.checked);
                                    if (selectedField !== undefined) {
                                        updateReferenceLine({
                                            ...currentLineConfig,
                                            useAverage: newState.target.checked,
                                        });
                                    }
                                }}
                            />
                        </Flex>
                    </Box>
                    <TextInput
                        label="Label"
                        disabled={!value && !useAverage}
                        value={label}
                        placeholder={value}
                        onChange={(e) => {
                            setLabel(e.target.value);
                        }}
                        onBlur={(newValue) => {
                            setLabel(newValue.target.value);
                            if (selectedField)
                                updateReferenceLine({
                                    ...currentLineConfig,
                                    label: newValue.target.value,
                                });
                        }}
                    />

                    <SegmentedControl
                        size="xs"
                        id="label-position"
                        value={labelPosition}
                        onChange={(newPosition: 'start' | 'middle' | 'end') => {
                            setLabelPosition(newPosition);

                            updateReferenceLine({
                                ...currentLineConfig,
                                labelPosition: newPosition,
                            });
                        }}
                        data={[
                            { value: 'start', label: 'Start' },
                            { value: 'middle', label: 'Middle' },
                            { value: 'end', label: 'End' },
                        ]}
                    />

                    <ColorInput
                        label="Color"
                        value={lineColor}
                        withinPortal={false}
                        withEyeDropper={false}
                        format="hex"
                        swatches={colorPalette}
                        swatchesPerRow={8}
                        onChange={(color) => {
                            setLineColor(color);
                            if (selectedField !== undefined)
                                updateReferenceLine({
                                    ...currentLineConfig,
                                    lineColor: color,
                                });
                        }}
                    />
                </Stack>
            </Collapse>
        </Stack>
    );
};
