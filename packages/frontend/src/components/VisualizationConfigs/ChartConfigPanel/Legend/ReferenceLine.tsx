import {
    formatDate,
    getItemId,
    getItemLabelWithoutTableName,
    isCustomDimension,
    isDateItem,
    isDimension,
    isField,
    isNumericItem,
    isTableCalculation,
    TimeFrames,
    type CompiledDimension,
    type CustomDimension,
    type Field,
    type TableCalculation,
    type WeekDay,
} from '@lightdash/common';
import {
    Accordion,
    Center,
    Checkbox,
    Group,
    type MantineRadius,
    type MantineSize,
    SegmentedControl,
    Stack,
    TextInput,
    type TextInputProps,
} from '@mantine/core';
import {
    IconLayoutAlignLeft,
    IconLayoutAlignRight,
    IconLayoutAlignTop,
} from '@tabler/icons-react';
import dayjs from 'dayjs';
import { useCallback, useMemo, useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import FieldSelect from '../../../common/FieldSelect';
import FilterDatePicker from '../../../common/Filters/FilterInputs/FilterDatePicker';
import FilterMonthAndYearPicker from '../../../common/Filters/FilterInputs/FilterMonthAndYearPicker';
import FilterWeekPicker from '../../../common/Filters/FilterInputs/FilterWeekPicker';
import FilterYearPicker from '../../../common/Filters/FilterInputs/FilterYearPicker';
import { getFirstDayOfWeek } from '../../../common/Filters/utils/filterDateUtils';
import MantineIcon from '../../../common/MantineIcon';
import { type ReferenceLineField } from '../../../common/ReferenceLine';
import { isCartesianVisualizationConfig } from '../../../LightdashVisualization/types';
import { useVisualizationContext } from '../../../LightdashVisualization/useVisualizationContext';
import ColorSelector from '../../ColorSelector';
import { AccordionControl } from '../../common/AccordionControl';
import { Config } from '../../common/Config';
import classes from './ReferenceLine.module.css';

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
    label?: TextInputProps['label'];
    size?: MantineSize;
    radius?: MantineRadius;
};

const ReferenceLineValue: FC<ReferenceLineValueProps> = ({
    field,
    value,
    startOfWeek,
    disabled,
    onChange,
    label,
    size,
    radius = 'md',
}) => {
    const { t } = useTranslation('vizConfig');
    const inputProps = { label, size, radius };
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
                            {...inputProps}
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
                            {...inputProps}
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
                            {...inputProps}
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
                    {...inputProps}
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
            {...inputProps}
            size="xs"
            disabled={
                (!isNumericItem(field) &&
                    // We treat untyped table calculations as numeric
                    !(field && isTableCalculation(field) && !field.type)) ||
                disabled
            }
            title={
                isNumericItem(field)
                    ? ''
                    : t('referenceLines.fieldMustBeNumber')
            }
            value={value}
            onChange={(e) => {
                onChange(e.target.value);
            }}
            placeholder={t('referenceLines.lineValue')}
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
    const { t } = useTranslation('vizConfig');
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
            const fieldId = isField(item) ? getItemId(item) : item.name;
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
            const fieldId = isField(field) ? getItemId(field) : field.name;
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

    const currentLineConfig: UpdateReferenceLineProps = useMemo(
        () => ({
            value,
            field: selectedField,
            label,
            lineColor,
            dynamicValue: useAverage ? 'average' : undefined,
            labelPosition,
            lineId,
        }),
        [
            value,
            selectedField,
            label,
            lineColor,
            useAverage,
            labelPosition,
            lineId,
        ],
    );

    const isNumericField =
        selectedField &&
        (isNumericItem(selectedField) ||
            // We treat untyped table calculations as numeric
            (isTableCalculation(selectedField) && !selectedField.type));

    const averageAvailable = isNumericField && markLineKey === 'yAxis';
    const controlLabel = t('referenceLines.lineLabel', { index });
    const accordionValue = `${index}`;

    const description = useMemo(() => {
        if (!selectedField || !value) return undefined;
        return t('referenceLines.description', {
            field: getItemLabelWithoutTableName(selectedField),
            value,
        });
    }, [selectedField, value, t]);

    const onControlClick = useCallback(
        () =>
            isOpen ? removeItem(accordionValue) : addNewItem(accordionValue),
        [isOpen, removeItem, addNewItem, accordionValue],
    );

    const onColorChange = useCallback(
        (color: string) => {
            setLineColor(color);
            if (selectedField !== undefined)
                updateReferenceLine({
                    ...currentLineConfig,
                    lineColor: color,
                });
        },
        [selectedField, updateReferenceLine, currentLineConfig],
    );

    return (
        <Accordion.Item value={accordionValue}>
            <AccordionControl
                label={label || controlLabel}
                description={description}
                onControlClick={onControlClick}
                onRemove={() => removeReferenceLine(lineId)}
                extraControlElements={
                    <ColorSelector
                        color={lineColor}
                        swatches={colorPalette}
                        withAlpha
                        onColorChange={(c) => onColorChange(c)}
                    />
                }
            />

            <Accordion.Panel>
                <Stack gap="xs" className={classes.panelStack}>
                    <FieldSelect
                        size="xs"
                        label={
                            <Config.Label>
                                {t('referenceLines.field')}
                            </Config.Label>
                        }
                        item={selectedField}
                        items={fieldsInAxes}
                        placeholder={t('referenceLines.searchField')}
                        onChange={(newField) => {
                            setSelectedField(newField);
                            if (newField !== undefined)
                                updateReferenceLine({
                                    ...currentLineConfig,
                                    field: newField,
                                });
                        }}
                        hasGrouping
                    />

                    <Group wrap="nowrap" grow align="baseline" gap="sm">
                        <ReferenceLineValue
                            label={
                                <Config.Label>
                                    {t('referenceLines.value')}
                                </Config.Label>
                            }
                            field={selectedField}
                            size="xs"
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
                        <TextInput
                            label={
                                <Config.Label>
                                    {t('referenceLines.label')}
                                </Config.Label>
                            }
                            value={label}
                            size="xs"
                            placeholder={
                                useAverage && averageAvailable
                                    ? (value ?? t('referenceLines.average'))
                                    : (value ?? '')
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
                    <Group wrap="nowrap">
                        <Checkbox
                            flex="1"
                            size="xs"
                            label={
                                <Config.Label>
                                    {t('referenceLines.useSeriesAverage')}
                                </Config.Label>
                            }
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
                        <Group wrap="nowrap" flex="1" gap="sm">
                            <Config.Label className={classes.positionLabel}>
                                {t('referenceLines.position')}
                            </Config.Label>
                            <SegmentedControl
                                w="100%"
                                size="xs"
                                id="label-position"
                                value={labelPosition}
                                onChange={(newValue) => {
                                    const newPosition = newValue as
                                        | 'start'
                                        | 'middle'
                                        | 'end';
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
                                            <Center>
                                                <MantineIcon
                                                    icon={IconLayoutAlignLeft}
                                                />
                                            </Center>
                                        ),
                                    },
                                    {
                                        value: 'middle',
                                        label: (
                                            <Center>
                                                <MantineIcon
                                                    icon={IconLayoutAlignTop}
                                                />
                                            </Center>
                                        ),
                                    },
                                    {
                                        value: 'end',
                                        label: (
                                            <Center>
                                                <MantineIcon
                                                    icon={IconLayoutAlignRight}
                                                />
                                            </Center>
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
