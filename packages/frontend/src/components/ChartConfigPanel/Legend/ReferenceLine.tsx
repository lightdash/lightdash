import { Button, FormGroup, InputGroup } from '@blueprintjs/core';
import { DateInput2 } from '@blueprintjs/datetime2';
import {
    CompiledDimension,
    Field,
    fieldId as getFieldId,
    formatDate,
    getDateFormat,
    isAdditionalMetric,
    isDateItem,
    isField,
    isNumericItem,
    TableCalculation,
    TimeFrames,
} from '@lightdash/common';
import debounce from 'lodash/debounce';
import moment from 'moment';
import { FC, useCallback, useMemo, useState } from 'react';
import FieldAutoComplete from '../../common/Filters/FieldAutoComplete';
import { Flex } from '../../common/ResourceList/ResourceTable/ResourceTable.styles';
import { useVisualizationContext } from '../../LightdashVisualization/VisualizationProvider';
import SeriesColorPicker from '../Series/SeriesColorPicker';
import { SectionTitle } from './Legend.styles';
import { CollapseWrapper, DeleteButtonTooltip } from './ReferenceLine.styles';
import { ReferenceLineField } from './ReferenceLines';

type Props = {
    index: number;
    items: (Field | TableCalculation | CompiledDimension)[];
    referenceLine: ReferenceLineField;
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

export const ReferenceLine: FC<Props> = ({
    index,
    items,
    referenceLine,
    isDefaultOpen,
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
                    {isDateItem(selectedField) ? (
                        <DateInput2
                            fill
                            value={value}
                            formatDate={(dateValue: Date) =>
                                formatDate(dateValue, undefined, false)
                            }
                            parseDate={(
                                str: string,
                                timeInterval:
                                    | TimeFrames
                                    | undefined = TimeFrames.DAY,
                            ) => {
                                return moment(
                                    str,
                                    getDateFormat(timeInterval),
                                ).toDate();
                            }}
                            defaultValue={new Date().toString()}
                            onChange={(dateValue: string | null) => {
                                if (dateValue) {
                                    setValue(dateValue);
                                    if (selectedField !== undefined)
                                        updateReferenceLine(
                                            dateValue,
                                            selectedField,
                                            label,
                                            lineColor,
                                            referenceLine.data.name,
                                        );
                                }
                            }}
                        />
                    ) : (
                        <InputGroup
                            fill
                            disabled={!isNumericItem(selectedField)}
                            title={
                                isNumericItem(selectedField)
                                    ? ''
                                    : 'Selected field must be of type Number'
                            }
                            value={value}
                            onChange={(e) => {
                                setValue(e.target.value);
                                if (selectedField !== undefined)
                                    updateReferenceLine(
                                        e.target.value,
                                        selectedField,
                                        label,
                                        lineColor,
                                        referenceLine.data.name,
                                    );
                            }}
                            placeholder="Add value for the reference line"
                        />
                    )}
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
