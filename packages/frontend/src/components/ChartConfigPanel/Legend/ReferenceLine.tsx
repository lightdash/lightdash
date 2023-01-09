import {
    Button,
    Checkbox,
    Collapse,
    InputGroup,
    Label,
} from '@blueprintjs/core';
import {
    CompiledDimension,
    Field,
    fieldId as getFieldId,
    isField,
    isNumericItem,
    MarkLine,
    MarkLineData,
    TableCalculation,
} from '@lightdash/common';
import debounce from 'lodash/debounce';
import { FC, useCallback, useMemo, useState } from 'react';
import FieldAutoComplete from '../../common/Filters/FieldAutoComplete';
import { useVisualizationContext } from '../../LightdashVisualization/VisualizationProvider';
import SeriesColorPicker from '../Series/SeriesColorPicker';
import { GridSettings, SectionTitle } from './Legend.styles';

type Props = {
    index: number;
    items: (Field | TableCalculation | CompiledDimension)[];
    referenceLine: MarkLineData;
    updateReferenceLine: (
        value: string,
        field: Field | TableCalculation | CompiledDimension,
        label: string | undefined,
        lineColor: string,
        lineId: string,
    ) => void;
    removeReferenceLine: (index: number) => void;
};

export const ReferenceLine: FC<Props> = ({
    index,
    items,
    referenceLine,
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
            // Filter numeric fields (remove if we start supporting other types)
            return fieldNames.includes(fieldId) && isNumericItem(item);
        });
    }, [items, dirtyLayout]);

    const [
        selectedMarklineAxis,
        selectedMarklineValue,
        selectedFieldId,
        selectedMarklineLabel,
        selectedColor,
    ] = useMemo(() => {
        const serieWithMarkLine = dirtyEchartsConfig?.series?.find(
            (serie) =>
                serie.markLine?.data.find(
                    (data) => data.name === referenceLine.name,
                ) !== undefined,
        );

        //  const markLine = serieWithMarkLine?.markLine?.data[0];
        const markLineKey = 'xAxis' in referenceLine ? 'xAxis' : 'yAxis';
        const markLineValue = referenceLine[markLineKey];
        const fieldId =
            markLineKey === 'xAxis'
                ? serieWithMarkLine?.encode.xRef.field
                : serieWithMarkLine?.encode.yRef.field;
        const label = referenceLine.label.formatter;
        const color = referenceLine.lineStyle?.color;
        return [markLineKey, markLineValue, fieldId, label, color];
    }, [dirtyEchartsConfig?.series, referenceLine]);

    const [value, setValue] = useState<string | undefined>(
        selectedMarklineValue,
    );

    const [label, setLabel] = useState<string | undefined>(
        selectedMarklineLabel,
    );

    const [lineColor, setLineColor] = useState<string>(selectedColor || '#000');

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

    const refreshReferenceLine = useCallback(
        (
            updateValue: string,
            updateField: Field | TableCalculation | CompiledDimension,
            updateLabel: string | undefined,
            updateColor: string | undefined,
        ) => {
            if (updateValue !== undefined && updateField !== undefined)
                updateReferenceLine(
                    updateValue,
                    updateField,
                    updateLabel || label,
                    updateColor || lineColor,
                    referenceLine.name,
                );
        },
        [referenceLine.name, lineColor, label, updateReferenceLine],
    );

    const debouncedUpdateLabel = useCallback(
        debounce((updatedLabel: string) => {
            if (value !== undefined && selectedField !== undefined)
                refreshReferenceLine(
                    value,
                    selectedField,
                    updatedLabel,
                    lineColor,
                );
        }, 500),
        [value, selectedField, refreshReferenceLine],
    );

    return (
        <>
            <Collapse isOpen={true}>
                <SectionTitle>Line {index}</SectionTitle>

                <GridSettings>
                    <Label>Field</Label>
                    <FieldAutoComplete
                        fields={fieldsInAxes}
                        activeField={selectedField}
                        onChange={(item) => {
                            setSelectedField(item);

                            if (value !== undefined)
                                refreshReferenceLine(
                                    value,
                                    item,
                                    label,
                                    lineColor,
                                );
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
                            if (selectedField !== undefined)
                                refreshReferenceLine(
                                    e.target.value,
                                    selectedField,
                                    label,
                                    lineColor,
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

                <GridSettings>
                    <Label>Color</Label>

                    <SeriesColorPicker
                        color={lineColor}
                        onChange={(color) => {
                            setLineColor(color);
                            if (
                                value !== undefined &&
                                selectedField !== undefined
                            )
                                refreshReferenceLine(
                                    value,
                                    selectedField,
                                    label,
                                    color,
                                );
                        }}
                    />
                    <Button
                        style={{ marginLeft: 'auto' }}
                        minimal
                        icon="trash"
                        onClick={() => removeReferenceLine(index)}
                    />
                </GridSettings>
            </Collapse>
        </>
    );
};
