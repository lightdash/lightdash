import { Button, InputGroup } from '@blueprintjs/core';
import React from 'react';
import { useVisualizationContext } from '../LightdashVisualization/VisualizationProvider';
import {
    ColumnConfigurationWrapper,
    ColumnWrapper,
} from './ColumnConfiguration.styles';

export const ColumnConfiguration: React.FC = () => {
    const {
        tableConfig: {
            columnOrder,
            updateColumnProperty,
            getHeader,
            isFilterVisible,
        },
    } = useVisualizationContext();
    return (
        <ColumnConfigurationWrapper>
            {columnOrder.map((fieldId) => {
                return (
                    <ColumnWrapper>
                        <InputGroup
                            fill
                            disabled={!isFilterVisible(fieldId)}
                            placeholder={getHeader(fieldId)}
                            onChange={(e) => {
                                updateColumnProperty(fieldId, {
                                    name: e.currentTarget.value,
                                });
                            }}
                        />

                        <Button
                            icon={
                                isFilterVisible(fieldId)
                                    ? 'eye-off'
                                    : 'eye-open'
                            }
                            onClick={() => {
                                updateColumnProperty(fieldId, {
                                    visible: !isFilterVisible(fieldId),
                                });
                            }}
                        />
                    </ColumnWrapper>
                );
            })}
        </ColumnConfigurationWrapper>
    );
};

export default ColumnConfiguration;
