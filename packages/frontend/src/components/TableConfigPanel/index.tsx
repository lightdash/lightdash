import { Button, Label, Switch } from '@blueprintjs/core';
import { Popover2 } from '@blueprintjs/popover2';
import React, { useState } from 'react';
import { useVisualizationContext } from '../LightdashVisualization/VisualizationProvider';
import ColumnConfiguration from './ColumnConfiguration';
import { ConfigWrapper } from './TableConfig.styles';

export const TableConfigPanel: React.FC = () => {
    const {
        tableConfig: { showTableNames, setShowTableName },
    } = useVisualizationContext();
    const [isOpen, setIsOpen] = useState(false);

    return (
        <Popover2
            content={
                <ConfigWrapper>
                    <Label>Show table names</Label>
                    <Switch
                        large
                        innerLabelChecked="Yes"
                        innerLabel="No"
                        checked={showTableNames}
                        onChange={(e) => {
                            setShowTableName(!showTableNames);
                        }}
                    />
                    <Label>Columns</Label>

                    <ColumnConfiguration />
                </ConfigWrapper>
            }
            interactionKind="click"
            isOpen={isOpen}
            onInteraction={setIsOpen}
            position="bottom"
            lazy={false}
        >
            <Button minimal rightIcon="caret-down" text="Configure" />
        </Popover2>
    );
};

export default TableConfigPanel;
