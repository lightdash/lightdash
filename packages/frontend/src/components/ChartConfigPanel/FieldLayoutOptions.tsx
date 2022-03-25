import { Button } from '@blueprintjs/core';
import { Field, getItemId, isField, TableCalculation } from 'common';
import React, { FC, useState } from 'react';
import FieldAutoComplete from '../common/Filters/FieldAutoComplete';
import { useVisualizationContext } from '../LightdashVisualization/VisualizationProvider';
import {
    AxisFieldDropdown,
    AxisGroup,
    AxisTitle,
    DeleteFieldButton,
} from './ChartConfigPanel.styles';

type Item = Field | TableCalculation;

type Props = {
    items: (Field | TableCalculation)[];
};

const FieldLayoutOptions: FC<Props> = ({ items }) => {
    const {
        explore,
        resultsData,
        cartesianConfig: {
            dirtyLayout,
            setXField,
            addSingleSeries,
            removeSingleSeries,
        },
        pivotDimensions,
        setPivotDimensions,
    } = useVisualizationContext();
    const [activeYField, setActiveYField] = useState<Item>();
    const pivotDimension = pivotDimensions?.[0];
    console.log(explore);

    const xAxisField = items.find(
        (item) => getItemId(item) === dirtyLayout?.xField,
    );

    const yAxisFields = items.filter((item) => {
        // @ts-ignore
        return item.fieldType === 'metric';
    });
    const firstYAxisField = items.find(
        (item) => getItemId(item) === dirtyLayout?.yField?.[0],
    );
    const groupSelectedField = items.find(
        (item) => getItemId(item) === pivotDimension,
    );

    const yFieldsKeys = dirtyLayout?.yField || [];

    const onXClick = (itemId: any) => {
        const isActive = xAxisField && getItemId(xAxisField) === itemId;
        setXField(!isActive ? itemId : undefined);
    };
    const onYClick = (itemId: any) => {
        const isYActive = yFieldsKeys.includes(itemId);
        if (!isYActive) {
            addSingleSeries(itemId);
        } else {
            const index = yFieldsKeys.findIndex(
                (yField: any) => yField === itemId,
            );
            if (index !== undefined) {
                removeSingleSeries(index);
            }
        }
    };

    const onGroupClick = (itemId: any) => {
        const isGroupActive = !!pivotDimension && pivotDimension === itemId;

        return !isGroupActive
            ? setPivotDimensions([itemId])
            : setPivotDimensions(undefined);
    };

    const onAddField = () => {
        // setYInputFields([...yInputFields, items]);
    };

    // const removeItem = (index: number) => {
    //     console.log(index);
    //     if (index > -1) {
    //         setYInputFields(yInputFields.splice(index, 1));
    //     }
    // };

    return (
        <>
            <AxisGroup>
                <AxisTitle>X axis field</AxisTitle>
                <AxisFieldDropdown>
                    <FieldAutoComplete
                        fields={items}
                        activeField={xAxisField}
                        onChange={(item) => {
                            if (isField(item)) {
                                onXClick(getItemId(item));
                            }
                        }}
                    />
                </AxisFieldDropdown>
            </AxisGroup>
            <AxisGroup>
                <AxisTitle>Y axis field</AxisTitle>

                {yAxisFields.map((field, index) => (
                    <AxisFieldDropdown key={`${index}-y-axis`}>
                        <FieldAutoComplete
                            key={`inputfield-${index}`}
                            fields={items}
                            activeField={field}
                            onChange={(item) => {
                                if (isField(item)) {
                                    setActiveYField(item);
                                    onYClick(getItemId(item));
                                }
                            }}
                        />
                        <DeleteFieldButton
                            minimal
                            icon="cross"
                            onClick={(e) => {
                                //    onYClick();
                            }}
                        />
                    </AxisFieldDropdown>
                ))}

                <Button minimal intent="primary" onClick={() => onAddField()}>
                    + Add
                </Button>
            </AxisGroup>
            <AxisGroup>
                <AxisTitle>Group</AxisTitle>
                <FieldAutoComplete
                    fields={items}
                    activeField={groupSelectedField}
                    onChange={(item) => {
                        if (isField(item)) {
                            onGroupClick(getItemId(item));
                        }
                    }}
                />
            </AxisGroup>
        </>
    );
};

export default FieldLayoutOptions;
