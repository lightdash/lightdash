import { Button, InputGroup } from '@blueprintjs/core';
import React from 'react';
import { useVisualizationContext } from '../../LightdashVisualization/VisualizationProvider';

export const ColumnConfiguration: React.FC = () => {
    const {
        pivotDimensions,
        tableConfig: {
            selectedItemIds,
            updateColumnProperty,
            getHeader,
            getDefaultColumnLabel,
            isColumnVisible,
        },
    } = useVisualizationContext();
    const pivotDimension = pivotDimensions?.[0];
    return (
        <>
            {selectedItemIds.map((fieldId) => (
                <InputGroup
                    key={fieldId}
                    fill
                    disabled={!isColumnVisible(fieldId)}
                    defaultValue={getHeader(fieldId)}
                    placeholder={getDefaultColumnLabel(fieldId)}
                    rightElement={
                        fieldId === pivotDimension ? undefined : (
                            <Button
                                minimal
                                icon={
                                    isColumnVisible(fieldId)
                                        ? 'eye-off'
                                        : 'eye-open'
                                }
                                onClick={() => {
                                    updateColumnProperty(fieldId, {
                                        visible: !isColumnVisible(fieldId),
                                    });
                                }}
                            />
                        )
                    }
                    onBlur={(e) => {
                        updateColumnProperty(fieldId, {
                            name: e.currentTarget.value,
                        });
                    }}
                />
            ))}
        </>
    );
};

export default ColumnConfiguration;
