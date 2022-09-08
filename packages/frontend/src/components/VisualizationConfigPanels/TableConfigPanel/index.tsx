import { Button, FormGroup, Switch } from '@blueprintjs/core';
import { Popover2 } from '@blueprintjs/popover2';
import { fieldId, getDimensions, getItemId } from '@lightdash/common';
import React, { useState } from 'react';
import FieldAutoComplete from '../../common/Filters/FieldAutoComplete';
import { useVisualizationContext } from '../../LightdashVisualization/VisualizationProvider';
import { AxisFieldDropdown } from '../ChartConfigPanel/ChartConfigPanel.styles';
import {
    ConfigWrapper,
    SectionTitle,
} from '../VisualizationConfigPanel.styles';
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
    const [isOpen, setIsOpen] = useState(false);
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
            disabled={disabled}
            content={
                <ConfigWrapper>
                    <FormGroup label="Group">
                        <AxisFieldDropdown>
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
                        </AxisFieldDropdown>
                    </FormGroup>

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
