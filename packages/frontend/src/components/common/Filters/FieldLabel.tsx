import {
    AdditionalMetric,
    Field,
    isAdditionalMetric,
    isField,
    TableCalculation,
} from '@lightdash/common';
import { Text } from '@mantine/core';
import { FC } from 'react';

interface FieldLabelProps {
    item: Field | TableCalculation | AdditionalMetric;
}

const FieldLabel: FC<FieldLabelProps> = ({ item }) => {
    return (
        <Text span>
            {isField(item) ? `${item.tableLabel} ` : ''}

            <Text span fw={500}>
                {isField(item) || isAdditionalMetric(item)
                    ? item.label
                    : item.displayName}
            </Text>
        </Text>
    );
};

export default FieldLabel;
