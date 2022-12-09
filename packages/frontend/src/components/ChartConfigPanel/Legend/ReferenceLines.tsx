import { InputGroup, Label, NumericInput } from '@blueprintjs/core';
import {
    CompiledDimension,
    Field,
    fieldId as getFieldId,
    isField,
    TableCalculation,
} from '@lightdash/common';
import { FC, useEffect, useMemo, useState } from 'react';
import FieldAutoComplete from '../../common/Filters/FieldAutoComplete';
import { useVisualizationContext } from '../../LightdashVisualization/VisualizationProvider';
import { GridSettings, SectionTitle } from './Legend.styles';

type Props = {
    items: (Field | TableCalculation | CompiledDimension)[];
};

export const ReferenceLines: FC<Props> = ({ items }) => {
    const {
        cartesianConfig: { dirtyLayout, setReferenceLines },
    } = useVisualizationContext();

    const fieldNames = [dirtyLayout?.xField, ...(dirtyLayout?.yField || [])];
    //TODO filter items only available in axes

    const [selectedField, setSelectedField] = useState<
        Field | TableCalculation | CompiledDimension
    >();

    const [axis, setAxis] = useState<string>();
    const [value, setValue] = useState<string>();

    useEffect(() => {
        if (axis && value) setReferenceLines([{ [axis]: value }]);
    }, [axis, value, setReferenceLines]);

    return (
        <>
            {' '}
            <SectionTitle>Line 1</SectionTitle>
            <GridSettings>
                <Label>Field</Label>
                <FieldAutoComplete
                    fields={items}
                    activeField={selectedField}
                    onChange={(item) => {
                        setSelectedField(item);
                        const fieldId = isField(item)
                            ? getFieldId(item)
                            : item.name;
                        if (dirtyLayout?.xField === fieldId) setAxis('xAxis');
                        else setAxis('yAxis');
                    }}
                />
            </GridSettings>
            <GridSettings>
                <Label>Value</Label>

                <NumericInput
                    fill
                    value={value}
                    onValueChange={(number) => {
                        setValue(`${number}`);
                    }}
                    placeholder="A few words to give your team some context"
                />
            </GridSettings>
        </>
    );
};
