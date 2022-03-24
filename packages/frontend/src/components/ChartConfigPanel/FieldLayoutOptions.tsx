import { Button } from '@blueprintjs/core';
import { Field, getItemId, isField, TableCalculation } from 'common';
import React, { FC, useEffect, useState } from 'react';
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
    const [yInputFields, setYInputFields] = useState([items]);
    const pivotDimension = pivotDimensions?.[0];

    useEffect(() => {
        items.forEach((item) => {
            if (items.length > yInputFields.length) {
                setYInputFields([...yInputFields, item && items]);
            }
        });
    });

    const xAxisField = items.find(
        (item) => getItemId(item) === dirtyLayout?.xField,
    );

    const yAxisFields = items.filter((item) => {
        // @ts-ignore
        return item.fieldType === 'metric';
    });

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
    console.log(dirtyLayout);
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

                {yInputFields.map((field, index) => (
                    <AxisFieldDropdown key={`${index}-y-axis`}>
                        <FieldAutoComplete
                            key={`inputfield-${index}`}
                            fields={items}
                            activeField={activeYField || firstYAxisField}
                            onChange={(item) => {
                                console.log(item);
                                if (isField(item)) {
                                    setActiveYField(item);
                                    onYClick(getItemId(item));
                                }
                            }}
                        />
                        {index !== 0 && (
                            <Button
                                minimal
                                icon="cross"
                                onClick={(e) => {
                                    e.currentTarget.parentElement?.remove();
                                    //  removeItem(index);
                                }}
                            />
                        )}
                    </AxisFieldDropdown>
                ))}

                <Button
                    minimal
                    intent="primary"
                    //  onClick={() => onAddField()}
                >
                    + Add field
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
