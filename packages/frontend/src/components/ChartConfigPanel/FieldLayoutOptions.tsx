import { Button } from '@blueprintjs/core';
import {
    CartesianSeriesType,
    Field,
    getItemId,
    getMetrics,
    isDimension,
    TableCalculation,
} from '@lightdash/common';
import React, { FC, useCallback, useMemo } from 'react';
import FieldAutoComplete from '../common/Filters/FieldAutoComplete';
import SimpleButton from '../common/SimpleButton';
import { useVisualizationContext } from '../LightdashVisualization/VisualizationProvider';
import {
    AxisFieldDropdown,
    AxisGroup,
    AxisTitle,
    AxisTitleWrapper,
    BlockTooltip,
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
        explore,
    } = useVisualizationContext();

    const pivotDimension = pivotDimensions?.[0];

    const cartesianType = cartesianConfig.dirtyChartType;

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

    const chartInvolvesMetrics = useMemo(() => {
        if (!validCartesianConfig || !explore) return false;

        const {
            layout: { xField, yField },
        } = validCartesianConfig;

        if (!xField || !yField) return false;

        const chartAxes = [xField, ...yField];
        return getMetrics(explore).some((metric) =>
            chartAxes.includes(getItemId(metric)),
        );
    }, [validCartesianConfig, explore]);

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

                {yFields.map((field, index) => {
                    const activeField = yActiveField(field);
                    return (
                        <AxisFieldDropdown key={`${field}-y-axis`}>
                            <FieldAutoComplete
                                fields={
                                    activeField
                                        ? [activeField, ...availableYFields]
                                        : availableYFields
                                }
                                activeField={activeField}
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
            <BlockTooltip
                content="You need at least one metric in your chart to add a group"
                disabled={chartInvolvesMetrics}
            >
                <AxisGroup>
                    <AxisTitle>Group</AxisTitle>
                    <AxisFieldDropdown>
                        <FieldAutoComplete
                            fields={availableDimensions}
                            placeholder="Select a field to group by"
                            activeField={
                                chartInvolvesMetrics
                                    ? groupSelectedField
                                    : undefined
                            }
                            onChange={(item) => {
                                setPivotDimensions([getItemId(item)]);
                            }}
                            disabled={!chartInvolvesMetrics}
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
            </BlockTooltip>
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
