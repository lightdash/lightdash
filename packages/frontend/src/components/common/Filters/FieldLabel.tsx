import {
    isAdditionalMetric,
    isCustomDimension,
    isField,
    type AdditionalMetric,
    type CustomDimension,
    type Field,
    type TableCalculation,
} from '@lightdash/common';
import { Text } from '@mantine/core';
import { type FC } from 'react';

interface FieldLabelProps {
    item: Field | TableCalculation | AdditionalMetric | CustomDimension;
    hideTableName?: boolean;
}

const FieldLabel: FC<FieldLabelProps> = ({ item, hideTableName = false }) => {
    return (
        <Text span>
            {!hideTableName && isField(item) ? `${item.tableLabel} ` : ''}

            <Text span fw={500}>
                {isCustomDimension(item)
                    ? item.name
                    : isField(item) || isAdditionalMetric(item)
                    ? item.label
                    : item.displayName}
            </Text>
        </Text>
    );
};

export default FieldLabel;
