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
    Accordion,
    ActionIcon,
    Box,
    Checkbox,
    Group,
    SegmentedControl,
    Stack,
    Text,
    TextInput,
    Tooltip,
} from '@mantine/core';
import { useHover } from '@mantine/hooks';
import {
    IconLayoutAlignLeft,
    IconLayoutAlignRight,
    IconLayoutAlignTop,
    IconTrash,
} from '@tabler/icons-react';
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
import { Config } from '../common/Config';

type UpdateReferenceLineProps = {
    value?: string;
    field?: Field | TableCalculation | CompiledDimension | CustomDimension;
    label: string | undefined;
    lineColor: string;
    dynamicValue?: 'average';
    labelPosition: 'start' | 'middle' | 'end';
    lineId: string;
};

export type ReferenceLineProps = {
    isOpen: boolean;
    addNewItem: (index: string) => void;
    removeItem: (index: string) => void;
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
                            disabled={disabled}
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
                            disabled={disabled}
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
                            disabled={disabled}
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
                    disabled={disabled}
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
            disabled={!isNumericItem(field) || disabled}
            size="xs"
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
    isOpen,
    addNewItem,
    removeItem,
    referenceLine,
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

    const currentLineConfig: UpdateReferenceLineProps = {
        value,
        field: selectedField,
        label,
        lineColor,
        dynamicValue: useAverage ? 'average' : undefined,
        labelPosition,
        lineId: lineId,
    };

    const isNumericField = selectedField && isNumericItem(selectedField);

    const averageAvailable = isNumericField && markLineKey === 'yAxis';
    const controlLabel = `Line ${index}`;
    const accordionValue = `${index}`;

    const { ref, hovered } = useHover<HTMLButtonElement>();

    return (
        <Accordion.Item value={accordionValue}>
            <Accordion.Control
                onClick={() =>
                    isOpen
                        ? removeItem(accordionValue)
                        : addNewItem(accordionValue)
                }
                ref={ref}
            >
                <Group spacing="xs" position="apart">
                    <Group spacing="xs">
                        <Box onClick={(e) => e.stopPropagation()}>
                            <ColorSelector
                                color={lineColor}
                                swatches={colorPalette}
                                onColorChange={(color) => {
                                    setLineColor(color);
                                    if (selectedField !== undefined)
                                        updateReferenceLine({
                                            ...currentLineConfig,
                                            lineColor: color,
                                        });
                                }}
                            />
                        </Box>
                        <Text fw={500} size="xs">
                            {controlLabel}
                        </Text>
                        <Tooltip
                            variant="xs"
                            label="Remove reference line"
                            position="left"
                            withinPortal
                        >
                            <ActionIcon
                                onClick={() => removeReferenceLine(lineId)}
                                sx={{
                                    visibility: hovered ? 'visible' : 'hidden',
                                }}
                            >
                                <MantineIcon icon={IconTrash} />
                            </ActionIcon>
                        </Tooltip>
                    </Group>
                </Group>
            </Accordion.Control>
            <Accordion.Panel>
                <Stack
                    bg={'gray.0'}
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
                            if (newField !== undefined)
                                updateReferenceLine({
                                    ...currentLineConfig,
                                    field: newField,
                                });
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
                        <TextInput
                            label="Label"
                            // disabled={!value}
                            value={label}
                            placeholder={
                                useAverage && averageAvailable
                                    ? value ?? 'Average'
                                    : value ?? ''
                            }
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
                    </Group>
                    <Group noWrap position="apart">
                        <Checkbox
                            label="Use series average"
                            disabled={!averageAvailable}
                            checked={useAverage && averageAvailable}
                            onChange={(newState) => {
                                setUseAverage(newState.target.checked);
                                if (selectedField !== undefined) {
                                    updateReferenceLine({
                                        ...currentLineConfig,
                                        dynamicValue: newState.target.checked
                                            ? 'average'
                                            : undefined,
                                    });
                                }
                            }}
                        />
                        <Group noWrap>
                            <Config.Label>Position</Config.Label>
                            <SegmentedControl
                                size="xs"
                                id="label-position"
                                value={labelPosition}
                                onChange={(
                                    newPosition: 'start' | 'middle' | 'end',
                                ) => {
                                    setLabelPosition(newPosition);

                                    updateReferenceLine({
                                        ...currentLineConfig,
                                        labelPosition: newPosition,
                                    });
                                }}
                                data={[
                                    {
                                        value: 'start',
                                        label: (
                                            <MantineIcon
                                                icon={IconLayoutAlignLeft}
                                            />
                                        ),
                                    },
                                    {
                                        value: 'middle',
                                        label: (
                                            <MantineIcon
                                                icon={IconLayoutAlignTop}
                                            />
                                        ),
                                    },
                                    {
                                        value: 'end',
                                        label: (
                                            <MantineIcon
                                                icon={IconLayoutAlignRight}
                                            />
                                        ),
                                    },
                                ]}
                            />
                        </Group>
                    </Group>
                </Stack>
            </Accordion.Panel>
        </Accordion.Item>
    );
};
