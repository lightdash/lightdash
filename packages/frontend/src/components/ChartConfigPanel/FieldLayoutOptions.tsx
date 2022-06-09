import { Button } from '@blueprintjs/core';
import { Field, getItemId, TableCalculation } from '@lightdash/common';
import React, { FC, useCallback, useMemo } from 'react';
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
        cartesianConfig,
        setPivotDimensions,
    } = useVisualizationContext();
    const pivotDimension = pivotDimensions?.[0];

    const canBeStacked =
        cartesianConfig.dirtyChartType !== 'line' &&
        cartesianConfig.dirtyChartType !== 'scatter';

    // X axis logic
    const xAxisField = items.find(
        (item) => getItemId(item) === dirtyLayout?.xField,
    );

    // Y axis logic
    const yFields = dirtyLayout?.yField || [];

    const yActiveField = useCallback(
        (field: string) => {
            return items.find((item) => getItemId(item) === field);
        },
        [items],
    );

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
                        }-axis`}
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
                    }-axis`}
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
                        placeholder="Select a field to group by"
                        activeField={groupSelectedField}
                        onChange={(item) => {
                            setPivotDimensions([getItemId(item)]);
                        }}
                    />
                    {groupSelectedField && (
                        <DeleteFieldButton
                            minimal
                            icon="cross"
                            onClick={() => {
                                setPivotDimensions([]);
                            }}
                        />
                    )}
                </AxisFieldDropdown>
            </AxisGroup>
            {pivotDimension && canBeStacked && (
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
