import { Button, Switch } from '@blueprintjs/core';
import { Popover2 } from '@blueprintjs/popover2';
import React, { useState } from 'react';
import { useVisualizationContext } from '../LightdashVisualization/VisualizationProvider';
import ColumnConfiguration from './ColumnConfiguration';
import { ConfigWrapper } from './TableConfig.styles';

export const TableConfigPanel: React.FC = () => {
    const {
        tableConfig: {
            columnOrder,
            showTableNames,
            setShowTableName,
            headers,
            columnProperties,
            updateColumnProperty,
        },
    } = useVisualizationContext();
    const [isOpen, setIsOpen] = useState(false);

    return (
        <Popover2
            content={
                <ConfigWrapper>
                    <Switch
                        checked={showTableNames}
                        label="Show table names"
                        onChange={(e) => {
                            setShowTableName(!showTableNames);
                        }}
                    />

                    <ColumnConfiguration
                        fieldIds={columnOrder}
                        columnProperties={columnProperties}
                        updateColumnProperty={updateColumnProperty}
                    />
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
