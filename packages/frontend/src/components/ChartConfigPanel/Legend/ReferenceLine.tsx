import { Checkbox, Collapse, InputGroup, Label } from '@blueprintjs/core';
import {
    CompiledDimension,
    Field,
    fieldId as getFieldId,
    isField,
    isNumericItem,
    MarkLine,
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
    markLine: MarkLine;
    updateReferenceLine: (
        value: string,
        field: Field | TableCalculation | CompiledDimension,
        label: string | undefined,
        lineColor: string,
    ) => void;
};

export const ReferenceLine: FC<Props> = ({
    index,
    items,
    markLine,
    updateReferenceLine,
}) => {
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
        selectedColor,
    ] = useMemo(() => {
        const serieWithMarkLine = dirtyEchartsConfig?.series?.find(
            (serie) => serie.markLine === markLine,
        );

        //  const markLine = serieWithMarkLine?.markLine?.data[0];
        if (markLine.data.length === 0) return [];
        const [markLineKey, markLineValue] = Object.entries(
            markLine.data[0],
        )[0];
        const fieldId =
            markLineKey === 'xAxis'
                ? serieWithMarkLine?.encode.xRef.field
                : serieWithMarkLine?.encode.yRef.field;
        const label = ''; //serieWithMarkLine?.markLine?.data?..formatter;
        const color = ''; //serieWithMarkLine?.markLine?.lineStyle.color;
        return [markLineKey, markLineValue, fieldId, label, color];
    }, [dirtyEchartsConfig?.series, markLine]);

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

    const debouncedUpdateLabel = useCallback(
        debounce((updatedLabel: string) => {
            if (value !== undefined && selectedField !== undefined)
                updateReferenceLine(
                    value,
                    selectedField,
                    updatedLabel,
                    lineColor,
                );
        }, 500),
        [value, selectedField],
    );
    return (
        <>
            <SectionTitle>Line {index}</SectionTitle>

            <GridSettings>
                <Label>Field</Label>
                <FieldAutoComplete
                    fields={fieldsInAxes}
                    activeField={selectedField}
                    onChange={(item) => {
                        setSelectedField(item);

                        if (value !== undefined)
                            updateReferenceLine(value, item, label, lineColor);
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
                            updateReferenceLine(
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
                        if (value !== undefined && selectedField !== undefined)
                            updateReferenceLine(
                                value,
                                selectedField,
                                label,
                                color,
                            );
                    }}
                />
            </GridSettings>
        </>
    );
};
