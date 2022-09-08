import { Button, FormGroup, Switch } from '@blueprintjs/core';
import { Popover2 } from '@blueprintjs/popover2';
import { fieldId, getDimensions, getItemId } from '@lightdash/common';
import React from 'react';
import FieldAutoComplete from '../../common/Filters/FieldAutoComplete';
import { useVisualizationContext } from '../../LightdashVisualization/VisualizationProvider';
import { ConfigPanelWrapper } from '../VisualizationConfigPanel.styles';
import ColumnConfiguration from './ColumnConfiguration';

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
            rows,
        },
        setPivotDimensions,
    } = useVisualizationContext();
    const pivotDimension = pivotDimensions?.[0];
    const disabled = rows.length <= 0;

    const availableDimensions = explore
        ? getDimensions(explore).filter((field) =>
              resultsData?.metricQuery.dimensions.includes(fieldId(field)),
          )
        : [];

    // Group series logic
    const groupSelectedField = availableDimensions.find(
        (item) => getItemId(item) === pivotDimension,
    );

    return (
        <Popover2
            position="bottom"
            disabled={disabled}
            content={
                <ConfigPanelWrapper>
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

                    <FormGroup
                        label="Show column total"
                        labelFor="show-column-total-switch"
                    >
                        <Switch
                            id="show-column-total-switch"
                            large
                            innerLabelChecked="Yes"
                            innerLabel="No"
                            checked={showColumnCalculation}
                            onChange={(e) => {
                                setShowColumnCalculation(
                                    !showColumnCalculation,
                                );
                            }}
                        />
                    </FormGroup>

                    <FormGroup
                        label="Show table names"
                        labelFor="show-table-name-switch"
                    >
                        <Switch
                            id="show-table-name-switch"
                            large
                            innerLabelChecked="Yes"
                            innerLabel="No"
                            checked={showTableNames}
                            onChange={(e) => {
                                setShowTableName(!showTableNames);
                            }}
                        />
                    </FormGroup>

                    <ColumnConfiguration />
                </ConfigPanelWrapper>
            }
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
