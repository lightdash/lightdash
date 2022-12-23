import { Checkbox, Collapse, InputGroup, Label } from '@blueprintjs/core';
import {
    CompiledDimension,
    Field,
    fieldId as getFieldId,
    isField,
    isNumericItem,
    TableCalculation,
} from '@lightdash/common';
import debounce from 'lodash/debounce';
import { FC, useCallback, useMemo, useState } from 'react';
import FieldAutoComplete from '../../common/Filters/FieldAutoComplete';
import { useVisualizationContext } from '../../LightdashVisualization/VisualizationProvider';
import { GridSettings, SectionTitle } from './Legend.styles';

type Props = {
    items: (Field | TableCalculation | CompiledDimension)[];
};

export const ReferenceLines: FC<Props> = ({ items }) => {
    const {
        cartesianConfig: { dirtyLayout, dirtyEchartsConfig, updateSeries },
    } = useVisualizationContext();

    const fieldsInAxes = useMemo(() => {
        const fieldNames = [
            dirtyLayout?.xField,
            ...(dirtyLayout?.yField || []),
        ];
        return items.filter((item) => {
            const fieldId = isField(item) ? getFieldId(item) : item.name;
            // Filter numeric fields (remove if we start supporting other types)
            return fieldNames.includes(fieldId) && isNumericItem(item);
        });
    }, [items, dirtyLayout]);

    const [
        selectedMarklineAxis,
        selectedMarklineValue,
        selectedFieldId,
        selectedMarklineLabel,
    ] = useMemo(() => {
        const serieWithMarkLine = dirtyEchartsConfig?.series?.find(
            (serie) => serie.markLine?.data[0] !== undefined,
        );

        const markLine = serieWithMarkLine?.markLine?.data[0];
        if (markLine === undefined) return [undefined, undefined, undefined];
        const [markLineKey, markLineValue] = Object.entries(markLine)[0];
        const fieldId =
            markLineKey === 'xAxis'
                ? serieWithMarkLine?.encode.xRef.field
                : serieWithMarkLine?.encode.yRef.field;
        const label = serieWithMarkLine?.markLine?.label.formatter;
        return [markLineKey, markLineValue, fieldId, label];
    }, [dirtyEchartsConfig?.series]);

    const [value, setValue] = useState<string | undefined>(
        selectedMarklineValue,
    );

    const [debouncedLabel, setDebouncedLabel] = useState<string>();

    const [label, setLabel] = useState<string | undefined>(
        selectedMarklineLabel,
    );

    const selectedFieldDefault = useMemo(() => {
        if (selectedMarklineAxis === undefined) return;
        return fieldsInAxes.find((field) => {
            const fieldId = isField(field) ? getFieldId(field) : field.name;
            return fieldId === selectedFieldId;
        });
    }, [fieldsInAxes, selectedMarklineAxis, selectedFieldId]);

    const [selectedField, setSelectedField] = useState<
        Field | TableCalculation | CompiledDimension | undefined
    >(selectedFieldDefault);

    const [isOpen, setIsOpen] = useState<boolean>(
        selectedMarklineAxis !== undefined,
    );

    const updateMarkLine = useCallback(
        (updateValue, updateField, updateLabel) => {
            if (updateValue && updateField) {
                const fieldId = isField(updateField)
                    ? getFieldId(updateField)
                    : updateField.name;

                if (dirtyEchartsConfig?.series) {
                    let alreadyAdded = false; // flag to avoid duplication on Xaxis
                    const series = dirtyEchartsConfig?.series.map((serie) => {
                        const axisRef =
                            dirtyLayout?.xField === fieldId
                                ? serie.encode.xRef
                                : serie.encode.yRef;
                        if (axisRef.field === fieldId && !alreadyAdded) {
                            alreadyAdded = true;
                            const axis =
                                dirtyLayout?.xField === fieldId
                                    ? 'xAxis'
                                    : 'yAxis';
                            return {
                                ...serie,
                                markLine: {
                                    symbol: 'none',
                                    lineStyle: {
                                        color: '#000',
                                        width: 3,
                                        type: 'solid',
                                    },
                                    label: updateLabel
                                        ? { formatter: updateLabel }
                                        : {},
                                    data: [{ [axis]: updateValue }],
                                },
                            };
                        } else {
                            // Remove markLine for the rest of series
                            return {
                                ...serie,
                                markLine: undefined,
                            };
                        }
                    });
                    updateSeries(series);
                }
            }
        },
        [updateSeries, dirtyEchartsConfig?.series, dirtyLayout?.xField],
    );
    const removeMarkLine = useCallback(() => {
        if (!dirtyEchartsConfig?.series) return;
        const series = dirtyEchartsConfig?.series.map((serie) => ({
            ...serie,
            markLine: undefined,
        }));
        updateSeries(series);
    }, [updateSeries, dirtyEchartsConfig?.series]);

    const debouncedUpdateLabel = useCallback(
        debounce((updatedLabel: string) => {
            updateMarkLine(value, selectedField, updatedLabel);
        }, 500),
        [value, selectedField],
    );
    return (
        <>
            <Checkbox
                name="show"
                onChange={() => {
                    if (isOpen) removeMarkLine();
                    else updateMarkLine(value, selectedField, label);
                    setIsOpen(!isOpen);
                }}
                checked={isOpen}
            >
                Include reference line
            </Checkbox>

            <Collapse isOpen={isOpen}>
                <SectionTitle>Line 1</SectionTitle>
                <GridSettings>
                    <Label>Field</Label>
                    <FieldAutoComplete
                        fields={fieldsInAxes}
                        activeField={selectedField}
                        onChange={(item) => {
                            setSelectedField(item);

                            updateMarkLine(value, item, label);
                        }}
                    />
                </GridSettings>
                <GridSettings>
                    <Label>Value</Label>

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
                            updateMarkLine(
                                e.target.value,
                                selectedField,
                                label,
                            );
                        }}
                        placeholder="Add value for the reference line"
                    />
                </GridSettings>

                <GridSettings>
                    <Label>Label</Label>

                    <InputGroup
                        fill
                        disabled={!isNumericItem(selectedField)}
                        value={label}
                        placeholder={value}
                        onChange={(e) => {
                            setLabel(e.target.value);
                            debouncedUpdateLabel(e.target.value);
                        }}
                    />
                </GridSettings>
            </Collapse>
        </>
    );
};
