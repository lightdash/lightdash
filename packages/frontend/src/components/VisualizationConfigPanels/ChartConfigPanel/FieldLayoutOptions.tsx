import { Button, ControlGroup, FormGroup } from '@blueprintjs/core';
import {
    CartesianSeriesType,
    Field,
    getItemId,
    isDimension,
    // isSeriesWithMixedChartTypes,
    TableCalculation,
} from '@lightdash/common';
import React, { FC, useCallback, useMemo } from 'react';
import FieldAutoComplete from '../../common/Filters/FieldAutoComplete';
import { useVisualizationContext } from '../../LightdashVisualization/VisualizationProvider';
import {
    FlexJustifyCenter,
    FlexJustifyEnd,
} from '../VisualizationConfigPanel.styles';
import { EquallySizedButtonGroup } from './ChartConfigPanel.styles';

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
    // const isChartTypeTheSameForAllSeries: boolean =
    //     !isSeriesWithMixedChartTypes(
    //         cartesianConfig.dirtyEchartsConfig?.series,
    //     );

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
            <FormGroup
                label={
                    (validCartesianConfig?.layout.flipAxes ? 'Y' : 'X') +
                    '-axis'
                }
                labelFor="axis-field"
            >
                <FieldAutoComplete
                    id="axis-field"
                    fields={items}
                    activeField={xAxisField}
                    onChange={(item) => {
                        setXField(getItemId(item));
                    }}
                />
            </FormGroup>

            <FlexJustifyCenter>
                <Button
                    minimal
                    small
                    icon="swap-vertical"
                    text="Flip axes"
                    onClick={() => setFlipAxis(!dirtyLayout?.flipAxes)}
                />
            </FlexJustifyCenter>

            <FormGroup
                label={
                    (validCartesianConfig?.layout.flipAxes ? 'X' : 'Y') +
                    '-axis'
                }
            >
                <ControlGroup vertical>
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
                        <FlexJustifyEnd>
                            <Button
                                minimal
                                intent="primary"
                                icon="plus"
                                onClick={() =>
                                    addSingleSeries(
                                        getItemId(availableYFields[0]),
                                    )
                                }
                            >
                                Add
                            </Button>
                        </FlexJustifyEnd>
                    )}
                </ControlGroup>
            </FormGroup>

            <FormGroup label="Group" labelFor="group-field">
                <FieldAutoComplete
                    id="group-field"
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
            </FormGroup>

            {pivotDimension && canBeStacked && (
                <FormGroup label="Stacking">
                    <EquallySizedButtonGroup fill>
                        <Button
                            onClick={() => setStacking(false)}
                            active={!isStacked}
                            intent={isStacked ? 'none' : 'primary'}
                        >
                            No stacking
                        </Button>

                        <Button
                            onClick={() => setStacking(true)}
                            active={isStacked}
                            intent={isStacked ? 'primary' : 'none'}
                        >
                            Stack
                        </Button>
                    </EquallySizedButtonGroup>
                </FormGroup>
            )}
        </>
    );
};

export default FieldLayoutOptions;
