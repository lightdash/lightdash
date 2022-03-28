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
            updateYField,
        },
        pivotDimensions,
        setPivotDimensions,
    } = useVisualizationContext();
    const [activeYField, setActiveYField] = useState<Item>();
    const [yInputFields, setYInputFields] = useState([items]);
    const pivotDimension = pivotDimensions?.[0];
    const [yFieldsKeys, setYFieldKeys] = useState(dirtyLayout?.yField || []);

    useEffect(() => {
        if (dirtyLayout) {
            setYFieldKeys(dirtyLayout?.yField || []);
        }
    }, [dirtyLayout?.yField]);

    // X axis logic
    const xAxisField = items.find(
        (item) => getItemId(item) === dirtyLayout?.xField,
    );

    const onXClick = (itemId: any) => {
        const isActive = xAxisField && getItemId(xAxisField) === itemId;
        setXField(!isActive ? itemId : undefined);
    };

    // Y axis logic
    const yActiveField = (field: string) => {
        return items.find((item) => field.includes(item.name));
    };

    const availableYFields = () => {
        return items.filter(
            (item) => !dirtyLayout?.yField?.includes(getItemId(item)),
        );
    };

    const onAddField = () => {
        addSingleSeries(getItemId(availableYFields()[0]));
    };

    // Group series logic
    const groupSelectedField = items.find(
        (item) => getItemId(item) === pivotDimension,
    );

    const onGroupClick = (itemId: any) => {
        const isGroupActive = !!pivotDimension && pivotDimension === itemId;

        return !isGroupActive
            ? setPivotDimensions([itemId])
            : setPivotDimensions(undefined);
    };

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

                {dirtyLayout?.yField
                    ? dirtyLayout?.yField.map((field, index) => (
                          <AxisFieldDropdown key={`${index}-y-axis`}>
                              <FieldAutoComplete
                                  fields={availableYFields()}
                                  activeField={yActiveField(field)}
                                  onChange={(item) => {
                                      if (isField(item)) {
                                          updateYField(index, getItemId(item));
                                      }
                                  }}
                              />
                              {dirtyLayout.yField?.length !== 1 && (
                                  <DeleteFieldButton
                                      minimal
                                      icon="cross"
                                      onClick={() => {
                                          removeSingleSeries(index);
                                      }}
                                  />
                              )}
                          </AxisFieldDropdown>
                      ))
                    : null}
                {items.length > yFieldsKeys.length && (
                    <Button
                        minimal
                        intent="primary"
                        onClick={() => onAddField()}
                    >
                        + Add
                    </Button>
                )}
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
