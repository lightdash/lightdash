import { Checkbox, Collapse, InputGroup, Label } from '@blueprintjs/core';
import {
    CompiledDimension,
    Field,
    fieldId as getFieldId,
    isField,
    isNumericItem,
    TableCalculation,
} from '@lightdash/common';
import { FC, useCallback, useEffect, useMemo, useState } from 'react';
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

    const [selectedMarklineAxis, selectedMarklineValue, selectedFieldId] =
        useMemo(() => {
            const serieWithMarkLine = dirtyEchartsConfig?.series?.find(
                (serie) => serie.markLine?.data[0] !== undefined,
            );

            const markLine = serieWithMarkLine?.markLine?.data[0];
            if (markLine === undefined)
                return [undefined, undefined, undefined];
            const [markLineKey, markLineValue] = Object.entries(markLine)[0];
            const fieldId =
                markLineKey === 'xAxis'
                    ? serieWithMarkLine?.encode.xRef.field
                    : serieWithMarkLine?.encode.yRef.field;
            return [markLineKey, markLineValue, fieldId];
        }, [dirtyEchartsConfig?.series]);

    const [value, setValue] = useState<string | undefined>(
        selectedMarklineValue,
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
        (updateValue, updateField) => {
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
                                    label: {},
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

    return (
        <>
            <Checkbox
                name="show"
                onChange={() => setIsOpen(!isOpen)}
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

                            updateMarkLine(value, item);
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
                            updateMarkLine(e.target.value, selectedField);
                        }}
                        placeholder="Add value for the reference line"
                    />
                </GridSettings>
            </Collapse>
        </>
    );
};
