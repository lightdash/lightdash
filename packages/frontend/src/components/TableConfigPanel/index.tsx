import { Button, Checkbox, FormGroup, Tab, Tabs } from '@blueprintjs/core';
import { Popover2 } from '@blueprintjs/popover2';
import {
    fieldId,
    getDimensions,
    getItemId,
    getVisibleFields,
    replaceStringInArray,
} from '@lightdash/common';
import React, { useMemo, useState } from 'react';
import { useExplorerContext } from '../../providers/ExplorerProvider';
import {
    AxisFieldDropdown,
    DeleteFieldButton,
} from '../ChartConfigPanel/ChartConfigPanel.styles';
import FieldAutoComplete from '../common/Filters/FieldAutoComplete';
import { useVisualizationContext } from '../LightdashVisualization/VisualizationProvider';
import ColumnConfiguration from './ColumnConfiguration';
import ConditionalFormatting from './ConditionalFormatting';
import {
    AddPivotButton,
    ConfigWrapper,
    SectionTitle,
} from './TableConfig.styles';

export const MAX_PIVOTS = 3;

export const TableConfigPanel: React.FC = () => {
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
            conditionalFormattings,
            onSetConditionalFormattings,
        },
        setPivotDimensions,
    } = useVisualizationContext();
    const activeFields = useExplorerContext((c) => c.state.activeFields);
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

    const canAddPivot = useMemo(
        () =>
            availableGroupByDimensions.length > 0 &&
            (!pivotDimensions || pivotDimensions.length < MAX_PIVOTS),
        [availableGroupByDimensions.length, pivotDimensions],
    );

    const visibleActiveNumericFields = useMemo(() => {
        return explore
            ? getVisibleFields(explore).filter(
                  (field) =>
                      activeFields.has(fieldId(field)) &&
                      field.type === 'number',
              )
            : [];
    }, [explore, activeFields]);

    return (
        <Popover2
            disabled={disabled}
            content={
                <ConfigWrapper>
                    <Tabs>
                        <Tab
                            id="general"
                            title="General"
                            panel={
                                <>
                                    <SectionTitle>Group</SectionTitle>
                                    {pivotDimensions &&
                                        pivotDimensions.map((pivotKey) => {
                                            // Group series logic
                                            const groupSelectedField =
                                                availableDimensions.find(
                                                    (item) =>
                                                        getItemId(item) ===
                                                        pivotKey,
                                                );

                                            return (
                                                <AxisFieldDropdown
                                                    key={pivotKey}
                                                >
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
                                                            groupSelectedField
                                                        }
                                                        onChange={(item) => {
                                                            setPivotDimensions(
                                                                pivotDimensions
                                                                    ? replaceStringInArray(
                                                                          pivotDimensions,
                                                                          pivotKey,
                                                                          getItemId(
                                                                              item,
                                                                          ),
                                                                      )
                                                                    : [
                                                                          getItemId(
                                                                              item,
                                                                          ),
                                                                      ],
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
                                                                            key !==
                                                                            pivotKey,
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
                                                    getItemId(
                                                        availableGroupByDimensions[0],
                                                    ),
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
                                            onChange={(e) => {
                                                setShowColumnCalculation(
                                                    !showColumnCalculation,
                                                );
                                            }}
                                        />

                                        <Checkbox
                                            label="Show table names"
                                            checked={showTableNames}
                                            onChange={(e) => {
                                                setShowTableName(
                                                    !showTableNames,
                                                );
                                            }}
                                        />

                                        <Checkbox
                                            label="Show row numbers"
                                            checked={!hideRowNumbers}
                                            onChange={(e) => {
                                                setHideRowNumbers(
                                                    !hideRowNumbers,
                                                );
                                            }}
                                        />
                                    </FormGroup>

                                    <SectionTitle>Columns</SectionTitle>

                                    <ColumnConfiguration />
                                </>
                            }
                        />
                        <Tab
                            id="conditional-formatting"
                            title="Conditional formatting"
                            panel={
                                <ConditionalFormatting
                                    fields={visibleActiveNumericFields}
                                    // TODO: support multiple conditional formatting configs
                                    value={conditionalFormattings[0]}
                                    onChange={(conditionalFormatting) =>
                                        onSetConditionalFormattings([
                                            conditionalFormatting,
                                        ])
                                    }
                                />
                            }
                        />
                    </Tabs>
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
