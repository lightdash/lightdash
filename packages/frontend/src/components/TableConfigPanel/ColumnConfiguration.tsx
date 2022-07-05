import React from 'react';
import { useVisualizationContext } from '../LightdashVisualization/VisualizationProvider';
import {
    ColumnConfigurationWrapper,
    ColumnTitle,
    ColumnWrapper,
    ConfigButton,
} from './ColumnConfiguration.styles';

export const ColumnConfiguration: React.FC = () => {
    const {
        tableConfig: {
            columnOrder,
            updateColumnProperty,
            getColumnHeader,
            isFilterVisible,
        },
    } = useVisualizationContext();
    return (
        <ColumnConfigurationWrapper>
            {columnOrder.map((fieldId) => {
                return (
                    <ColumnWrapper>
                        <ColumnTitle>{getColumnHeader(fieldId)}</ColumnTitle>

                        <ConfigButton
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
