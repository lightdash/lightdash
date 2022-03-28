import { Button } from '@blueprintjs/core';
import {
    CartesianSeriesType,
    Field,
    getItemId,
    TableCalculation,
} from 'common';
import React, { FC, useMemo } from 'react';
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
            dirtyChartType,
            validCartesianConfig,
        },
        pivotDimensions,
        setPivotDimensions,
    } = useVisualizationContext();
    const [activeYField, setActiveYField] = useState<Item>();
    const [yInputFields, setYInputFields] = useState([items]);
    const pivotDimension = pivotDimensions?.[0];

    const isHorizontalBarType =
        dirtyChartType === CartesianSeriesType.BAR &&
        validCartesianConfig?.layout.flipAxes;

    // X axis logic
    const xAxisField = items.find(
        (item) => getItemId(item) === dirtyLayout?.xField,
    );

    // Y axis logic
    const yFields = dirtyLayout?.yField ? dirtyLayout?.yField : [];

    const yActiveField = (field: string) => {
        return items.find((item) => field.includes(item.name));
    };

    const availableYFields = useMemo(() => {
        return items.filter(
            (item) => !dirtyLayout?.yField?.includes(getItemId(item)),
        );
    }, [dirtyLayout?.yField, items]);

    const onAddField = () => {
        addSingleSeries(getItemId(availableYFields[0]));
    };

    // Group series logic
    const groupSelectedField = items.find(
        (item) => getItemId(item) === pivotDimension,
    );
    console.log(dirtyChartType);

    return (
        <>
            <AxisGroup>
                <AxisTitle>{`${
                    isHorizontalBarType ? 'Y' : 'X'
                } axis field`}</AxisTitle>
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
                    {`${isHorizontalBarType ? 'X' : 'Y'} axis field`}
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
                {items.length > yFields.length && (
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
        </>
    );
};

export default FieldLayoutOptions;
