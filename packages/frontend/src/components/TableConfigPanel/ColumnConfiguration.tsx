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
            filterVisible,
        },
    } = useVisualizationContext();
    return (
        <ColumnConfigurationWrapper>
            {columnOrder.map((fieldId) => {
                return (
                    <ColumnWrapper>
                        <InputGroup
                            fill
                            disabled={!filterVisible(fieldId)}
                            defaultValue={getHeader(fieldId)}
                            onBlur={(e) => {
                                updateColumnProperty(fieldId, {
                                    name: e.currentTarget.value,
                                });
                            }}
                        />

                        <Button
                            icon={
                                filterVisible(fieldId) ? 'eye-off' : 'eye-open'
                            }
                            onClick={() => {
                                updateColumnProperty(fieldId, {
                                    visible: !filterVisible(fieldId),
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
