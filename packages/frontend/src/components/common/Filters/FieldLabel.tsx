import {
    AdditionalMetric,
    CustomDimension,
    Field,
    isAdditionalMetric,
    isCustomDimension,
    isField,
    TableCalculation,
} from '@lightdash/common';
import { Text } from '@mantine/core';
import { FC } from 'react';

interface FieldLabelProps {
    item: Field | TableCalculation | AdditionalMetric | CustomDimension;
}

const FieldLabel: FC<FieldLabelProps> = ({ item }) => {
    return (
        <Text span>
            {isField(item) ? `${item.tableLabel} ` : ''}

            <Text span fw={500}>
                {() => {
                    if (isCustomDimension(item)) return item.name;
                    if (isField(item) || isAdditionalMetric(item))
                        return item.label;
                    return item.displayName;
                }}
            </Text>
        </Text>
    );
};

export default FieldLabel;
