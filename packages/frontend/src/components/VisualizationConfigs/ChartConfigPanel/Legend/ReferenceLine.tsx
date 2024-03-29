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
import {
    ActionIcon,
    Box,
    Collapse,
    Group,
    Stack,
    Text,
    TextInput,
    Tooltip,
} from '@mantine/core';
import { IconChevronDown, IconChevronUp, IconX } from '@tabler/icons-react';
import dayjs from 'dayjs';
import { useMemo, useState, type FC } from 'react';
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
import ColorSelector from '../../ColorSelector';

type Props = {
    index: number;
    items: (Field | TableCalculation | CompiledDimension | CustomDimension)[];
    referenceLine: ReferenceLineField;
    startOfWeek: WeekDay | undefined;
    updateReferenceLine: (
        value: string,
        field: Field | TableCalculation | CompiledDimension | CustomDimension,
        label: string | undefined,
        lineColor: string,
        lineId: string,
    ) => void;
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
    onChange: (value: string) => void;
};

const ReferenceLineValue: FC<ReferenceLineValueProps> = ({
    field,
    value,
    startOfWeek,
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
                            size="xs"
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
                            size="xs"
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
                            size="xs"
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
                    size="xs"
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
            size="xs"
            disabled={!isNumericItem(field)}
            title={
                isNumericItem(field)
                    ? ''
                    : 'Selected field must be of type Number'
            }
            value={value}
            onChange={(e) => {
                onChange(e.target.value);
            }}
            placeholder="Add value"
        />
    );
};

export const ReferenceLine: FC<Props> = ({
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
        referenceLine.data[markLineKey],
    );

    const [label, setLabel] = useState<string | undefined>(
        referenceLine.data.label?.formatter,
    );
    const [isOpen, setIsOpen] = useState<boolean>(
        isDefaultOpen || referenceLine.fieldId === undefined,
    );
    const [lineColor, setLineColor] = useState<string>(
        referenceLine.data.lineStyle?.color || '#000',
    );

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

    return (
        <Stack spacing="xs">
            <Group noWrap position="apart">
                <Group spacing="xs">
                    <ActionIcon onClick={() => setIsOpen(!isOpen)}>
                        <MantineIcon
                            icon={isOpen ? IconChevronUp : IconChevronDown}
                        />
                    </ActionIcon>

                    <Text fw={500}>Line {index}</Text>
                    <ColorSelector
                        color={lineColor}
                        swatches={colorPalette}
                        onColorChange={(color) => {
                            setLineColor(color);
                            if (
                                value !== undefined &&
                                selectedField !== undefined
                            )
                                updateReferenceLine(
                                    value,
                                    selectedField,
                                    label,
                                    color,
                                    referenceLine.data.value ||
                                        referenceLine.data.name,
                                );
                        }}
                    />
                </Group>

                <Tooltip
                    label="Remove reference line"
                    position="left"
                    withinPortal
                >
                    <ActionIcon
                        onClick={() =>
                            removeReferenceLine(
                                referenceLine.data.value ||
                                    referenceLine.data.name,
                            )
                        }
                    >
                        <MantineIcon icon={IconX} />
                    </ActionIcon>
                </Tooltip>
            </Group>
            <Collapse in={isOpen}>
                <Stack
                    bg={'gray.0'}
                    p="sm"
                    pb="md" // Visually, it looks better with a bit more padding on the bottom
                    spacing="xs"
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

                            if (value !== undefined && newField !== undefined)
                                updateReferenceLine(
                                    value,
                                    newField,
                                    label,
                                    lineColor,
                                    referenceLine.data.value ||
                                        referenceLine.data.name,
                                );
                        }}
                    />

                    <Group noWrap grow align="baseline">
                        <Box>
                            <Text fz="xs" fw={500}>
                                Value
                            </Text>
                            <ReferenceLineValue
                                field={selectedField}
                                startOfWeek={startOfWeek}
                                value={value}
                                onChange={(newValue: string) => {
                                    setValue(newValue);
                                    if (selectedField !== undefined)
                                        updateReferenceLine(
                                            newValue,
                                            selectedField,
                                            label,
                                            lineColor,
                                            referenceLine.data.value ||
                                                referenceLine.data.name,
                                        );
                                }}
                            />
                        </Box>
                        <TextInput
                            label="Label"
                            disabled={!value}
                            value={label}
                            placeholder={value ?? 'Untitled'}
                            onChange={(e) => {
                                setLabel(e.target.value);
                            }}
                            onBlur={() => {
                                if (value && selectedField)
                                    updateReferenceLine(
                                        value,
                                        selectedField,
                                        label,
                                        lineColor,
                                        referenceLine.data.value ||
                                            referenceLine.data.name,
                                    );
                            }}
                        />
                    </Group>
                </Stack>
            </Collapse>
        </Stack>
    );
};
