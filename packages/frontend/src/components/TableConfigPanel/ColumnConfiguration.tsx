import { ColumnProperties } from '@lightdash/common';
import React from 'react';
import {
    ColumnConfigurationWrapper,
    ColumnTitle,
    ColumnWrapper,
    ConfigButton,
} from './ColumnConfiguration.styles';

type ColumnConfigurationProps = {
    fieldIds: string[];
    columnProperties: ColumnProperties[];
    updateColumnProperty: (
        fieldId: string,
        properties: Partial<ColumnProperties>,
    ) => void;
};
export const ColumnConfiguration: React.FC<ColumnConfigurationProps> = ({
    fieldIds,
    columnProperties,
    updateColumnProperty,
}) => {
    return (
        <ColumnConfigurationWrapper>
            {fieldIds.map((fieldId) => {
                const properties = columnProperties.find(
                    (column) => column.field === fieldId,
                );
                return (
                    <ColumnWrapper>
                        <ColumnTitle>
                            {' '}
                            {properties?.field || fieldId}
                        </ColumnTitle>

                        <ConfigButton
                            icon={properties?.visible ? 'eye-open' : 'eye-off'}
                            onClick={() => {
                                updateColumnProperty(fieldId, {
                                    visible: !properties?.visible,
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
