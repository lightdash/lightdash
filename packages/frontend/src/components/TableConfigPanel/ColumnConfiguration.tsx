import { Button, InputGroup } from '@blueprintjs/core';
import React from 'react';
import { useVisualizationContext } from '../LightdashVisualization/VisualizationProvider';
import {
    ColumnConfigurationWrapper,
    ColumnWrapper,
} from './ColumnConfiguration.styles';

export const ColumnConfiguration: React.FC = () => {
    const {
        pivotDimensions,
        tableConfig: {
            selectedItemIds,
            updateColumnProperty,
            getHeader,
            getDefaultColumnLabel,
            isColumnVisible,
            isColumnFrozen,
        },
    } = useVisualizationContext();
    return (
        <ColumnConfigurationWrapper>
            {selectedItemIds?.map((fieldId) => {
                return (
                    <ColumnWrapper key={fieldId}>
                        <InputGroup
                            fill
                            disabled={!isColumnVisible(fieldId)}
                            defaultValue={getHeader(fieldId)}
                            placeholder={getDefaultColumnLabel(fieldId)}
                            onBlur={(e) => {
                                updateColumnProperty(fieldId, {
                                    name: e.currentTarget.value,
                                });
                            }}
                        />
                        {pivotDimensions === undefined && (
                            <Button
                                icon={
                                    isColumnFrozen(fieldId) ? 'unlock' : 'lock'
                                }
                                onClick={() => {
                                    updateColumnProperty(fieldId, {
                                        frozen: !isColumnFrozen(fieldId),
                                    });
                                }}
                            />
                        )}
                        {!pivotDimensions ||
                            (!pivotDimensions.includes(fieldId) && (
                                <Button
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
                            ))}
                    </ColumnWrapper>
                );
            })}
        </ColumnConfigurationWrapper>
    );
};

export default ColumnConfiguration;
