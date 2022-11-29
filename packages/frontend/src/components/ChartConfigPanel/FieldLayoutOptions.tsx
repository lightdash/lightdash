import { Button } from '@blueprintjs/core';
import {
    CartesianSeriesType,
    Field,
    getItemId,
    isDimension,
    replaceStringInArray,
    TableCalculation,
} from '@lightdash/common';
import { FC, useCallback, useMemo } from 'react';
import FieldAutoComplete from '../common/Filters/FieldAutoComplete';
import SimpleButton from '../common/SimpleButton';
import { useVisualizationContext } from '../LightdashVisualization/VisualizationProvider';
import { MAX_PIVOTS } from '../TableConfigPanel';
import { AddPivotButton } from '../TableConfigPanel/TableConfig.styles';
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
    } = useVisualizationContext();

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
    const availableDimensions = useMemo(() => {
        return items.filter((item) => isDimension(item));
    }, [items]);

    const chartHasMetricOrTableCalc = useMemo(() => {
        if (!validCartesianConfig) return false;

        const {
            layout: { yField },
        } = validCartesianConfig;

        if (!yField) return false;

        return items.some(
            (item) => !isDimension(item) && yField.includes(getItemId(item)),
        );
    }, [validCartesianConfig, items]);

    const availableGroupByDimensions = useMemo(
        () =>
            availableDimensions.filter(
                (item) => !pivotDimensions?.includes(getItemId(item)),
            ),
        [availableDimensions, pivotDimensions],
    );

    const canAddPivot = useMemo(
        () =>
            chartHasMetricOrTableCalc &&
            availableGroupByDimensions.length > 0 &&
            (!pivotDimensions || pivotDimensions.length < MAX_PIVOTS),
        [
            availableGroupByDimensions.length,
            pivotDimensions,
            chartHasMetricOrTableCalc,
        ],
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
                disabled={chartHasMetricOrTableCalc}
            >
                <AxisGroup>
                    <AxisTitle>Group</AxisTitle>
                    {pivotDimensions &&
                        pivotDimensions.map((pivotKey) => {
                            // Group series logic
                            const groupSelectedField = availableDimensions.find(
                                (item) => getItemId(item) === pivotKey,
                            );

                            return (
                                <AxisFieldDropdown key={pivotKey}>
                                    <FieldAutoComplete
                                        fields={
                                            groupSelectedField
                                                ? [
                                                      groupSelectedField,
                                                      ...availableGroupByDimensions,
                                                  ]
                                                : availableGroupByDimensions
                                        }
                                        placeholder="Select a field to group by"
                                        activeField={
                                            chartHasMetricOrTableCalc
                                                ? groupSelectedField
                                                : undefined
                                        }
                                        onChange={(item) => {
                                            setPivotDimensions(
                                                pivotDimensions
                                                    ? replaceStringInArray(
                                                          pivotDimensions,
                                                          pivotKey,
                                                          getItemId(item),
                                                      )
                                                    : [getItemId(item)],
                                            );
                                        }}
                                        disabled={!chartHasMetricOrTableCalc}
                                    />
                                    {groupSelectedField && (
                                        <DeleteFieldButton
                                            minimal
                                            icon="cross"
                                            onClick={() => {
                                                setPivotDimensions(
                                                    pivotDimensions.filter(
                                                        (key) =>
                                                            key !== pivotKey,
                                                    ),
                                                );
                                            }}
                                        />
                                    )}
                                </AxisFieldDropdown>
                            );
                        })}
                    {canAddPivot && (
                        <AddPivotButton
                            minimal
                            intent="primary"
                            onClick={() =>
                                setPivotDimensions([
                                    ...(pivotDimensions || []),
                                    getItemId(availableGroupByDimensions[0]),
                                ])
                            }
                        >
                            + Add
                        </AddPivotButton>
                    )}
                </AxisGroup>
            </BlockTooltip>
            {pivotDimensions && pivotDimensions.length > 0 && canBeStacked && (
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
