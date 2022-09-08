import { Button, InputGroup } from '@blueprintjs/core';
import React from 'react';
import { useVisualizationContext } from '../../LightdashVisualization/VisualizationProvider';
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
        },
    } = useVisualizationContext();
    const pivotDimension = pivotDimensions?.[0];
    return (
        <ColumnConfigurationWrapper>
            {selectedItemIds.map((fieldId) => {
                return (
                    <ColumnWrapper>
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

                        {fieldId !== pivotDimension && (
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
                        )}
                    </ColumnWrapper>
                );
            })}
        </ColumnConfigurationWrapper>
    );
};

export default ColumnConfiguration;
