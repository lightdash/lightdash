import { Button } from '@blueprintjs/core';
import { Field, getItemId, isField, TableCalculation } from 'common';
import React, { FC, useEffect, useState } from 'react';
import FieldAutoComplete from '../common/Filters/FieldAutoComplete';
import { useVisualizationContext } from '../LightdashVisualization/VisualizationProvider';
import {
    AxisFieldDropdown,
    AxisGroup,
    AxisTitle,
} from './ChartConfigPanel.styles';

type Item = Field | TableCalculation;

type Props = {
    items: (Field | TableCalculation)[];
};

const FieldLayoutOptions: FC<Props> = ({ items }) => {
    const { cartesianConfig, pivotDimensions, setPivotDimensions } =
        useVisualizationContext();
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
        (item) =>
            getItemId(item) ===
            (cartesianConfig.dirtyConfig?.series || [])[0]?.xField,
    );
    const firstYAxisField = items.find(
        (item) =>
            getItemId(item) ===
            (cartesianConfig.dirtyConfig?.series || [])[0]?.yField,
    );
    const groupSelectedField = items.find(
        (item) => getItemId(item) === pivotDimension,
    );

    const yFieldsKeys =
        cartesianConfig.dirtyConfig?.series?.reduce<string[]>(
            (sum, { yField }) => (yField ? [...sum, yField] : sum),
            [],
        ) || [];

    const onXClick = (itemId: any) => {
        const isActive = xAxisField && getItemId(xAxisField) === itemId;
        cartesianConfig.setXField(!isActive ? itemId : undefined);
    };
    const onYClick = (itemId: any) => {
        const isYActive = yFieldsKeys.includes(itemId);
        if (!isYActive) {
            cartesianConfig.addSingleSeries({
                yField: itemId,
            });
        } else {
            const seriesIndex = cartesianConfig.dirtyConfig?.series?.findIndex(
                ({ yField }) => yField === itemId,
            );
            if (seriesIndex !== undefined) {
                cartesianConfig.removeSingleSeries(seriesIndex);
            }
        }
    };

    const onGroupClick = (itemId: any) => {
        const isGroupActive = !!pivotDimension && pivotDimension === itemId;

        return !isGroupActive
            ? setPivotDimensions([itemId])
            : setPivotDimensions(undefined);
    };

    // const onAddField = () => {
    //     setNumberOfFields([...numberOfFields, items]);
    // };

    // const removeItem = (index: number) => {
    //     console.log(index);

    //     const newArr = items.splice(index, 1);
    //     console.log(newArr);
    //     setYInputFields(newArr);
    // };

    // console.log(yInputFields);

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
