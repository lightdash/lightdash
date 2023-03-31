import { Checkbox, FormGroup } from '@blueprintjs/core';
import {
    fieldId,
    getDimensions,
    getItemId,
    replaceStringInArray,
} from '@lightdash/common';
import { FC, useMemo } from 'react';
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
            showColumnCalculation,
            showTableNames,
            hideRowNumbers,
            setShowTableName,
            setShowColumnCalculation,
            setHideRowNumbers,
            metricsAsRows,
            setMetricsAsRows,
            canUseMetricsAsRows,
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
                            />
                            {groupSelectedField && (
                                <DeleteFieldButton
                                    minimal
                                    icon="cross"
                                    onClick={() => {
                                        setPivotDimensions(
                                            pivotDimensions.filter(
                                                (key) => key !== pivotKey,
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

            <FormGroup>
                <Checkbox
                    label="Show column total"
                    checked={showColumnCalculation}
                    onChange={() => {
                        setShowColumnCalculation(!showColumnCalculation);
                    }}
                />

                <Checkbox
                    label="Show table names"
                    checked={showTableNames}
                    onChange={() => {
                        setShowTableName(!showTableNames);
                    }}
                />

                <Checkbox
                    label="Show row numbers"
                    checked={!hideRowNumbers}
                    onChange={() => {
                        setHideRowNumbers(!hideRowNumbers);
                    }}
                />

                {canUseMetricsAsRows && (
                    <Checkbox
                        label="Show metrics as rows"
                        checked={metricsAsRows}
                        onChange={() => {
                            setMetricsAsRows(!metricsAsRows);
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
