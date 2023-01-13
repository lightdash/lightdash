import { Button, FormGroup, InputGroup } from '@blueprintjs/core';
import { DateInput2 } from '@blueprintjs/datetime2';
import {
    AdditionalMetric,
    CompiledDimension,
    Field,
    fieldId as getFieldId,
    formatDate,
    getDateFormat,
    isAdditionalMetric,
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
import FieldAutoComplete from '../../common/Filters/FieldAutoComplete';
import MonthAndYearInput from '../../common/MonthAndYearInput';
import { ReferenceLineField } from '../../common/ReferenceLine';
import { Flex } from '../../common/ResourceList/ResourceTable/ResourceTable.styles';
import WeekPicker from '../../common/WeekPicker';
import YearInput from '../../common/YearInput';
import { useVisualizationContext } from '../../LightdashVisualization/VisualizationProvider';
import SeriesColorPicker from '../Series/SeriesColorPicker';
import { SectionTitle } from './Legend.styles';
import { CollapseWrapper, DeleteButtonTooltip } from './ReferenceLine.styles';

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
                            startOfWeek={startOfWeek}
                            onChange={(dateValue: Date) => {
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
                        <Flex>
                            {' '}
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
                        </Flex>
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
        <InputGroup
            fill
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
        cartesianConfig: { dirtyLayout, dirtyEchartsConfig },
    } = useVisualizationContext();

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
        return 'xAxis' in referenceLine.data ? 'xAxis' : 'yAxis';
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
        <>
            <Flex>
                <Button
                    minimal
                    icon={isOpen ? 'chevron-down' : 'chevron-right'}
                    onClick={() => setIsOpen(!isOpen)}
                />
                <SectionTitle>Line {index}</SectionTitle>

                <DeleteButtonTooltip content="Remove reference line">
                    <Button
                        small
                        minimal
                        icon="cross"
                        onClick={() =>
                            removeReferenceLine(referenceLine.data.name)
                        }
                    />
                </DeleteButtonTooltip>
            </Flex>
            <CollapseWrapper isOpen={isOpen}>
                <FormGroup label="Field">
                    <FieldAutoComplete
                        fields={fieldsInAxes}
                        activeField={selectedField}
                        onChange={(item) => {
                            setSelectedField(item);

                            if (value !== undefined)
                                updateReferenceLine(
                                    value,
                                    item,
                                    label,
                                    lineColor,
                                    referenceLine.data.name,
                                );
                        }}
                    />
                </FormGroup>
                <FormGroup label="Value">
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
                </FormGroup>

                <FormGroup label="Label">
                    <InputGroup
                        fill
                        disabled={!value}
                        value={label}
                        placeholder={value}
                        onChange={(e) => {
                            setLabel(e.target.value);
                            debouncedUpdateLabel(e.target.value);
                        }}
                    />
                </FormGroup>

                <FormGroup label="Color">
                    <SeriesColorPicker
                        color={lineColor}
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
                </FormGroup>
            </CollapseWrapper>
        </>
    );
};
