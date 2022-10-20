import { Button, Switch } from '@blueprintjs/core';
import { Popover2 } from '@blueprintjs/popover2';
import { fieldId, getDimensions, getItemId } from '@lightdash/common';
import React, { useMemo, useState } from 'react';
import {
    AxisFieldDropdown,
    DeleteFieldButton,
} from '../ChartConfigPanel/ChartConfigPanel.styles';
import FieldAutoComplete from '../common/Filters/FieldAutoComplete';
import { useVisualizationContext } from '../LightdashVisualization/VisualizationProvider';
import ColumnConfiguration from './ColumnConfiguration';
import { ConfigWrapper, SectionTitle } from './TableConfig.styles';

export const TableConfigPanel: React.FC = () => {
    const {
        explore,
        resultsData,
        pivotDimensions,
        tableConfig: {
            showColumnCalculation,
            showTableNames,
            setShowTableName,
            setShowColumnCalculation,
        },
        setPivotDimensions,
    } = useVisualizationContext();
    const [isOpen, setIsOpen] = useState(false);
    const disabled = !resultsData;
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

    return (
        <Popover2
            disabled={disabled}
            content={
                <ConfigWrapper>
                    <SectionTitle>Group</SectionTitle>
                    {pivotDimensions &&
                        pivotDimensions.map((pivotKey) => {
                            // Group series logic
                            const groupSelectedField = availableDimensions.find(
                                (item) => getItemId(item) === pivotKey,
                            );

                            return (
                                <AxisFieldDropdown>
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
                                                    ? pivotDimensions.map(
                                                          (key) =>
                                                              key !== pivotKey
                                                                  ? key
                                                                  : getItemId(
                                                                        item,
                                                                    ),
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
                    {availableGroupByDimensions.length > 0 && (
                        <Button
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
                        </Button>
                    )}
                    <SectionTitle>Show column total</SectionTitle>
                    <Switch
                        large
                        innerLabelChecked="Yes"
                        innerLabel="No"
                        checked={showColumnCalculation}
                        onChange={(e) => {
                            setShowColumnCalculation(!showColumnCalculation);
                        }}
                    />
                    <SectionTitle>Show table names</SectionTitle>
                    <Switch
                        large
                        innerLabelChecked="Yes"
                        innerLabel="No"
                        checked={showTableNames}
                        onChange={(e) => {
                            setShowTableName(!showTableNames);
                        }}
                    />
                    <SectionTitle>Columns</SectionTitle>

                    <ColumnConfiguration />
                </ConfigWrapper>
            }
            interactionKind="click"
            isOpen={isOpen}
            onInteraction={setIsOpen}
            position="bottom"
        >
            <Button
                minimal
                rightIcon="caret-down"
                text="Configure"
                disabled={disabled}
            />
        </Popover2>
    );
};

export default TableConfigPanel;
