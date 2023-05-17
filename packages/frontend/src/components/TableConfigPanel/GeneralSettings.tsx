import { Checkbox, FormGroup } from '@blueprintjs/core';
import {
    CompiledDimension,
    fieldId,
    getDimensions,
    getItemId,
    replaceStringInArray,
} from '@lightdash/common';
import { FC, useCallback, useMemo } from 'react';
import {
    AxisFieldDropdown,
    DeleteFieldButton,
} from '../ChartConfigPanel/ChartConfigPanel.styles';
import FieldAutoComplete from '../common/Filters/FieldAutoComplete';
import { useVisualizationContext } from '../LightdashVisualization/VisualizationProvider';
import ColumnConfiguration from './ColumnConfiguration';
import { AddPivotButton, SectionTitle } from './TableConfig.styles';

export const MAX_PIVOTS = 3;

const GeneralSettings: FC = () => {
    const {
        explore,
        resultsData,
        pivotDimensions,
        tableConfig: {
            showTableNames,
            setShowTableNames,
            hideRowNumbers,
            setHideRowNumbers,
            showColumnCalculation,
            setShowColumnCalculation,
            showRowCalculation,
            setShowRowCalculation,
            metricsAsRows,
            setMetricsAsRows,
            canUsePivotTable,
        },
        setPivotDimensions,
    } = useVisualizationContext();

    const {
        metricQuery: { dimensions },
    } = resultsData || { metricQuery: { dimensions: [] as string[] } };

    const availableDimensions = useMemo(
        () =>
            explore
                ? getDimensions(explore).filter((field) =>
                      dimensions.includes(fieldId(field)),
                  )
                : [],
        [explore, dimensions],
    );

    const availableGroupByDimensions = useMemo(
        () =>
            availableDimensions.filter(
                (item) => !pivotDimensions?.includes(getItemId(item)),
            ),
        [availableDimensions, pivotDimensions],
    );

    const canAddPivot = useMemo(
        () =>
            availableGroupByDimensions.length > 0 &&
            (!pivotDimensions || pivotDimensions.length < MAX_PIVOTS),
        [availableGroupByDimensions.length, pivotDimensions],
    );

    const handleToggleMetricsAsRows = useCallback(() => {
        const newValue = !metricsAsRows;

        if (newValue) {
            setShowColumnCalculation(showRowCalculation);
            setShowRowCalculation(showColumnCalculation);
        } else {
            setShowColumnCalculation(showRowCalculation);
            setShowRowCalculation(showColumnCalculation);
        }

        setMetricsAsRows(newValue);
    }, [
        metricsAsRows,
        setMetricsAsRows,
        showColumnCalculation,
        setShowColumnCalculation,
        showRowCalculation,
        setShowRowCalculation,
    ]);

    const handleAddPivotDimension = useCallback(
        (item: CompiledDimension, pivotKey: string) => {
            setPivotDimensions(
                pivotDimensions
                    ? replaceStringInArray(
                          pivotDimensions,
                          pivotKey,
                          getItemId(item),
                      )
                    : [getItemId(item)],
            );
        },
        [pivotDimensions, setPivotDimensions],
    );

    const handleRemovePivotDimension = useCallback(
        (pivotKey: string) => {
            const newPivotDimensions = pivotDimensions?.filter(
                (key) => key !== pivotKey,
            );

            if (
                metricsAsRows &&
                (!newPivotDimensions || newPivotDimensions.length === 0)
            ) {
                handleToggleMetricsAsRows();
            }

            setPivotDimensions(newPivotDimensions);
        },

        [
            pivotDimensions,
            setPivotDimensions,
            metricsAsRows,
            handleToggleMetricsAsRows,
        ],
    );

    return (
        <>
            <SectionTitle>Pivot column</SectionTitle>
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
                                activeField={groupSelectedField}
                                onChange={(item) => {
                                    handleAddPivotDimension(item, pivotKey);
                                }}
                            />
                            {groupSelectedField && (
                                <DeleteFieldButton
                                    minimal
                                    icon="cross"
                                    onClick={() => {
                                        handleRemovePivotDimension(pivotKey);
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

            <FormGroup>
                <Checkbox
                    label="Show table names"
                    checked={showTableNames}
                    onChange={() => {
                        setShowTableNames(!showTableNames);
                    }}
                />

                <Checkbox
                    label="Show row numbers"
                    checked={!hideRowNumbers}
                    onChange={() => {
                        setHideRowNumbers(!hideRowNumbers);
                    }}
                />

                {canUsePivotTable ? (
                    <Checkbox
                        label="Show metrics as rows"
                        checked={metricsAsRows}
                        onChange={() => handleToggleMetricsAsRows()}
                    />
                ) : null}

                {canUsePivotTable && metricsAsRows ? (
                    <Checkbox
                        label="Show row total"
                        checked={showRowCalculation}
                        onChange={() => {
                            setShowRowCalculation(!showRowCalculation);
                        }}
                    />
                ) : (
                    <Checkbox
                        label="Show column total"
                        checked={showColumnCalculation}
                        onChange={() => {
                            setShowColumnCalculation(!showColumnCalculation);
                        }}
                    />
                )}
            </FormGroup>

            <SectionTitle>Columns</SectionTitle>

            <ColumnConfiguration />
        </>
    );
};

export default GeneralSettings;
