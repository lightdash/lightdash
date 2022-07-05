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
            columnHeader,
            filterVisible,
        },
    } = useVisualizationContext();
    return (
        <ColumnConfigurationWrapper>
            {columnOrder.map((fieldId) => {
                return (
                    <ColumnWrapper>
                        <ColumnTitle>{columnHeader(fieldId)}</ColumnTitle>

                        <ConfigButton
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
