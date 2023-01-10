import {
    Button,
    Collapse,
    FormGroup,
    InputGroup,
    Intent,
    Label,
} from '@blueprintjs/core';
import { Tooltip2 } from '@blueprintjs/popover2';
import {
    CompiledDimension,
    Field,
    fieldId as getFieldId,
    isField,
    isNumericItem,
    MarkLineData,
    TableCalculation,
} from '@lightdash/common';
import debounce from 'lodash/debounce';
import { FC, useCallback, useMemo, useState } from 'react';
import FieldAutoComplete from '../../common/Filters/FieldAutoComplete';
import { Flex } from '../../common/ResourceList/ResourceTable/ResourceTable.styles';
import { useVisualizationContext } from '../../LightdashVisualization/VisualizationProvider';
import SeriesColorPicker from '../Series/SeriesColorPicker';
import { GridSettings, SectionTitle } from './Legend.styles';
import { CollapseWrapper, DeleteButtonTooltip } from './ReferenceLine.styles';

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
    removeReferenceLine: (lineId: string) => void;
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

        const markLineKey = 'xAxis' in referenceLine ? 'xAxis' : 'yAxis';
        const markLineValue = referenceLine[markLineKey];
        const fieldId =
            markLineKey === 'xAxis'
                ? serieWithMarkLine?.encode.xRef.field
                : serieWithMarkLine?.encode.yRef.field;
        const label = referenceLine.label?.formatter;
        const color = referenceLine.lineStyle?.color;
        return [markLineKey, markLineValue, fieldId, label, color];
    }, [dirtyEchartsConfig?.series, referenceLine]);

    const [value, setValue] = useState<string | undefined>(
        selectedMarklineValue,
    );

    const [label, setLabel] = useState<string | undefined>(
        selectedMarklineLabel,
    );
    const [isOpen, setIsOpen] = useState<boolean>(true);
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
                    referenceLine.name,
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
                        icon="cross"
                        onClick={() => removeReferenceLine(referenceLine.name)}
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
                                    referenceLine.name,
                                );
                        }}
                    />
                </FormGroup>
                <FormGroup label="Value">
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
                                    referenceLine.name,
                                );
                        }}
                        placeholder="Add value for the reference line"
                    />
                </FormGroup>

                <FormGroup label="Label">
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
                                    referenceLine.name,
                                );
                        }}
                    />
                </FormGroup>
            </CollapseWrapper>
        </>
    );
};
