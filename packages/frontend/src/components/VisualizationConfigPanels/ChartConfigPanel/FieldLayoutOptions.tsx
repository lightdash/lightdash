import { Button } from '@blueprintjs/core';
import {
    CartesianSeriesType,
    Field,
    getItemId,
    isDimension,
    isSeriesWithMixedChartTypes,
    TableCalculation,
} from '@lightdash/common';
import React, { FC, useCallback, useMemo } from 'react';
import FieldAutoComplete from '../../common/Filters/FieldAutoComplete';
import SimpleButton from '../../common/SimpleButton';
import { useVisualizationContext } from '../../LightdashVisualization/VisualizationProvider';
import {
    AxisGroup,
    AxisTitle,
    AxisTitleWrapper,
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

    const cartesianType = cartesianConfig.dirtyChartType;
    const isChartTypeTheSameForAllSeries: boolean =
        !isSeriesWithMixedChartTypes(
            cartesianConfig.dirtyEchartsConfig?.series,
        );

    const canBeStacked =
        cartesianType !== CartesianSeriesType.LINE &&
        cartesianType !== CartesianSeriesType.SCATTER &&
        cartesianType !== CartesianSeriesType.AREA;

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

    const availableDimensions = useMemo(() => {
        return items.filter((item) => isDimension(item));
    }, [items]);

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

                <FieldAutoComplete
                    fields={items}
                    activeField={xAxisField}
                    onChange={(item) => {
                        setXField(getItemId(item));
                    }}
                />
            </AxisGroup>

            <AxisGroup>
                <AxisTitle>
                    {`${
                        validCartesianConfig?.layout.flipAxes ? 'X' : 'Y'
                    }-axis`}
                </AxisTitle>

                {yFields.map((field, index) => {
                    const activeField = yActiveField(field);
                    return (
                        <FieldAutoComplete
                            key={`${field}-y-axis`}
                            fields={
                                activeField
                                    ? [activeField, ...availableYFields]
                                    : availableYFields
                            }
                            activeField={activeField}
                            rightElement={
                                yFields?.length === 1 ? undefined : (
                                    <Button
                                        minimal
                                        icon="cross"
                                        onClick={() => {
                                            removeSingleSeries(index);
                                        }}
                                    />
                                )
                            }
                            onChange={(item) => {
                                updateYField(index, getItemId(item));
                            }}
                        />
                    );
                })}
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

                <FieldAutoComplete
                    fields={availableDimensions}
                    placeholder="Select a field to group by"
                    activeField={groupSelectedField}
                    rightElement={
                        groupSelectedField && (
                            <Button
                                minimal
                                icon="cross"
                                onClick={() => {
                                    setPivotDimensions([]);
                                }}
                            />
                        )
                    }
                    onChange={(item) => {
                        setPivotDimensions([getItemId(item)]);
                    }}
                />
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
