import { DateInput2 } from '@blueprintjs/datetime2';
import {
    CompiledDimension,
    ECHARTS_DEFAULT_COLORS,
    Field,
    fieldId as getFieldId,
    formatDate,
    getDateFormat,
    isDateItem,
    isDimension,
    isField,
    isNumericItem,
    TableCalculation,
    TimeFrames,
    WeekDay,
} from '@lightdash/common';
import debounce from 'lodash/debounce';
import moment from 'moment';
import { FC, useCallback, useMemo, useState } from 'react';

import {
    ActionIcon,
    Box,
    Collapse,
    ColorInput,
    Group,
    Stack,
    Text,
    TextInput,
    Tooltip,
} from '@mantine/core';
import { IconChevronDown, IconChevronUp, IconX } from '@tabler/icons-react';
import { useOrganization } from '../../../../hooks/organization/useOrganization';
import FieldSelect from '../../../common/FieldSelect';
import MantineIcon from '../../../common/MantineIcon';
import MonthAndYearInput from '../../../common/MonthAndYearInput';
import { ReferenceLineField } from '../../../common/ReferenceLine';
import WeekPicker from '../../../common/WeekPicker';
import YearInput from '../../../common/YearInput';
import { useVisualizationContext } from '../../../LightdashVisualization/VisualizationProvider';

type Props = {
    index: number;
    items: (Field | TableCalculation | CompiledDimension)[];
    referenceLine: ReferenceLineField;
    startOfWeek: WeekDay | null | undefined;
    updateReferenceLine: (
        value: string,
        field: Field | TableCalculation | CompiledDimension,
        label: string | undefined,
        lineColor: string,
        lineId: string,
    ) => void;
    removeReferenceLine: (lineId: string) => void;
    isDefaultOpen: boolean;
};

type ReferenceLineValueProps = {
    field: Field | TableCalculation | CompiledDimension | undefined;
    value: string | undefined;
    startOfWeek: WeekDay | null | undefined;
    onChange: (value: string) => void;
};

const ReferenceLineValue: FC<ReferenceLineValueProps> = ({
    field,
    value,
    startOfWeek,
    onChange,
}) => {
    if (isDateItem(field)) {
        if (isDimension(field) && field.timeInterval) {
            switch (field.timeInterval.toUpperCase()) {
                case TimeFrames.WEEK:
                    return (
                        <WeekPicker
                            value={moment(value).toDate()}
                            popoverProps={{ usePortal: false }}
                            startOfWeek={startOfWeek}
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
                        <Group noWrap spacing={0}>
                            <MonthAndYearInput
                                value={moment(value).toDate()}
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
                        </Group>
                    );

                case TimeFrames.YEAR:
                    return (
                        <YearInput
                            value={moment(value).toDate()}
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
                <DateInput2
                    fill
                    value={value}
                    popoverProps={{ usePortal: false }}
                    formatDate={(dateValue: Date) =>
                        formatDate(dateValue, undefined, false)
                    }
                    parseDate={(
                        str: string,
                        timeInterval: TimeFrames | undefined = TimeFrames.DAY,
                    ) => {
                        return moment(
                            str,
                            getDateFormat(timeInterval),
                        ).toDate();
                    }}
                    defaultValue={new Date().toString()}
                    onChange={(dateValue: string | null) => {
                        if (dateValue) onChange(dateValue);
                    }}
                />
            );
        }
    }

    return (
        <TextInput
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
            placeholder="Add value for the reference line"
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
    const {
        cartesianConfig: { dirtyLayout },
    } = useVisualizationContext();
    const { data: org } = useOrganization();

    const defaultColors = useMemo(
        () => org?.chartColors ?? ECHARTS_DEFAULT_COLORS,
        [org],
    );

    const fieldsInAxes = useMemo(() => {
        const fieldNames = [
            dirtyLayout?.xField,
            ...(dirtyLayout?.yField || []),
        ];
        return items.filter((item) => {
            const fieldId = isField(item) ? getFieldId(item) : item.name;
            // Filter numeric and date fields (remove if we start supporting other types)
            return (
                fieldNames.includes(fieldId) &&
                (isNumericItem(item) || isDateItem(item))
            );
        });
    }, [items, dirtyLayout]);

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
        Field | TableCalculation | CompiledDimension | undefined
    >(selectedFieldDefault);

    // eslint-disable-next-line react-hooks/exhaustive-deps
    const debouncedUpdateLabel = useCallback(
        debounce((updatedLabel: string) => {
            if (value !== undefined && selectedField !== undefined)
                updateReferenceLine(
                    value,
                    selectedField,
                    updatedLabel,
                    lineColor,
                    referenceLine.data.name,
                );
        }, 500),
        [value, selectedField, updateReferenceLine],
    );

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

                <Tooltip label="Remove reference line" position="left">
                    <ActionIcon
                        onClick={() =>
                            removeReferenceLine(referenceLine.data.name)
                        }
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

                            if (value !== undefined && newField !== undefined)
                                updateReferenceLine(
                                    value,
                                    newField,
                                    label,
                                    lineColor,
                                    referenceLine.data.name,
                                );
                        }}
                    />
                    <Box>
                        <Text fw={600} mb={3}>
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
                                        referenceLine.data.name,
                                    );
                            }}
                        />
                    </Box>
                    <TextInput
                        label="Label"
                        disabled={!value}
                        value={label}
                        placeholder={value}
                        onChange={(e) => {
                            setLabel(e.target.value);
                            debouncedUpdateLabel(e.target.value);
                        }}
                    />

                    <ColorInput
                        label="Color"
                        value={lineColor}
                        withinPortal={false}
                        withEyeDropper={false}
                        format="hex"
                        swatches={defaultColors}
                        swatchesPerRow={defaultColors.length}
                        onChange={(color) => {
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
                                    referenceLine.data.name,
                                );
                        }}
                    />
                </Stack>
            </Collapse>
        </Stack>
    );
};
