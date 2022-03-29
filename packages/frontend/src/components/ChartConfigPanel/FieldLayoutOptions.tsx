import { Button } from '@blueprintjs/core';
import { Field, getItemId, TableCalculation } from 'common';
import React, { FC, useMemo } from 'react';
import FieldAutoComplete from '../common/Filters/FieldAutoComplete';
import SimpleButton from '../common/SimpleButton';
import { useVisualizationContext } from '../LightdashVisualization/VisualizationProvider';
import {
    AxisFieldDropdown,
    AxisGroup,
    AxisTitle,
    AxisTitleWrapper,
    DeleteFieldButton,
    GridLabel,
    StackButton,
    StackingWrapper,
} from './ChartConfigPanel.styles';

type Props = {
    items: (Field | TableCalculation)[];
};

const FieldLayoutOptions: FC<Props> = ({ items }) => {
    const {
        cartesianConfig: {
            dirtyLayout,
            setXField,
            addSingleSeries,
            removeSingleSeries,
            updateYField,
            validCartesianConfig,
            setStacking,
            isStacked,
            setFlipAxis,
        },
        pivotDimensions,
        setPivotDimensions,
    } = useVisualizationContext();
    const pivotDimension = pivotDimensions?.[0];

    // X axis logic
    const xAxisField = items.find(
        (item) => getItemId(item) === dirtyLayout?.xField,
    );

    // Y axis logic
    const yFields = dirtyLayout?.yField || [];

    const yActiveField = (field: string) => {
        return items.find((item) => field.includes(item.name));
    };

    const availableYFields = useMemo(() => {
        return items.filter(
            (item) => !dirtyLayout?.yField?.includes(getItemId(item)),
        );
    }, [dirtyLayout, items]);

    // Group series logic
    const groupSelectedField = items.find(
        (item) => getItemId(item) === pivotDimension,
    );

    return (
        <>
            <AxisGroup>
                <AxisTitleWrapper>
                    <AxisTitle>
                        {`${
                            validCartesianConfig?.layout.flipAxes ? 'Y' : 'X'
                        } axis field`}
                    </AxisTitle>
                    <SimpleButton
                        text="Flip axes"
                        onClick={() => setFlipAxis(!dirtyLayout?.flipAxes)}
                    />
                </AxisTitleWrapper>
                <AxisFieldDropdown>
                    <FieldAutoComplete
                        fields={items}
                        activeField={xAxisField}
                        onChange={(item) => {
                            setXField(getItemId(item));
                        }}
                    />
                </AxisFieldDropdown>
            </AxisGroup>
            <AxisGroup>
                <AxisTitle>
                    {`${
                        validCartesianConfig?.layout.flipAxes ? 'X' : 'Y'
                    } axis field`}
                </AxisTitle>

                {yFields.map((field, index) => (
                    <AxisFieldDropdown key={`${field}-y-axis`}>
                        <FieldAutoComplete
                            fields={availableYFields}
                            activeField={yActiveField(field)}
                            onChange={(item) => {
                                updateYField(index, getItemId(item));
                            }}
                        />
                        {yFields?.length !== 1 && (
                            <DeleteFieldButton
                                minimal
                                icon="cross"
                                onClick={() => {
                                    removeSingleSeries(index);
                                }}
                            />
                        )}
                    </AxisFieldDropdown>
                ))}
                {availableYFields.length > 0 && (
                    <Button
                        minimal
                        intent="primary"
                        onClick={() =>
                            addSingleSeries(getItemId(availableYFields[0]))
                        }
                    >
                        + Add
                    </Button>
                )}
            </AxisGroup>
            <AxisGroup>
                <AxisTitle>Group</AxisTitle>
                <AxisFieldDropdown>
                    <FieldAutoComplete
                        fields={items}
                        activeField={groupSelectedField}
                        onChange={(item) => {
                            setPivotDimensions([getItemId(item)]);
                        }}
                    />
                    <DeleteFieldButton
                        minimal
                        icon="cross"
                        onClick={() => {
                            setPivotDimensions(undefined);
                        }}
                    />
                </AxisFieldDropdown>
            </AxisGroup>
            {pivotDimension && (
                <AxisGroup>
                    <GridLabel>Stacking</GridLabel>
                    <StackingWrapper fill>
                        <StackButton
                            onClick={() => setStacking(false)}
                            active={!isStacked}
                        >
                            No stacking
                        </StackButton>
                        <StackButton
                            onClick={() => setStacking(true)}
                            active={isStacked}
                        >
                            Stack
                        </StackButton>
                    </StackingWrapper>
                </AxisGroup>
            )}
        </>
    );
};

export default FieldLayoutOptions;
